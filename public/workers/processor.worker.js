/**
 * processor.worker.js
 * Image filter worker — reads from inputSab, writes to outputSab.
 * Partition: each worker owns [startRow, endRow) exclusively for writes.
 * Reads span the full image (kernel neighborhood access is safe — no write conflict).
 *
 * Progress is reported via Atomics.add on a shared Int32Array (progressSab).
 * Each worker increments its counter per row processed; main thread polls the sum.
 */

'use strict';

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === 'init') {
    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'process') {
    const {
      inputSab, outputSab,
      width, height,
      startRow, endRow,
      filter, params,
      progressSab, workerIndex,
    } = payload;

    const src = new Uint8ClampedArray(inputSab);
    const dst = new Uint8ClampedArray(outputSab);
    const prog = new Int32Array(progressSab);
    const totalRows = endRow - startRow;

    try {
      switch (filter) {
        case 'gaussian-blur':
          applyGaussianBlur(src, dst, width, height, startRow, endRow, params.radius | 0, prog, workerIndex, totalRows);
          break;
        case 'edge-detection':
          applyEdgeDetection(src, dst, width, height, startRow, endRow, prog, workerIndex, totalRows);
          break;
        case 'sharpen':
          applySharpen(src, dst, width, height, startRow, endRow, params.strength, prog, workerIndex, totalRows);
          break;
        case 'grayscale':
          applyGrayscale(src, dst, width, height, startRow, endRow, prog, workerIndex, totalRows);
          break;
        case 'invert':
          applyInvert(src, dst, width, height, startRow, endRow, prog, workerIndex, totalRows);
          break;
        case 'brightness-contrast':
          applyBrightnessContrast(src, dst, width, height, startRow, endRow, params.brightness, params.contrast, prog, workerIndex, totalRows);
          break;
        case 'pixelate':
          applyPixelate(src, dst, width, height, startRow, endRow, params.blockSize | 0, prog, workerIndex, totalRows);
          break;
        case 'emboss':
          applyEmboss(src, dst, width, height, startRow, endRow, prog, workerIndex, totalRows);
          break;
        default:
          // passthrough copy
          for (let y = startRow; y < endRow; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              dst[i] = src[i]; dst[i+1] = src[i+1]; dst[i+2] = src[i+2]; dst[i+3] = src[i+3];
            }
          }
      }
      self.postMessage({ type: 'done', workerIndex });
    } catch (err) {
      self.postMessage({ type: 'error', workerIndex, message: err.message });
    }
  }
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function idx(x, y, width) {
  return (y * width + x) * 4;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function reportProgress(prog, workerIndex, row, totalRows) {
  // Write per-worker progress (0–100) to its slot
  const pct = Math.round(((row + 1) / totalRows) * 100);
  Atomics.store(prog, workerIndex, pct);
}

// ─── Gaussian Blur (separable box-blur approximation, 3 passes) ───────────

function boxBlurH(src, dst, width, height, startRow, endRow, radius) {
  const iarr = 1 / (radius + radius + 1);
  for (let y = startRow; y < endRow; y++) {
    for (let ch = 0; ch < 3; ch++) {
      let ti = idx(0, y, width) + ch;
      let li = ti;
      let ri = ti + radius * 4;
      const fv = src[ti];
      const lv = src[idx(width - 1, y, width) + ch];
      let val = (radius + 1) * fv;
      for (let j = 0; j < radius; j++) val += src[ti + j * 4];
      for (let x = 0; x <= radius; x++) {
        val += src[ri] - fv;
        dst[ti] = Math.round(val * iarr);
        ri += 4; ti += 4;
      }
      for (let x = radius + 1; x < width - radius; x++) {
        val += src[ri] - src[li];
        dst[ti] = Math.round(val * iarr);
        li += 4; ri += 4; ti += 4;
      }
      for (let x = width - radius; x < width; x++) {
        val += lv - src[li];
        dst[ti] = Math.round(val * iarr);
        li += 4; ti += 4;
      }
    }
    // copy alpha
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      dst[i + 3] = src[i + 3];
    }
  }
}

