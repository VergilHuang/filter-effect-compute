# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server at http://localhost:3000
pnpm generate     # Build as static site (use this, not pnpm build)
pnpm preview      # Preview the static build locally
pnpm postinstall  # Run nuxt prepare (auto-runs after pnpm install)
```

## Project Overview

A pure client-side image processing web app. Users upload images, apply heavy compute filters (Gaussian blur, edge detection, etc.), and download the result. No backend — all computation runs in the browser via WebAssembly + Web Workers.

**Stack**: Nuxt 4.4.2 · Vue 3.5 · TypeScript · Tailwind CSS v4 · pnpm  
**Deploy**: Vercel static site — `pnpm generate` outputs to `.output/public/`

## Architecture

### Cross-Origin Isolation

`vercel.json` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on all routes. These headers are **required** for `SharedArrayBuffer` to be available in the browser. The dev server must also serve these headers; configure `nuxt.config.ts` with `routeRules` if testing SAB locally.

### Nuxt Configuration

Must be set to static/SPA mode — add to `nuxt.config.ts`:
```ts
ssr: false  // or use nuxt generate with target: 'static'
```
Wasm files in `public/` are served as static assets. Workers in `public/workers/` or handled via Nuxt's `app/assets/`.

### Image Processing Pipeline

```
Upload → Canvas/OffscreenCanvas → ImageData (RGBA)
  → write to SharedArrayBuffer
  → postMessage (SAB pointer + task) → Worker Pool
  → Worker calls Wasm API → mutates SAB in-place
  → main thread reads SAB → update canvas preview
  → download as PNG / WebP
```

Key constraint: **different workers must never write to overlapping memory regions**. Partition work by image rows or blocks before dispatching.

### Worker Pool Pattern

- Pool of `Worker` instances pre-initialized with the Wasm module.
- Main thread slices the image into row-ranges and dispatches one slice per worker.
- Progress is reported back via `Atomics` writes to a shared progress SAB or lightweight `postMessage` status packets.
- On OOM or worker crash: call `worker.terminate()` and reconstruct the worker instance; surface a user-friendly error.

### Memory Management

C++ functions compiled via Emscripten must expose a `free()` method. JavaScript **must** call it when:
- The user clicks "Clear Image"
- A new image is uploaded (overwriting the previous one)

Failing to call `free()` will leak Wasm linear memory across uploads.

### HEIC Support

HEIC images (from iOS) cannot be decoded by the browser natively. Before extracting `ImageData`, detect `image/heic` and pipe through `heic2any` (or a `libheif`-based Wasm decoder) to convert to a standard pixel format first.

## Key Files

| Path | Purpose |
|---|---|
| `nuxt.config.ts` | Nuxt config — must set SSG mode and COOP/COEP route rules for dev |
| `vercel.json` | Production COOP/COEP headers enabling SharedArrayBuffer |
| `app/app.vue` | Root component — single-page workspace layout |
| `requirement.md` | Full feature specification (Chinese) — source of truth for intended behavior |
| `public/` | Static assets: compiled `.wasm` files, worker scripts |

## UI Layout (per spec)

Single-page workspace, left-to-right or top-to-bottom flow:
1. **Global loading overlay** — shown while Wasm + Worker Pool initializes; blocks all interaction
2. **Preview area** (large) — dashed-border drop zone; shows original then processed image on `<canvas>`
3. **Control panel** — filter selector (dropdown/button group) → dynamic parameter sliders → "Start Processing" (primary) + "Clear" (danger)
4. **Output actions** — "Download PNG" and "Download WebP" appear after processing completes

Supported upload formats: `image/jpeg`, `image/png`, `image/webp`, `image/heic`
