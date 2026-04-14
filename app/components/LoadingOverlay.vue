<template>
  <Transition name="overlay">
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style="background: var(--color-bg);"
    >
      <!-- Grid lines -->
      <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div class="absolute inset-0" style="
          background-image:
            linear-gradient(var(--color-border) 1px, transparent 1px),
            linear-gradient(90deg, var(--color-border) 1px, transparent 1px);
          background-size: 48px 48px;
          opacity: 0.5;
        "/>
      </div>

      <!-- Core content -->
      <div class="relative flex flex-col items-center gap-8 px-8">
        <!-- Logo mark -->
        <div class="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="0" y="0" width="14" height="14" style="fill: var(--color-amber)"/>
            <rect x="18" y="0" width="14" height="14" style="fill: var(--color-border-bright)"/>
            <rect x="0" y="18" width="14" height="14" style="fill: var(--color-border-bright)"/>
            <rect x="18" y="18" width="14" height="14" style="fill: var(--color-amber); opacity: 0.4;"/>
          </svg>
          <span class="text-xl font-medium tracking-widest uppercase" style="color: var(--color-text); letter-spacing: 0.25em;">
            FILTERLAB
          </span>
        </div>

        <!-- Spinner + label -->
        <div class="flex flex-col items-center gap-4 w-64">
          <div class="relative w-full h-px" style="background: var(--color-border-bright);">
            <div class="absolute top-0 left-0 h-px animate-scan" style="width: 40%; background: var(--color-amber); box-shadow: 0 0 8px var(--color-amber);"/>
          </div>

          <div class="flex items-center gap-2" style="color: var(--color-text-muted);">
            <span class="text-xs uppercase tracking-widest">載入運算引擎</span>
            <span class="animate-blink" style="color: var(--color-amber);">_</span>
          </div>

          <div class="text-xs" style="color: var(--color-text-dim);">
            initializing worker pool · loading wasm module
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ show: boolean }>()
</script>

<style scoped>
@keyframes scan {
  0%   { left: 0;    opacity: 1; }
  80%  { left: 60%;  opacity: 1; }
  100% { left: 60%;  opacity: 0; }
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
.animate-scan  { animation: scan  1.4s ease-in-out infinite; }
.animate-blink { animation: blink 1.0s step-start infinite; }

.overlay-enter-active { transition: opacity 0.4s ease; }
.overlay-leave-active { transition: opacity 0.6s ease 0.2s; }
.overlay-enter-from, .overlay-leave-to { opacity: 0; }
</style>
