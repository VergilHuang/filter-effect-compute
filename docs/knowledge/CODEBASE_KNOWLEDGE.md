# CODEBASE_KNOWLEDGE.md

> 自動生成於：2026-04-14 21:13
> 生成工具：frontend-codebase-analyzer skill
> 職責範疇：僅涵蓋前端層（UI / 路由 / 狀態管理 / 樣式）
> ⚠️ 此文件為靜態快照，不會自動同步程式碼變更，請於重大架構調整後重新執行 skill。

---

## 1. 專案概覽

- **專案名稱**：filter-effect-compute
- **核心目的**：一個純前端的影像處理網站，利用 WebAssembly 與多執行緒運算實現複雜濾鏡效果。
- **目標使用者**：需要快速處理影像且注重隱私（不需上傳伺服器）的使用者。
- **專案狀態**：開發中
- **前端框架版本**：Nuxt 4.4.2 (基於 Vue 3.5.32)

---

## 2. 前端技術棧（Frontend Tech Stack）

| 分類        | 工具 / 版本 |
| ----------- | ----------- |
| 框架        | Nuxt 4.4.2 / Vue 3.5.32 |
| UI 元件庫   | Vanilla (Custom components) |
| 狀態管理    | Composables (`useImageProcessor`) |
| 樣式方案    | Tailwind CSS v4 |
| HTTP Client | N/A (Pure Client-side) |
| 影像處理    | WebAssembly, Web Worker, SharedArrayBuffer |
| TypeScript  | ✅ |

---

## 3. 前端目錄結構

```text
d:/projects/filter-effect-compute/
├── app/                  # 前端核心程式碼
│   ├── assets/           # 靜態資源
│   │   └── css/         # 全域樣式 (main.css)
│   ├── components/       # UI 元件
│   │   ├── ControlPanel.vue    # 濾鏡參數與操作面板
│   │   ├── LoadingOverlay.vue  # 初始化載入遮罩
│   │   └── PreviewCanvas.vue   # 畫布預覽與上傳區
│   ├── composables/      # 業務邏輯封裝
│   │   ├── useImageProcessor.ts # 核心流程調度
│   │   └── useWorkerPool.ts     # 工作池管理
│   └── app.vue           # 應用程式入口
├── public/               # 公開靜態資源
│   └── workers/          # Web Workers 指令集
│       └── processor.worker.js # 影像處理 Worker
├── docs/                 # 專案文檔
│   └── knowledge/       # 知識庫
└── nuxt.config.ts        # Nuxt 核心設定
```

---

## 4. 路由結構（Route Structure）

由於目前採 Single-page Workspace 設計，暫無多分頁路由。

| 路由路徑 | 對應檔案 | 頁面功能 | Layout | Auth 需求 |
|---------|---------|---------|--------|-----------|
| `/` | `app/app.vue` | 主工作區 | default | ❌ |

---

## 5. 全域狀態管理（Global State）

本專案主要使用 Composables 來管理全域狀態，而非傳統的 Pinia。

| Store/State | 檔案路徑 | 管理的狀態 | 主要 Actions |
|-----------|---------|----------|-------------|
| `useImageProcessor` | `app/composables/useImageProcessor.ts` | 引擎狀態、處理進度、目前圖片、濾鏡參數 | `loadImage`, `processImage`, `clearImage`, `downloadImage` |

---

## 6. 共用 Composables / Hooks

| 名稱 | 路徑 | 功能說明 | 回傳值摘要 |
|------|------|---------|-----------|
| `useImageProcessor` | `app/composables/useImageProcessor.ts` | 封裝圖片處理全流程 (SAB 管理、渲染、下載) | `{ engineReady, isProcessing, progress, ... }` |
| `useWorkerPool` | `app/composables/useWorkerPool.ts` | 管理 Web Worker 的初始化與任務派發 | `{ init, process, terminateAll, ready }` |

---

## 7. 元件架構概覽

### 設計分層
```text
佈局層（Layout）：app.vue
↓
功能層（Feature）：PreviewCanvas, ControlPanel
↓
顯示層（UI）：LoadingOverlay
```

### 重要元件清單

| 元件名稱 | 路徑 | 職責 | Props 摘要 |
|---------|------|------|-----------|
| `PreviewCanvas` | `app/components/PreviewCanvas.vue` | 顯示原始圖與結果圖，支援 Drag & Drop 上傳 | `isProcessing`, `progress`, `hasImage` |
| `ControlPanel` | `app/components/ControlPanel.vue` | 濾鏡選擇、參數拉桿、執行按鈕 | `engineReady`, `filterParams`, `selectedFilter` |
| `LoadingOverlay` | `app/components/LoadingOverlay.vue` | 在 Wasm 引擎未就緒前顯示載入狀態 | `show` |

---

## 8. 前端環境變數

本專案為純前端運算，目前不依賴動態環境變數。

---

## 9. 前端開發指南

### 啟動方式
```bash
pnpm install       # 安裝依賴
pnpm dev           # 開發模式
pnpm generate      # 靜態站點生成 (SSG)
```

### 程式碼規範

- **元件命名**：PascalCase (e.g., `PreviewCanvas.vue`)
- **樣式規範**：優先使用 Tailwind CSS v4 實作。
- **型別安全**：所有 Composable 與元件都必須具備 TypeScript 型別定義。
- **跨來源隔離**：必須啟用 COOP/COEP Headers 以支援 `SharedArrayBuffer`。

---

## 10. 已知前端問題與技術債

- [ ] ⚠️ 效能問題：超大解析度圖片處理時可能導致 Worker 記憶體壓力。
- [ ] ⚠️ 待實作：目前濾鏡效果主要在 JS 端進行分模塊模擬，未來需強化 Wasm 端的 C++ 實作。
- [ ] ⚠️ 回退機制：目前若瀏覽器不支援 `SharedArrayBuffer` 會直接報錯，需增加友善提示。

---

## 11. 前端設計決策備忘

- **SSR vs CSR 策略**：全站強制 `ssr: false`。因為影像處理需要大量的瀏覽器層級 API (Canvas, Workers, SAB)，無法在伺服器端預渲染。
- **狀態管理選型理由**：因為專案邏輯主要與 Canvas 及 Worker 互動，使用 Composable 原生封裝狀態比 Pinia 更具靈活性。
- **Vite 插件整合**：使用 `@tailwindcss/vite` 整合 Tailwind v4，確保快速的 HMR 體驗。

---

## 12. 參考資源

- [requirement.md](file:///d:/projects/filter-effect-compute/requirement.md)
- [Nuxt v4 官網](https://nuxt.com/)
- [SharedArrayBuffer 說明文件 (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
