#include <emscripten.h>
#include <cstdint>
#include <cmath>
#include <algorithm>
#include <cstdlib>

extern "C" {

inline int idx(int x, int y, int width) {
    return (y * width + x) * 4;
}

inline uint8_t clamp(int v) {
    return (uint8_t)(v < 0 ? 0 : (v > 255 ? 255 : v));
}

EMSCRIPTEN_KEEPALIVE
void applyGrayscale(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow) {
    for (int y = startRow; y < endRow; ++y) {
        for (int x = 0; x < width; ++x) {
            int i = idx(x, y, width);
            uint8_t r = src[i];
            uint8_t g = src[i+1];
            uint8_t b = src[i+2];
            uint8_t a = src[i+3];
            uint8_t gray = clamp(0.299f * r + 0.587f * g + 0.114f * b);
            dst[i] = gray;
            dst[i+1] = gray;
            dst[i+2] = gray;
            dst[i+3] = a;
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void applyInvert(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow) {
    for (int y = startRow; y < endRow; ++y) {
        for (int x = 0; x < width; ++x) {
            int i = idx(x, y, width);
            dst[i] = 255 - src[i];
            dst[i+1] = 255 - src[i+1];
            dst[i+2] = 255 - src[i+2];
            dst[i+3] = src[i+3];
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void applyBrightnessContrast(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow, int brightness, int contrast) {
    float factor = (259.0f * (contrast + 255.0f)) / (255.0f * (259.0f - contrast));
    for (int y = startRow; y < endRow; ++y) {
        for (int x = 0; x < width; ++x) {
            int i = idx(x, y, width);
            for (int ch = 0; ch < 3; ++ch) {
                float v = (float)src[i+ch] + brightness;
                v = factor * (v - 128.0f) + 128.0f;
                dst[i+ch] = clamp((int)v);
            }
            dst[i+3] = src[i+3];
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void applyPixelate(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow, int blockSize) {
    for (int y = startRow; y < endRow; ++y) {
        for (int x = 0; x < width; ++x) {
            int bx = (x / blockSize) * blockSize;
            int by = (y / blockSize) * blockSize;
            bx = std::max(0, std::min(bx, width - 1));
            by = std::max(0, std::min(by, height - 1));
            int si = idx(bx, by, width);
            int di = idx(x, y, width);
            dst[di] = src[si];
            dst[di+1] = src[si+1];
            dst[di+2] = src[si+2];
            dst[di+3] = src[si+3];
        }
    }
}

inline void applyKernel(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow, const float* k, float bias = 0) {
    for (int y = startRow; y < endRow; ++y) {
        for (int x = 0; x < width; ++x) {
            int i = idx(x, y, width);

            // Edge cases
            if (x == 0 || x == width - 1 || y == 0 || y == height - 1) {
                dst[i] = src[i]; dst[i+1] = src[i+1]; dst[i+2] = src[i+2]; dst[i+3] = src[i+3];
                continue;
            }

            float r = 0, g = 0, b = 0;
            int ki = 0;
            for (int dy = -1; dy <= 1; ++dy) {
                for (int dx = -1; dx <= 1; ++dx) {
                    int ni = idx(x+dx, y+dy, width);
                    r += k[ki] * src[ni];
                    g += k[ki] * src[ni+1];
                    b += k[ki] * src[ni+2];
                    ki++;
                }
            }
            dst[i] = clamp((int)(r + bias));
            dst[i+1] = clamp((int)(g + bias));
            dst[i+2] = clamp((int)(b + bias));
            dst[i+3] = src[i+3];
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void applySharpen(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow, float strength) {
    float s = strength;
    float k[9] = {
         0,      -s,        0,
        -s,  1 + 4*s,      -s,
         0,      -s,        0
    };
    applyKernel(src, dst, width, height, startRow, endRow, k, 0);
}

EMSCRIPTEN_KEEPALIVE
void applyEmboss(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow) {
    float k[9] = {
        -2, -1,  0,
        -1,  1,  1,
         0,  1,  2
    };
    applyKernel(src, dst, width, height, startRow, endRow, k, 128);
}

EMSCRIPTEN_KEEPALIVE
void applyEdgeDetection(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow) {
    for (int y = startRow; y < endRow; ++y) {
        for (int x = 0; x < width; ++x) {
            int i = idx(x, y, width);

            if (x == 0 || x == width - 1 || y == 0 || y == height - 1) {
                dst[i] = 0; dst[i+1] = 0; dst[i+2] = 0; dst[i+3] = src[i+3];
                continue;
            }

            auto getGray = [&](int px) {
                return 0.299f * src[px] + 0.587f * src[px+1] + 0.114f * src[px+2];
            };

            float tl = getGray(idx(x-1, y-1, width));
            float tc = getGray(idx(x,   y-1, width));
            float tr = getGray(idx(x+1, y-1, width));
            float ml = getGray(idx(x-1, y,   width));
            float mr = getGray(idx(x+1, y,   width));
            float bl = getGray(idx(x-1, y+1, width));
            float bc = getGray(idx(x,   y+1, width));
            float br = getGray(idx(x+1, y+1, width));

            float gx = -tl - 2*ml - bl + tr + 2*mr + br;
            float gy = -tl - 2*tc - tr + bl + 2*bc + br;
            float mag = std::sqrt(gx*gx + gy*gy);

            uint8_t m = clamp((int)mag);
            dst[i] = m; dst[i+1] = m; dst[i+2] = m; dst[i+3] = src[i+3];
        }
    }
}

void boxBlurH(const uint8_t* src, uint8_t* dst, int width, int startRow, int endRow, int radius) {
    float iarr = 1.0f / (radius + radius + 1);
    for (int y = startRow; y < endRow; ++y) {
        for (int ch = 0; ch < 3; ++ch) {
            int ti = idx(0, y, width) + ch;
            int li = ti;
            int ri = ti + radius * 4;

            int fv = src[ti];
            int lv = src[idx(width - 1, y, width) + ch];
            float val = (radius + 1) * fv;

            for (int j = 0; j < radius; ++j) {
                val += src[ti + j * 4];
            }
            for (int x = 0; x <= radius; ++x) {
                val += src[ri] - fv;
                dst[ti] = (uint8_t)(std::round(val * iarr));
                ri += 4; ti += 4;
            }
            for (int x = radius + 1; x < width - radius; ++x) {
                val += src[ri] - src[li];
                dst[ti] = (uint8_t)(std::round(val * iarr));
                li += 4; ri += 4; ti += 4;
            }
            for (int x = width - radius; x < width; ++x) {
                val += lv - src[li];
                dst[ti] = (uint8_t)(std::round(val * iarr));
                li += 4; ti += 4;
            }
        }
        for (int x = 0; x < width; ++x) {
            int i = idx(x, y, width);
            dst[i + 3] = src[i + 3];
        }
    }
}

void boxBlurV(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow, int radius) {
    float iarr = 1.0f / (radius + radius + 1);
    int capacity = width * height * 4;
    
    for (int x = 0; x < width; ++x) {
        for (int ch = 0; ch < 3; ++ch) {
            int ti = idx(x, startRow, width) + ch;
            int li = ti;
            int ri = ti + radius * width * 4;

            int fv = src[idx(x, startRow, width) + ch];
            int lv = src[idx(x, endRow - 1, width) + ch];
            float val = (radius + 1) * fv;

            for (int j = 0; j < radius; ++j) {
                val += src[idx(x, std::min(startRow + j, endRow - 1), width) + ch];
            }
            
            for (int y = startRow; y <= std::min(startRow + radius, endRow - 1); ++y) {
                int rval = (ri < capacity) ? src[ri] : lv;
                val += rval - fv;
                dst[ti] = (uint8_t)(std::round(val * iarr));
                ri += width * 4; ti += width * 4;
            }
            for (int y = startRow + radius + 1; y < endRow - radius; ++y) {
                val += src[ri] - src[li];
                dst[ti] = (uint8_t)(std::round(val * iarr));
                li += width * 4; ri += width * 4; ti += width * 4;
            }
            for (int y = std::max(endRow - radius, startRow + radius + 1); y < endRow; ++y) {
                val += lv - src[li];
                dst[ti] = (uint8_t)(std::round(val * iarr));
                li += width * 4; ti += width * 4;
            }
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void applyGaussianBlur(const uint8_t* src, uint8_t* dst, uint8_t* tmp, int width, int height, int startRow, int endRow, int radius) {
    int passes = 3;
    
    for (int y = startRow; y < endRow; ++y) {
        for (int x = 0; x < width; ++x) {
            int i = idx(x, y, width);
            dst[i] = src[i];
            dst[i+1] = src[i+1];
            dst[i+2] = src[i+2];
            dst[i+3] = src[i+3];
        }
    }

    for (int pass = 0; pass < passes; ++pass) {
        boxBlurH(dst, tmp, width, startRow, endRow, radius);
        boxBlurV(tmp, dst, width, height, startRow, endRow, radius);
    }
}

} // extern "C"
