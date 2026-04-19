<template>
  <div
    class="relative flex items-center justify-center w-full h-full overflow-hidden"
    style="background: var(--color-surface)"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <!-- Blueprint grid background -->
    <div
      class="absolute inset-0 blueprint-grid pointer-events-none opacity-40"
    />
    <!-- Empty state / drop zone -->
    <div
      v-if="!hasImage"
      class="absolute inset-4 flex flex-col items-center justify-center cursor-pointer select-none transition-colors duration-200"
      :style="{
        border: `1px dashed ${isDragging ? 'var(--color-amber)' : 'var(--color-border-bright)'}`,
        background: isDragging ? 'var(--color-amber-glow)' : 'transparent',
        transform: isDragging ? 'scale(0.99)' : 'scale(1)',
        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        backfaceVisibility: 'hidden',
        '-webkit-font-smoothing': 'antialiased',
      }"
      @click="triggerInput"
    >
      <!-- Corner marks -->
      <span
        v-for="pos in [
          'top-0 left-0',
          'top-0 right-0',
          'bottom-0 left-0',
          'bottom-0 right-0',
        ]"
        :key="pos"
        class="absolute w-3 h-3 pointer-events-none transition-all duration-300"
        :class="pos"
        :style="{
          border: '1px solid var(--color-amber)',
          opacity: isDragging ? 1 : 0.4,
          transform: isDragging ? 'scale(1.2)' : 'scale(1)',
          boxShadow: isDragging ? '0 0 8px var(--color-amber)' : 'none',
        }"
      />

      <div class="flex flex-col items-center gap-4 pointer-events-none">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="1"
            y="1"
            width="38"
            height="38"
            stroke="currentColor"
            stroke-width="1"
            stroke-dasharray="4 2"
            :style="{
              color: isDragging
                ? 'var(--color-amber)'
                : 'var(--color-border-bright)',
            }"
          />
          <path
            d="M20 13 L20 27 M13 20 L27 20"
            :stroke="
              isDragging ? 'var(--color-amber)' : 'var(--color-text-muted)'
            "
            stroke-width="1.5"
            stroke-linecap="square"
          />
        </svg>

        <div class="text-center" style="color: var(--color-text-muted)">
          <div class="text-xs uppercase tracking-widest mb-1">拖曳圖片至此</div>
          <div class="text-xs" style="color: var(--color-text-dim)">
            或點擊選取檔案
          </div>
          <div class="text-xs mt-3" style="color: var(--color-text-dim)">
            JPEG · PNG · WebP · HEIC
          </div>
        </div>
      </div>
    </div>

    <!-- Single Canvas - Full Resolution, Rendered via CSS scaling -->
    <div class="relative z-10">
      <canvas
        ref="canvasEl"
        :class="{ 'opacity-60': isProcessing }"
        :style="displayStyle"
      />
      <!-- Scanning Laser (No transition for instant shutdown, delayed start via showLaser) -->
      <div
        v-if="showLaser"
        class="absolute inset-x-0 scan-laser z-20 pointer-events-none"
      />
    </div>

    <!-- Processing overlay -->
    <Transition name="fade">
      <div
        v-if="isProcessing"
        class="absolute inset-0 flex flex-col items-end justify-end p-4 pointer-events-none"
      >
        <!-- Progress bar -->
        <div
          class="w-full"
          style="background: var(--color-border); height: 2px"
        >
          <div
            class="h-full transition-all duration-100"
            :style="{
              width: `${progress}%`,
              background: 'var(--color-amber)',
              boxShadow: '0 0 6px var(--color-amber)',
            }"
          />
        </div>
        <div
          class="mt-1 text-xs tabular-nums"
          style="color: var(--color-amber)"
        >
          {{ progress }}%
        </div>
      </div>
    </Transition>

    <!-- Hidden file input -->
    <input
      ref="inputEl"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,.heic"
      class="hidden"
      @change="handleFileInput"
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  isProcessing: boolean;
  progress: number;
  hasImage: boolean;
  nativeWidth: number;
  nativeHeight: number;
}>();

const emit = defineEmits<{
  (e: "file", file: File): void;
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const DELAY_TIME = 300; // 延遲時間

const showLaser = ref(false);
let laserTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.isProcessing,
  (val) => {
    if (val) {
      laserTimer = setTimeout(() => {
        if (props.isProcessing) showLaser.value = true;
      }, DELAY_TIME);
    } else {
      if (laserTimer) {
        clearTimeout(laserTimer);
        laserTimer = null;
      }
      showLaser.value = false;
    }
  },
);

const hasImage = computed(() => props.hasImage);

// 根據需求限制顯示尺寸：最大 600px，且不超過原圖尺寸（避免模糊）
const displayStyle = computed(() => {
  if (!props.hasImage || !props.nativeWidth) return { display: "none" };

  const PREVIEW_ZOON_MAX = 600;
  // 計算在不超過 600x600 下的縮放比例
  const ratio = Math.min(
    1,
    PREVIEW_ZOON_MAX / props.nativeWidth,
    PREVIEW_ZOON_MAX / props.nativeHeight,
  );

  return {
    display: "block",
    width: `${Math.round(props.nativeWidth * ratio)}px`,
    height: `${Math.round(props.nativeHeight * ratio)}px`,
    imageRendering: "auto" as const,
  };
});

// Expose canvas to parent
defineExpose({ canvasEl });

function triggerInput() {
  inputEl.value?.click();
}

function handleFileInput(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) emit("file", f);
  // Reset so same file can be re-selected
  (e.target as HTMLInputElement).value = "";
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) emit("file", f);
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.blueprint-grid {
  background-image: radial-gradient(
    var(--color-border-bright) 1px,
    transparent 1px
  );
  background-size: 32px 32px;
  background-color: rgba(0, 0, 0, 0.2);
}

.scan-laser {
  height: 40%;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(217, 119, 6, 0.05) 40%,
    rgba(217, 119, 6, 0.3) 85%,
    var(--color-amber) 99%,
    transparent 100%
  );
  top: -40%;
  animation: scan 1.8s linear infinite;
  filter: blur(0.5px);
  box-shadow: 0 10px 30px -5px var(--color-amber);
}

@keyframes scan {
  0% {
    top: -40%;
  }
  100% {
    top: 100%;
  }
}
</style>
