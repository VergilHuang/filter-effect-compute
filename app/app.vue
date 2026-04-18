<template>
  <div class="app-root">
    <LoadingOverlay :show="!processor.engineReady.value" />

    <!-- Top bar -->
    <header class="app-header">
      <div class="flex items-center gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="0"
            y="0"
            width="9"
            height="9"
            style="fill: var(--color-amber)"
          />
          <rect
            x="11"
            y="0"
            width="9"
            height="9"
            style="fill: var(--color-border-bright)"
          />
          <rect
            x="0"
            y="11"
            width="9"
            height="9"
            style="fill: var(--color-border-bright)"
          />
          <rect
            x="11"
            y="11"
            width="9"
            height="9"
            style="fill: var(--color-amber); opacity: 0.4"
          />
        </svg>
        <span
          class="text-xs font-medium uppercase tracking-widest"
          style="color: var(--color-text); letter-spacing: 0.2em"
        >
          FILTERLAB
        </span>
      </div>

      <div class="flex items-center gap-6">
        <span class="text-xs" style="color: var(--color-text-purple)">
          Pure Client-Side Image Filter Effect Compute Tech · WebAssembly · Web
          Workers
        </span>
        <div
          v-if="processor.errorMessage.value"
          class="text-xs px-2 py-0.5"
          style="
            color: var(--color-danger);
            border: 1px solid var(--color-danger);
            background: rgba(185, 28, 28, 0.06);
          "
        >
          {{ processor.errorMessage.value }}
        </div>
      </div>
    </header>

    <!-- Workspace -->
    <main class="app-workspace">
      <!-- Preview -->
      <section class="preview-section">
        <PreviewCanvas
          ref="previewRef"
          :is-processing="processor.isProcessing.value"
          :progress="processor.progress.value"
          :has-image="processor.hasImage.value"
          @file="handleFile"
        />
      </section>

      <!-- Control Panel -->
      <ControlPanel
        :engine-ready="processor.engineReady.value"
        :is-processing="processor.isProcessing.value"
        :progress="processor.progress.value"
        :has-image="hasImage"
        :has-result="processor.hasResult.value"
        :selected-filter="processor.selectedFilter.value"
        :filter-params="processor.filterParams.value"
        :error-message="processor.errorMessage.value"
        :worker-count="workerCount"
        @select-filter="(id) => processor.selectFilter(id as any)"
        @update-param="
          (key, val) => {
            processor.filterParams.value[key] = val;
          }
        "
        @process="handleProcess"
        @clear="handleClear"
        @download="processor.downloadImage"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useImageProcessor } from "~/composables/useImageProcessor";
import { workerConfig } from "~/config/worker.config";

const processor = useImageProcessor();
const previewRef = ref<{ canvasEl: HTMLCanvasElement | null } | null>(null);
const workerCount = ref(workerConfig.getOptimalPoolSize());

const hasImage = processor.hasImage;

// Wire the canvas element into the processor
watch(
  () => previewRef.value?.canvasEl,
  (el) => {
    processor.previewCanvas.value = el ?? null;
  },
);

onMounted(async () => {
  processor.previewCanvas.value = previewRef.value?.canvasEl ?? null;
  await processor.initEngine();
});

async function handleFile(file: File) {
  await processor.loadImage(file);
}

async function handleProcess() {
  await processor.processImage();
}

function handleClear() {
  processor.clearImage();
}
</script>

<style>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.app-workspace {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.preview-section {
  flex: 1;
  min-width: 0;
  display: flex;
  overflow: hidden;
  border-right: 1px solid var(--color-border);
}
</style>
