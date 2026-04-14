## Description

我想做一個可以讓使用者上傳圖片，進行高複雜度影像處理後，供用戶下載成檔案 (png, webp) 的純前端運算網站。
本專案不依賴後端伺服器進行圖片運算，將部署為純靜態網站，並透過設定 HTTP Headers 開啟跨來源隔離 (Cross-Origin Isolation)，以解鎖 SharedArrayBuffer 的使用權限。

## Design

為確保使用者專注於影像處理，介面應採取單一視圖 (Single-page Workspace) 佈局，由左至右或由上至下引導。

- **初始化區塊 (Global State)**：進入頁面時全局顯示「載入運算引擎中...」，確保 Wasm 與 Worker Pool 就緒後才解鎖操作。
- **工作區 (Workspace)**：
  - **預覽區 (左側/上方)**：佔據畫面最大比例。具備虛線框提示，支援 Drag & Drop 與點擊上傳。上傳後立即顯示原圖。
  - **控制面板 (右側/下方)**：
    - **功能選單**：下拉選單或按鈕組（如：高斯模糊、邊緣檢測等重度運算功能）。
    - **參數區**：根據選定功能動態顯示拉桿 (Range Input) 控制程度（如模糊半徑 1-50）。
    - **操作區**：「開始處理 (Primary Action)」與「清除圖片 (Secondary/Danger Action)」。
- **回饋與輸出區**：
  - 點擊處理後，預覽區覆蓋一層 Loading/進度條。
  - 運算完成，預覽區更新為處理後圖片，控制面板出現「下載 PNG」與「下載 WebP」按鈕。

## Features

- 選擇影像處理功能，並動態設定參數。
- 上傳圖片 (支援 image/jpeg, image/png, image/webp, image/heic)。
- 清除圖片並重置狀態。
- 非同步影像處理運算。
- 下載圖片 (輸出 .png, .webp)。

## 影像處理核心流程

1. **編譯**：影像處理的 C++ 函數需透過 Emscripten 編譯成 Wasm。
2. **像素提取**：使用者上傳圖片後，前端需透過 `<canvas>` 或 `OffscreenCanvas` 將圖片繪製並提取為 `ImageData` (RGBA 像素陣列)。
3. **記憶體共享**：建立 `SharedArrayBuffer` (SAB)，將像素資料寫入 SAB 中，以避免 `postMessage` 傳遞大陣列的序列化開銷。
4. **平行運算**：點擊開始處理後，將 SAB 的記憶體指標與任務派發給 Web Worker。Worker 內部呼叫 Wasm API 進行運算，直接修改 SAB 內的數據。
5. **渲染輸出**：運算完成後，主線程直接從 SAB 讀取修改後的數據，轉回 `ImageData` 並更新至預覽區 `<canvas>`。

## 狀態與例外處理

- **Wasm 載入狀態**：定義初始化的非同步等待狀態，阻擋使用者在引擎未就緒前操作。
- **影像處理進度回饋機制**：龐大運算在 Web Worker 執行時，Worker 需透過 SAB 搭配 `Atomics` 操作，或定時發送輕量狀態標記，將「運算進度 (%)」回傳給主線程更新 UI。
- **格式例外處理**：若上傳 HEIC 格式，需先導航至 HEIC Wasm 解碼器轉換為標準像素數據。
- **OOM (Out of Memory) 處理**：當使用者上傳過大圖片超過 Wasm 線性記憶體上限時，需實作崩潰捕捉 (`try-catch` 或 Worker `onerror`)，並給予友善錯誤提示。

## 記憶體生命週期定義

必須嚴格控管避免記憶體洩漏 (Memory Leak)：
在「使用者點擊清除」或「上傳新圖片覆蓋舊圖」時，JavaScript 必須呼叫 C++ 端暴露的 `free()` 方法釋放線性記憶體。若發生嚴重的 OOM 或 Worker 失去響應，需具備強制銷毀 (`worker.terminate()`) 並重建 Worker 實例的機制。

## 多執行緒策略

針對「龐大運算」，實作 **Worker Pool (工作池)** 模式。利用 Wasm 的 SIMD 指令，並由主線程將圖片資料按「列 (Rows)」或「區塊 (Blocks)」劃分，分配給多個 Worker 平行運算，確保不同 Worker 不會寫入相同的記憶體位址以避免競態條件。

## 指定技術與部署

- **框架1**：Nuxt 4.4.2 (設定為 SSG 靜態生成模式 `ssr: false` 或 `nuxt generate`)
- **框架2** Vue 3.5.32
- **樣式**：Tailwind CSS v4
- **語言**：TypeScript (確保對 SAB 與 Web Worker API 的強型別檢查)
- **核心技術**：WebAssembly, Web Worker, SharedArrayBuffer, Atomics
- **部署目標**：Vercel
  - 必須在 `vercel.json` 寫入 Header 標頭：`Cross-Origin-Opener-Policy: same-origin` 與 `Cross-Origin-Embedder-Policy: require-corp`。
- **附加套件**：
  - HEIC 解碼：需引入如 `heic2any` 或基於 `libheif` 的編譯套件以支援 iOS 照片。
  - 其他 UI/Utility 套件請依實作需求自行添加。