function boxBlurV(src, dst, width, height, startRow, endRow, radius) {
  const iarr = 1 / (radius + radius + 1);
  for (let x = 0; x < width; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let ti = idx(x, startRow, width) + ch;
      let li = ti;
      let ri = ti + radius * width * 4;
      const fv = src[idx(x, startRow, width) + ch];
      const lv = src[idx(x, endRow - 1, width) + ch];
      let val = (radius + 1) * fv;
      for (let j = 0; j < radius; j++) val += src[idx(x, Math.min(startRow + j, endRow - 1), width) + ch];
      for (let y = startRow; y <= Math.min(startRow + radius, endRow - 1); y++) {
        val += (ri < src.length ? src[ri] : lv) - fv;
        dst[ti] = Math.round(val * iarr);
        ri += width * 4; ti += width * 4;
      }
      for (let y = startRow + radius + 1; y < endRow - radius; y++) {
        val += src[ri] - src[li];
        dst[ti] = Math.round(val * iarr);
        li += width * 4; ri += width * 4; ti += width * 4;
      }
      for (let y = Math.max(endRow - radius, startRow + radius + 1); y < endRow; y++) {
        val += lv - src[li];
        dst[ti] = Math.round(val * iarr);
        li += width * 4; ti += width * 4;
      }
    }
  }
}

function applyGaussianBlur(src, dst, width, height, startRow, endRow, radius, prog, workerIndex, totalRows) {
  radius = clamp(radius, 1, 50);
  const passes = 3;
  // Use a temp buffer for the separable passes
  const tmp = new Uint8ClampedArray(src.length);

  // Init dst from src for this region
  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      dst[i] = src[i]; dst[i+1] = src[i+1]; dst[i+2] = src[i+2]; dst[i+3] = src[i+3];
    }
  }

  for (let pass = 0; pass < passes; pass++) {
    // H pass: dst → tmp
    boxBlurH(dst, tmp, width, height, startRow, endRow, radius);
    // V pass: tmp → dst
    boxBlurV(tmp, dst, width, height, startRow, endRow, radius);
    reportProgress(prog, workerIndex, pass * (totalRows / passes) | 0, totalRows);
  }
  reportProgress(prog, workerIndex, totalRows - 1, totalRows);
}

// ─── Edge Detection (Sobel) ─────────────────────────────────────────────────

function applyEdgeDetection(src, dst, width, height, startRow, endRow, prog, workerIndex, totalRows) {
  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);

      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        dst[i] = 0; dst[i+1] = 0; dst[i+2] = 0; dst[i+3] = src[i+3];
        continue;
      }

      // Grayscale neighbors
      const gray = (px) => 0.299 * src[px] + 0.587 * src[px+1] + 0.114 * src[px+2];

      const tl = gray(idx(x-1, y-1, width));
      const tc = gray(idx(x,   y-1, width));
      const tr = gray(idx(x+1, y-1, width));
      const ml = gray(idx(x-1, y,   width));
      const mr = gray(idx(x+1, y,   width));
      const bl = gray(idx(x-1, y+1, width));
      const bc = gray(idx(x,   y+1, width));
      const br = gray(idx(x+1, y+1, width));

      const gx = -tl - 2*ml - bl + tr + 2*mr + br;
      const gy = -tl - 2*tc - tr + bl + 2*bc + br;
      const mag = clamp(Math.sqrt(gx*gx + gy*gy), 0, 255);

      dst[i] = mag; dst[i+1] = mag; dst[i+2] = mag; dst[i+3] = src[i+3];
    }
    reportProgress(prog, workerIndex, y - startRow, totalRows);
  }
}

// ─── Sharpen (unsharp mask kernel) ──────────────────────────────────────────

