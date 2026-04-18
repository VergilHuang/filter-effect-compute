#!/bin/bash

# build-wasm.sh
# Compiles the C++ processor into WebAssembly via Emscripten.
# This script is intended to be run inside the Docker container.

OUTPUT_JS="public/wasm/processor.js"
INPUT_CPP="src/wasm/processor.cpp"

echo "Building WebAssembly module with Emscripten..."

emcc $INPUT_CPP \
    -o $OUTPUT_JS \
    -s EXPORTED_FUNCTIONS="['_malloc','_free','_applyGrayscale','_applyInvert','_applyBrightnessContrast','_applyPixelate','_applySharpen','_applyEmboss','_applyEdgeDetection','_applyGaussianBlur']" \
    -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap']" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -O3

if [ $? -eq 0 ]; then
    echo "Successfully built $OUTPUT_JS"
else
    echo "Failed to build WebAssembly module."
    exit 1
fi
