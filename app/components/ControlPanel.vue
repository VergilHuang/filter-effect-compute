<template>
  <aside
    class="flex flex-col h-full overflow-y-auto"
    style="
      background: var(--color-surface);
      border-left: 1px solid var(--color-border);
      min-width: 260px; max-width: 300px; width: 280px;
    "
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-5 py-4" style="border-bottom: 1px solid var(--color-border);">
      <div class="w-2 h-2" style="background: var(--color-amber);"/>
      <span class="text-xs uppercase tracking-widest" style="color: var(--color-text-muted);">Control Panel</span>
    </div>

    <div class="flex flex-col gap-0 flex-1 px-5 py-5">

      <!-- ── Filter Selector ─────────────────────────────── -->
      <section class="mb-5">
        <label class="block text-xs uppercase tracking-widest mb-2" style="color: var(--color-text-dim);">
          Filter
        </label>
        <div class="relative">
          <select
            :value="selectedFilter"
            class="w-full px-3 py-2 text-xs appearance-none cursor-pointer"
            :disabled="isProcessing || !engineReady"
            style="
              background: var(--color-surface-2);
              border: 1px solid var(--color-border-bright);
              color: var(--color-text);
              font-family: var(--font-mono);
            "
            @change="$emit('selectFilter', ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="f in FILTERS"
              :key="f.id"
              :value="f.id"
            >{{ f.label }}</option>
          </select>
          <!-- Arrow -->
          <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
              <path d="M0 0 L4 6 L8 0" stroke="var(--color-amber)" stroke-width="1" fill="none"/>
            </svg>
          </div>
        </div>
      </section>

      <!-- ── Parameters ──────────────────────────────────── -->
      <section v-if="currentFilterDef && currentFilterDef.params.length > 0" class="mb-5">
        <label class="block text-xs uppercase tracking-widest mb-3" style="color: var(--color-text-dim);">
          Parameters
        </label>
        <div
          v-for="param in currentFilterDef.params"
          :key="param.key"
          class="mb-4"
        >
          <div class="flex justify-between mb-2">
            <span class="text-xs" style="color: var(--color-text-muted);">{{ param.label }}</span>
            <span class="text-xs tabular-nums" style="color: var(--color-amber);">
              {{ filterParams[param.key] }}
            </span>
          </div>
          <input
            type="range"
            :min="param.min"
            :max="param.max"
            :step="param.step"
            :value="filterParams[param.key]"
            :disabled="isProcessing || !engineReady"
            @input="$emit('updateParam', param.key, Number(($event.target as HTMLInputElement).value))"
          />
          <div class="flex justify-between mt-1">
            <span class="text-xs" style="color: var(--color-text-dim);">{{ param.min }}</span>
            <span class="text-xs" style="color: var(--color-text-dim);">{{ param.max }}</span>
          </div>
        </div>
      </section>

      <!-- No params notice -->
      <section v-else-if="currentFilterDef" class="mb-5">
        <div class="px-3 py-2 text-xs" style="border: 1px solid var(--color-border); color: var(--color-text-dim);">
          No adjustable parameters
        </div>
      </section>

      <!-- Divider -->
      <div class="my-1" style="border-top: 1px solid var(--color-border);"/>

      <!-- ── Actions ─────────────────────────────────────── -->
      <section class="mt-4 flex flex-col gap-2">
        <!-- Process -->
        <button
          class="w-full px-4 py-2.5 text-xs uppercase tracking-widest font-medium relative overflow-hidden transition-all duration-150"
          :disabled="isProcessing || !engineReady || !hasImage"
          :style="{
            background: canProcess ? 'var(--color-amber)' : 'var(--color-surface-2)',
            color: canProcess ? 'var(--color-bg)' : 'var(--color-text-dim)',
            border: `1px solid ${canProcess ? 'var(--color-amber)' : 'var(--color-border)'}`,
            cursor: canProcess ? 'pointer' : 'not-allowed',
          }"
          @click="$emit('process')"
        >
          <span v-if="isProcessing" class="flex items-center justify-center gap-2">
            <span class="animate-pulse">Processing</span>
            <span class="tabular-nums">{{ progress }}%</span>
          </span>
          <span v-else>開始處理</span>
        </button>

        <!-- Clear -->
        <button
          class="w-full px-4 py-2 text-xs uppercase tracking-widest transition-all duration-150"
          :disabled="isProcessing || !hasImage"
          :style="{
            background: 'transparent',
            color: hasImage && !isProcessing ? 'var(--color-danger)' : 'var(--color-text-dim)',
            border: `1px solid ${hasImage && !isProcessing ? 'var(--color-danger)' : 'var(--color-border)'}`,
            cursor: hasImage && !isProcessing ? 'pointer' : 'not-allowed',
          }"
          @click="$emit('clear')"
        >
          清除圖片
        </button>
      </section>

      <!-- ── Download ─────────────────────────────────────── -->
      <Transition name="slide-up">
        <section v-if="hasResult" class="mt-5">
          <div class="mb-2 text-xs uppercase tracking-widest" style="color: var(--color-text-dim);">
            Export
          </div>
          <div class="flex gap-2">
            <button
              class="flex-1 px-3 py-2 text-xs uppercase tracking-widest transition-all duration-150"
              style="
                background: var(--color-surface-2);
                border: 1px solid var(--color-border-bright);
                color: var(--color-text);
                cursor: pointer;
              "
              @click="$emit('download', 'png')"
            >
              PNG
            </button>
            <button
              class="flex-1 px-3 py-2 text-xs uppercase tracking-widest transition-all duration-150"
              style="
                background: var(--color-surface-2);
                border: 1px solid var(--color-border-bright);
                color: var(--color-text);
                cursor: pointer;
              "
              @click="$emit('download', 'webp')"
            >
              WebP
            </button>
          </div>
        </section>
      </Transition>

      <!-- ── Error ────────────────────────────────────────── -->
      <Transition name="fade">
        <div
          v-if="errorMessage"
          class="mt-4 px-3 py-2 text-xs"
          style="border: 1px solid var(--color-danger); color: var(--color-danger); background: rgba(185,28,28,0.06);"
        >
          {{ errorMessage }}
        </div>
      </Transition>

    </div>

    <!-- Footer -->
    <div
      class="px-5 py-3 flex items-center justify-between"
      style="border-top: 1px solid var(--color-border);"
    >
      <span class="text-xs" style="color: var(--color-text-dim);">
        {{ engineReady ? `${workerCount} workers` : 'initializing...' }}
      </span>
      <div class="flex items-center gap-1.5">
        <div
          class="w-1.5 h-1.5 rounded-full"
          :style="{ background: engineReady ? 'var(--color-success)' : 'var(--color-amber)' }"
        />
        <span class="text-xs" style="color: var(--color-text-dim);">
          {{ engineReady ? 'ready' : 'loading' }}
        </span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { FILTERS, type FilterId } from '~/composables/useImageProcessor'

const props = defineProps<{
  engineReady: boolean
  isProcessing: boolean
  progress: number
  hasImage: boolean
  hasResult: boolean
  selectedFilter: FilterId
  filterParams: Record<string, number>
  errorMessage: string | null
  workerCount: number
}>()

defineEmits<{
  (e: 'selectFilter', id: string): void
  (e: 'updateParam', key: string, value: number): void
  (e: 'process'): void
  (e: 'clear'): void
  (e: 'download', format: 'png' | 'webp'): void
}>()

const currentFilterDef = computed(() =>
  FILTERS.find((f) => f.id === props.selectedFilter)
)

const canProcess = computed(() =>
  props.engineReady && props.hasImage && !props.isProcessing
)
</script>

<style scoped>
.slide-up-enter-active { transition: all 0.25s ease; }
.slide-up-leave-active { transition: all 0.2s ease; }
.slide-up-enter-from   { opacity: 0; transform: translateY(6px); }
.slide-up-leave-to     { opacity: 0; transform: translateY(-4px); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }

button:not(:disabled):hover {
  filter: brightness(1.15);
}
</style>
