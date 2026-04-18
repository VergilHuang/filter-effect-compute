/**
 * processor.worker.js
 * Image filter worker — Uses WebAssembly (loaded via processor.js) to compute logic.
 * Reads from inputSab, copies to Wasm Memory, computes, writes to outputSab.
 * Implements "Halo Region" memory mapping to eliminate border artifacts.
 */

"use strict";

self.wasmReady = false;

self.Module = {
  // Correctly locate the WASM file instead of using worker relative path
  locateFile: function (path) {
    if (path.endsWith(".wasm")) {
      return "/wasm/" + path;
    }
    return path;
  },
  onRuntimeInitialized: function () {
    self.wasmReady = true;
  },
};

// Import the generated Wasm glue code
importScripts("/wasm/processor.cbae64d8.js");

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === "init") {
    const checkReady = () => {
      if (self.wasmReady) {
        self.postMessage({ type: "ready" });
      } else {
        setTimeout(checkReady, 50);
      }
    };
    checkReady();
    return;
  }

  if (type === "process") {
    const {
      inputSab,
      outputSab,
      width,
      height,
      startRow,
      endRow,
      filter,
      params,
      progressSab,
      workerIndex,
    } = payload;

    const prog = new Int32Array(progressSab);

    // Determine the halo region (Padding) needed
    let halo = 0;
    if (filter === "gaussian-blur") {
      halo = (params.radius * 3) | 0; // 3 passes of box blur need 3x radius halo
    } else if (
      filter === "sharpen" ||
      filter === "edge-detection" ||
      filter === "emboss"
    ) {
      halo = 1; // 3x3 kernel needs 1 extra pixel
    }

    // We want to process rows from `activeStartRow` to `activeEndRow` (Halo Strategy)
    const activeStartRow = Math.max(0, startRow - halo);
    const activeEndRow = Math.min(height, endRow + halo);
    const activeRows = activeEndRow - activeStartRow;

    // Total byte capacity required for the image to map absolute coordinates
    const totalBytes = width * height * 4;

    // Malloc memory natively via Wasm.
    const ptrSrc = Module._malloc(totalBytes);
    const ptrDst = Module._malloc(totalBytes);
    let ptrTmp = null;
    if (filter === "gaussian-blur") {
      ptrTmp = Module._malloc(totalBytes);
    }

    try {
      // 1. Copy the active bounding box from inputSAB to WASM memory
      const startIndex = activeStartRow * width * 4;
      const endIndex = activeEndRow * width * 4;

      const srcInput = new Uint8ClampedArray(
        inputSab,
        startIndex,
        endIndex - startIndex,
      );
      HEAPU8.set(srcInput, ptrSrc + startIndex);

      // 2. Call the correct WASM function
      switch (filter) {
        case "gaussian-blur":
          Module.ccall(
            "applyGaussianBlur",
            null,
            [
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
            ],
            [
              ptrSrc,
              ptrDst,
              ptrTmp,
              width,
              height,
              activeStartRow,
              activeEndRow,
              params.radius | 0,
            ],
          );
          break;
        case "edge-detection":
          Module.ccall(
            "applyEdgeDetection",
            null,
            ["number", "number", "number", "number", "number", "number"],
            [ptrSrc, ptrDst, width, height, startRow, endRow],
          );
          break;
        case "sharpen":
          Module.ccall(
            "applySharpen",
            null,
            [
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
            ],
            [ptrSrc, ptrDst, width, height, startRow, endRow, params.strength],
          );
          break;
        case "grayscale":
          Module.ccall(
            "applyGrayscale",
            null,
            ["number", "number", "number", "number", "number", "number"],
            [ptrSrc, ptrDst, width, height, startRow, endRow],
          );
          break;
        case "invert":
          Module.ccall(
            "applyInvert",
            null,
            ["number", "number", "number", "number", "number", "number"],
            [ptrSrc, ptrDst, width, height, startRow, endRow],
          );
          break;
        case "brightness-contrast":
          Module.ccall(
            "applyBrightnessContrast",
            null,
            [
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
            ],
            [
              ptrSrc,
              ptrDst,
              width,
              height,
              startRow,
              endRow,
              params.brightness,
              params.contrast,
            ],
          );
          break;
        case "pixelate":
          Module.ccall(
            "applyPixelate",
            null,
            [
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
              "number",
            ],
            [
              ptrSrc,
              ptrDst,
              width,
              height,
              startRow,
              endRow,
              params.blockSize | 0,
            ],
          );
          break;
        case "emboss":
          Module.ccall(
            "applyEmboss",
            null,
            ["number", "number", "number", "number", "number", "number"],
            [ptrSrc, ptrDst, width, height, startRow, endRow],
          );
          break;
        default: {
          const dstOutput = new Uint8ClampedArray(
            outputSab,
            startRow * width * 4,
            (endRow - startRow) * width * 4,
          );
          const srcCopy = new Uint8ClampedArray(
            inputSab,
            startRow * width * 4,
            (endRow - startRow) * width * 4,
          );
          dstOutput.set(srcCopy);
        }
      }

      // 3. Extract the computed block (the tight boundaries `startRow` to `endRow`!)
      if (filter !== "default") {
        const resultStartIndex = startRow * width * 4;
        const resultEndIndex = endRow * width * 4;
        const res = HEAPU8.subarray(
          ptrDst + resultStartIndex,
          ptrDst + resultEndIndex,
        );
        const outBuffer = new Uint8ClampedArray(
          outputSab,
          resultStartIndex,
          resultEndIndex - resultStartIndex,
        );
        outBuffer.set(res);
      }

      Atomics.store(prog, workerIndex, 100);
      self.postMessage({ type: "done", workerIndex });
    } catch (err) {
      self.postMessage({ type: "error", workerIndex, message: err.message });
    } finally {
      // 4. FREE memory instantly!
      Module._free(ptrSrc);
      Module._free(ptrDst);
      if (ptrTmp) Module._free(ptrTmp);
    }
  }
};