function applySharpen(src, dst, width, height, startRow, endRow, strength, prog, workerIndex, totalRows) {
  const s = clamp(strength ?? 1, 0, 5);
  const k = [
     0,      -s,        0,
    -s,  1 + 4*s,      -s,
     0,      -s,        0,
  ];

  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        dst[i] = src[i]; dst[i+1] = src[i+1]; dst[i+2] = src[i+2]; dst[i+3] = src[i+3];
        continue;
      }
      for (let ch = 0; ch < 3; ch++) {
        const sum =
          k[0] * src[idx(x-1,y-1,width)+ch] + k[1] * src[idx(x,y-1,width)+ch] + k[2] * src[idx(x+1,y-1,width)+ch] +
          k[3] * src[idx(x-1,y,  width)+ch] + k[4] * src[idx(x,y,  width)+ch] + k[5] * src[idx(x+1,y,  width)+ch] +
          k[6] * src[idx(x-1,y+1,width)+ch] + k[7] * src[idx(x,y+1,width)+ch] + k[8] * src[idx(x+1,y+1,width)+ch];
        dst[i+ch] = clamp(sum, 0, 255);
      }
      dst[i+3] = src[i+3];
    }
    reportProgress(prog, workerIndex, y - startRow, totalRows);
  }
}

// ─── Grayscale ───────────────────────────────────────────────────────────────

function applyGrayscale(src, dst, width, height, startRow, endRow, prog, workerIndex, totalRows) {
  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      const g = clamp(0.299 * src[i] + 0.587 * src[i+1] + 0.114 * src[i+2], 0, 255);
      dst[i] = g; dst[i+1] = g; dst[i+2] = g; dst[i+3] = src[i+3];
    }
    reportProgress(prog, workerIndex, y - startRow, totalRows);
  }
}

// ─── Invert ──────────────────────────────────────────────────────────────────

function applyInvert(src, dst, width, height, startRow, endRow, prog, workerIndex, totalRows) {
  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      dst[i] = 255 - src[i]; dst[i+1] = 255 - src[i+1]; dst[i+2] = 255 - src[i+2]; dst[i+3] = src[i+3];
    }
    reportProgress(prog, workerIndex, y - startRow, totalRows);
  }
}

// ─── Brightness / Contrast ───────────────────────────────────────────────────

function applyBrightnessContrast(src, dst, width, height, startRow, endRow, brightness, contrast, prog, workerIndex, totalRows) {
  const b = (brightness ?? 0);   // –100 to +100
  const c = (contrast ?? 0);     // –100 to +100
  const factor = (259 * (c + 255)) / (255 * (259 - c));

  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      for (let ch = 0; ch < 3; ch++) {
        let v = src[i+ch] + b;
        v = factor * (v - 128) + 128;
        dst[i+ch] = clamp(v, 0, 255);
      }
      dst[i+3] = src[i+3];
    }
    reportProgress(prog, workerIndex, y - startRow, totalRows);
  }
}

// ─── Pixelate ────────────────────────────────────────────────────────────────

function applyPixelate(src, dst, width, height, startRow, endRow, blockSize, prog, workerIndex, totalRows) {
  blockSize = clamp(blockSize, 2, 64);

  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const bx = Math.floor(x / blockSize) * blockSize;
      const by = Math.floor(y / blockSize) * blockSize;
      const si = idx(clamp(bx, 0, width-1), clamp(by, 0, height-1), width);
      const di = idx(x, y, width);
      dst[di] = src[si]; dst[di+1] = src[si+1]; dst[di+2] = src[si+2]; dst[di+3] = src[si+3];
    }
    reportProgress(prog, workerIndex, y - startRow, totalRows);
  }
}

// ─── Emboss ──────────────────────────────────────────────────────────────────

function applyEmboss(src, dst, width, height, startRow, endRow, prog, workerIndex, totalRows) {
  const k = [-2, -1, 0, -1, 1, 1, 0, 1, 2];

  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        dst[i] = 128; dst[i+1] = 128; dst[i+2] = 128; dst[i+3] = src[i+3];
        continue;
      }
      let r = 0, g = 0, b2 = 0;
      let ki = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ni = idx(x+dx, y+dy, width);
          r  += k[ki] * src[ni];
          g  += k[ki] * src[ni+1];
          b2 += k[ki] * src[ni+2];
          ki++;
        }
      }
      dst[i]   = clamp(r  + 128, 0, 255);
      dst[i+1] = clamp(g  + 128, 0, 255);
      dst[i+2] = clamp(b2 + 128, 0, 255);
      dst[i+3] = src[i+3];
    }
    reportProgress(prog, workerIndex, y - startRow, totalRows);
  }
}
