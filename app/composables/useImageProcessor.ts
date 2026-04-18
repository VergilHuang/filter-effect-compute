/**
 * useImageProcessor.ts
 * Orchestrates the full image processing pipeline:
 *   Upload → HEIC decode → Canvas → SAB → Worker Pool → render → download
 */

import { useWorkerPool } from "./useWorkerPool";

export const FILTERS = [
  {
    id: "gaussian-blur",
    label: "Gaussian Blur",
    params: [
      { key: "radius", label: "Radius", min: 1, max: 50, step: 1, default: 10 },
    ],
  },
  { id: "edge-detection", label: "Edge Detection", params: [] },
  {
    id: "sharpen",
    label: "Sharpen",
    params: [
      {
        key: "strength",
        label: "Strength",
        min: 0.1,
        max: 5,
        step: 0.1,
        default: 1.5,
      },
    ],
  },
  { id: "grayscale", label: "Grayscale", params: [] },
  { id: "invert", label: "Invert", params: [] },
  {
    id: "brightness-contrast",
    label: "Brightness/Contrast",
    params: [
      {
        key: "brightness",
        label: "Brightness",
        min: -100,
        max: 100,
        step: 1,
        default: 0,
      },
      {
        key: "contrast",
        label: "Contrast",
        min: -100,
        max: 100,
        step: 1,
        default: 0,
      },
    ],
  },
  {
    id: "pixelate",
    label: "Pixelate",
    params: [
      {
        key: "blockSize",
        label: "Block Size",
        min: 2,
        max: 64,
        step: 1,
        default: 12,
      },
    ],
  },
  { id: "emboss", label: "Emboss", params: [] },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

export function useImageProcessor() {
  const pool = useWorkerPool();

  // ── State ──────────────────────────────────────────────────────────────────
  const engineReady = ref(false);
  const isProcessing = ref(false);
  const progress = ref(0); // 0–100
  const hasResult = ref(false);
  const hasImage = ref(false);
  const errorMessage = ref<string | null>(null);

  const selectedFilter = ref<FilterId>("gaussian-blur");
  const filterParams = ref<Record<string, number>>({});

  const previewCanvas = ref<HTMLCanvasElement | null>(null);

  // Internal SABs — released on clear/new-upload
  let currentInputSab: SharedArrayBuffer | null = null;
  let currentOutputSab: SharedArrayBuffer | null = null;
  const nativeWidth = ref(0);
  const nativeHeight = ref(0);

  // ── Init ───────────────────────────────────────────────────────────────────
  async function initEngine() {
    try {
      if (engineReady.value) return;

      await pool.init();
      engineReady.value = true;
    } catch (e) {
      errorMessage.value = "無法初始化運算引擎，請重新整理頁面。";
    }
  }

  // ── Default params ─────────────────────────────────────────────────────────
  function resetParams(filterId: FilterId = selectedFilter.value) {
    const def = FILTERS.find((f) => f.id === filterId);
    if (!def) return;
    const p: Record<string, number> = {};
    for (const param of def.params as unknown as any[])
      p[param.key] = param.default;
    filterParams.value = p;
  }

  function selectFilter(id: FilterId) {
    selectedFilter.value = id;
    resetParams(id);
  }

  resetParams();

  // ── Upload ─────────────────────────────────────────────────────────────────
  async function loadImage(file: File): Promise<void> {
    errorMessage.value = null;
    hasResult.value = false;
    hasImage.value = false;
    freeSabs();

    let blob: Blob = file;

    // HEIC decode
    if (
      file.type === "image/heic" ||
      file.name.toLowerCase().endsWith(".heic")
    ) {
      try {
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({ blob: file, toType: "image/png" });
        blob = Array.isArray(converted) ? converted[0]! : converted;
      } catch (e) {
        errorMessage.value = "HEIC 解碼失敗，請轉換為 JPEG/PNG 後重試。";
        return;
      }
    }

    const url = URL.createObjectURL(blob);
    const img = new Image();

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("圖片載入失敗"));
      img.src = url;
    });

    URL.revokeObjectURL(url);

    nativeWidth.value = img.naturalWidth;
    nativeHeight.value = img.naturalHeight;

    if (!previewCanvas.value) return;
    const canvas = previewCanvas.value;
    canvas.width = nativeWidth.value;
    canvas.height = nativeHeight.value;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, nativeWidth.value, nativeHeight.value);

    // Allocate SABs
    const byteLen = nativeWidth.value * nativeHeight.value * 4;
    currentInputSab = new SharedArrayBuffer(byteLen);
    currentOutputSab = new SharedArrayBuffer(byteLen);

    const view = new Uint8ClampedArray(currentInputSab);
    view.set(imageData.data);

    hasImage.value = true;
  }

  // ── Process ────────────────────────────────────────────────────────────────
  async function processImage(): Promise<void> {
    if (!currentInputSab || !previewCanvas.value) return;
    if (isProcessing.value) return;

    isProcessing.value = true;
    progress.value = 0;
    errorMessage.value = null;

    const workerCount = () => pool.poolSize();
    const progressSab = new SharedArrayBuffer(workerCount() * 4);
    const progView = new Int32Array(progressSab);

    // Poll progress
    const interval = setInterval(() => {
      let sum = 0;
      for (let i = 0; i < workerCount(); i++) sum += Atomics.load(progView, i);
      progress.value = Math.min(99, Math.round(sum / workerCount()));
    }, 80);

    try {
      // 復用 loadImage 時建立的 currentOutputSab，避免每次拖動滑桿都分配數十 MB 記憶體
      // currentOutputSab = new SharedArrayBuffer(currentInputSab.byteLength);

      await pool.process({
        inputSab: currentInputSab,
        outputSab: currentOutputSab!,
        width: nativeWidth.value,
        height: nativeHeight.value,
        filter: selectedFilter.value,
        params: toRaw(filterParams.value),
        progressSab,
      });

      progress.value = 100;

      // Render result
      const canvas = previewCanvas.value!;
      const ctx = canvas.getContext("2d")!;
      // ImageData requires a non-shared buffer — copy out of the SAB
      const shared = new Uint8ClampedArray(currentOutputSab!);
      const plain = new Uint8ClampedArray(shared);
      const result = new ImageData(plain, nativeWidth.value, nativeHeight.value);
      ctx.putImageData(result, 0, 0);

      hasResult.value = true;
    } catch (e: any) {
      errorMessage.value = e.message ?? "運算過程中發生錯誤。";

      // Worker crash recovery
      pool.terminateAll();
      await pool.init();
    } finally {
      clearInterval(interval);
      isProcessing.value = false;
    }
  }

  // ── Download ───────────────────────────────────────────────────────────────
  function downloadImage(format: "png" | "webp") {
    if (!previewCanvas.value || !hasResult.value) return;
    const mime = format === "png" ? "image/png" : "image/webp";
    const ext = format;
    previewCanvas.value.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `processed.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      mime,
      0.92,
    );
  }


  // ── Clear ──────────────────────────────────────────────────────────────────
  function clearImage() {
    freeSabs();
    hasResult.value = false;
    hasImage.value = false;
    progress.value = 0;
    errorMessage.value = null;
    if (previewCanvas.value) {
      const ctx = previewCanvas.value.getContext("2d")!;
      ctx.clearRect(
        0,
        0,
        previewCanvas.value.width,
        previewCanvas.value.height,
      );
      previewCanvas.value.width = 0;
      previewCanvas.value.height = 0;
    }
    forceRebuildWorkers();
  }

  function freeSabs() {
    // JS GC will collect the SABs when references drop.
    // Wasm memory is allocated/freed per-task inside processor.worker.js
    currentInputSab = null;
    currentOutputSab = null;
  }

  function forceRebuildWorkers() {
    // 記憶體強制回收策略 (Terminate & Respawn):
    // 透過殺死 Worker 來強制 V8 放棄 SAB 的參照，隨後在背景重啟準備下一次服務。
    pool.terminateAll();
    pool.init();
  }

  return {
    engineReady,
    isProcessing,
    progress,
    hasResult,
    hasImage,
    errorMessage,
    selectedFilter,
    filterParams,
    nativeWidth,
    nativeHeight,
    previewCanvas,
    FILTERS,
    initEngine,
    selectFilter,
    loadImage,
    processImage,
    downloadImage,
    clearImage,
  };
}
