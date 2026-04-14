<template>
  <div
    class="relative flex items-center justify-center w-full h-full overflow-hidden"
    style="background: var(--color-surface);"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <!-- Empty state / drop zone -->
    <div
      v-if="!hasImage"
      class="absolute inset-4 flex flex-col items-center justify-center cursor-pointer select-none transition-colors duration-200"
      :style="{
        border: `1px dashed ${isDragging ? 'var(--color-amber)' : 'var(--color-border-bright)'}`,
        background: isDragging ? 'var(--color-amber-glow)' : 'transparent',
      }"
      @click="triggerInput"
    >
      <!-- Corner marks -->
      <span v-for="pos in ['top-0 left-0','top-0 right-0','bottom-0 left-0','bottom-0 right-0']" :key="pos"
        class="absolute w-3 h-3 pointer-events-none"
        :class="pos"
        style="border: 1px solid var(--color-amber); opacity: 0.6;"
      />

      <div class="flex flex-col items-center gap-4 pointer-events-none">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="38" height="38" stroke="currentColor" stroke-width="1" stroke-dasharray="4 2"
            :style="{ color: isDragging ? 'var(--color-amber)' : 'var(--color-border-bright)' }"/>
          <path d="M20 13 L20 27 M13 20 L27 20"
            :stroke="isDragging ? 'var(--color-amber)' : 'var(--color-text-muted)'"
            stroke-width="1.5" stroke-linecap="square"/>
        </svg>

        <div class="text-center" style="color: var(--color-text-muted);">
          <div class="text-xs uppercase tracking-widest mb-1">拖曳圖片至此</div>
          <div class="text-xs" style="color: var(--color-text-dim);">或點擊選取檔案</div>
          <div class="text-xs mt-3" style="color: var(--color-text-dim);">
            JPEG · PNG · WebP · HEIC
          </div>
        </div>
      </div>
    </div>

    <!-- Canvas -->
    <canvas
      ref="canvasEl"
      class="max-w-full max-h-full object-contain"
      :class="{ 'opacity-40': isProcessing }"
      style="image-rendering: pixelated; display: block;"
    />

    <!-- Processing overlay -->
    <Transition name="fade">
      <div
        v-if="isProcessing"
        class="absolute inset-0 flex flex-col items-end justify-end p-4 pointer-events-none"
      >
        <!-- Progress bar -->
        <div class="w-full" style="background: var(--color-border); height: 2px;">
          <div
            class="h-full transition-all duration-100"
            :style="{
              width: `${progress}%`,
              background: 'var(--color-amber)',
              boxShadow: '0 0 6px var(--color-amber)',
            }"
          />
        </div>
        <div class="mt-1 text-xs tabular-nums" style="color: var(--color-amber);">
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
  isProcessing: boolean
  progress: number
  hasImage: boolean
}>()

const emit = defineEmits<{
  (e: 'file', file: File): void
}>()

const canvasEl   = ref<HTMLCanvasElement | null>(null)
const inputEl    = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

const hasImage = computed(() => props.hasImage)

// Expose canvas element to parent
defineExpose({ canvasEl })

function triggerInput() {
  inputEl.value?.click()
}

function handleFileInput(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) emit('file', f)
  // Reset so same file can be re-selected
  ;(e.target as HTMLInputElement).value = ''
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) emit('file', f)
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
