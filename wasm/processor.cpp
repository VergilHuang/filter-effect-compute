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

void boxBlurH(const uint8_t* src, uint8_t* dst, int width, int height, int startRow, int endRow, int radius) {
    float iarr = 1.0f / (radius + radius + 1);
    for (int y = startRow; y < endRow; ++y) {
        for (int ch = 0; ch < 3; ++ch) {
            int val = 0;
            for (int dx = -radius; dx <= radius; ++dx) {
                int px = std::max(0, std::min(width - 1, dx));
                val += src[idx(px, y, width) + ch];
            }
            dst[idx(0, y, width) + ch] = (uint8_t)(val * iarr + 0.5f);

            for (int x = 1; x < width; ++x) {
                int nextX = std::max(0, std::min(width - 1, x + radius));
                int prevX = std::max(0, std::min(width - 1, x - radius - 1));
                val += src[idx(nextX, y, width) + ch] - src[idx(prevX, y, width) + ch];
                dst[idx(x, y, width) + ch] = (uint8_t)(val * iarr + 0.5f);
            }
        }
        int i = idx(0, y, width);
        for (int x = 0; x < width; ++x) {
            dst[i + 3] = src[i + 3];
            i += 4;
        }
    }
}

void boxBlurV(const uint8_t* src, uint8_t* dst, int width, int height,
              int startRow, int endRow, int radius,
              int validStart, int validEnd) {
    float iarr = 1.0f / (radius + radius + 1);
    
    for (int x = 0; x < width; ++x) {
        for (int ch = 0; ch < 3; ++ch) {
            int val = 0;
            
            // Initialize rolling sum for startRow.
            // Clamp both by image bounds AND by the horizontally-blurred valid region.
            // Reading from outside [validStart, validEnd) would consume uninitialized
            // or stale data (other workers' rows), causing horizontal banding.
            for (int dy = -radius; dy <= radius; ++dy) {
                int py = startRow + dy;
                py = std::max(0, std::min(height - 1, py));   // image boundary
                py = std::max(validStart, std::min(validEnd - 1, py)); // halo boundary
                val += src[idx(x, py, width) + ch];
            }

            dst[idx(x, startRow, width) + ch] = (uint8_t)(val * iarr + 0.5f);

            // Slide down the window
            for (int y = startRow + 1; y < endRow; ++y) {
                // clamp nextY / prevY by both image and valid bounds
                int nextY = y + radius;
                nextY = std::max(0, std::min(height - 1, nextY));
                nextY = std::max(validStart, std::min(validEnd - 1, nextY));

                int prevY = y - radius - 1;
                prevY = std::max(0, std::min(height - 1, prevY));
                prevY = std::max(validStart, std::min(validEnd - 1, prevY));
                
                val += src[idx(x, nextY, width) + ch] - src[idx(x, prevY, width) + ch];
                dst[idx(x, y, width) + ch] = (uint8_t)(val * iarr + 0.5f);
            }
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void applyGaussianBlur(const uint8_t* src, uint8_t* dst, uint8_t* tmp, int width, int height, int activeStartRow, int activeEndRow, int radius) {
    int passes = 3;
    
    // Initial copy only for the active partition
    for (int y = activeStartRow; y < activeEndRow; ++y) {
        for (int x = 0; x < width; ++x) {
            int i = idx(x, y, width);
            dst[i] = src[i];
            dst[i+1] = src[i+1];
            dst[i+2] = src[i+2];
            dst[i+3] = src[i+3];
        }
    }

    int currentStart = activeStartRow;
    int currentEnd = activeEndRow;

    for (int pass = 0; pass < passes; ++pass) {
        // Horizontal blur: writes [currentStart, currentEnd) into tmp
        boxBlurH(dst, tmp, width, height, currentStart, currentEnd, radius);
        
        // After horizontal blur, tmp is only valid for [currentStart, currentEnd)
        // Shrink the output range so boxBlurV never reads outside that region
        int safeStart = currentStart;
        if (currentStart > 0) safeStart = std::min(height, currentStart + radius);
        
        int safeEnd = currentEnd;
        if (currentEnd < height) safeEnd = std::max(0, currentEnd - radius);
        
        if (safeStart > safeEnd) safeStart = safeEnd;

        // Pass validStart/validEnd = currentStart/currentEnd so the rolling
        // window never reads rows that boxBlurH hasn't written.
        boxBlurV(tmp, dst, width, height, safeStart, safeEnd, radius,
                 currentStart, currentEnd);
        
        currentStart = safeStart;
        currentEnd = safeEnd;
    }
}

} // extern "C"
