#!/bin/bash

# build-wasm.sh
# Compiles the C++ processor into WebAssembly via Emscripten.
# This script is intended to be run inside the Docker container.

INPUT_CPP="wasm/processor.cpp"

# 產生8碼的 MD5 Hash
HASH=$(md5sum $INPUT_CPP | awk '{print $1}' | cut -c1-8)
OUTPUT_JS="public/wasm/processor.$HASH.js"

echo "Building WebAssembly module with Emscripten (Hash: $HASH)..."

# 清理舊的編譯檔
rm -f public/wasm/processor*.js public/wasm/processor*.wasm

emcc $INPUT_CPP \
    -o $OUTPUT_JS \
    -s EXPORTED_FUNCTIONS="['_malloc','_free','_applyGrayscale','_applyInvert','_applyBrightnessContrast','_applyPixelate','_applySharpen','_applyEmboss','_applyEdgeDetection','_applyGaussianBlur']" \
    -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap']" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -O3

if [ $? -eq 0 ]; then
    echo "Successfully built $OUTPUT_JS"
    
    # 用 sed 將新的檔名寫入 worker 檔案中
    sed -i -E "s|importScripts\(\"/wasm/processor.*\.js\"\)|importScripts(\"/wasm/processor.$HASH.js\")|g" public/workers/processor.worker.js
    echo "Updated importScripts in processor.worker.js"
else
    echo "Failed to build WebAssembly module."
    exit 1
fi
