/**
 * useWorkerPool.ts
 * Manages a pool of processor.worker.js instances.
 * Dispatches row-partitioned image processing tasks in parallel.
 */

export interface ProcessTask {
  inputSab: SharedArrayBuffer;
  outputSab: SharedArrayBuffer;
  width: number;
  height: number;
  filter: string;
  params: Record<string, number>;
  progressSab: SharedArrayBuffer;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
}

import { workerConfig } from "../config/worker.config";

export function useWorkerPool() {
  const poolSize = () => workerConfig.getOptimalPoolSize();
  // shallowRef avoids Vue making Worker instances deeply reactive
  const slots = shallowRef<WorkerSlot[]>([]);
  const ready = ref(false);

  async function init(): Promise<void> {
    if (slots.value.length > 0) {
      terminateAll();
    }

    const promises: Promise<void>[] = [];

    for (let i = 0; i < poolSize(); i++) {
      const p = new Promise<void>((resolve, reject) => {
        const worker = new Worker("/workers/processor.worker.js");
        worker.onmessage = (e) => {
          if (e.data.type === "ready") {
            slots.value = [...slots.value, { worker, busy: false }];
            resolve();
          }
        };
        worker.onerror = reject;
        worker.postMessage({ type: "init" });
      });
      promises.push(p);
    }

    await Promise.all(promises);
    ready.value = true;
  }

  function process(task: ProcessTask): Promise<void> {
    return new Promise((resolve, reject) => {
      const {
        inputSab,
        outputSab,
        width,
        height,
        filter,
        params,
        progressSab,
      } = task;
      const rowsPerWorker = Math.ceil(height / slots.value.length);

      let completed = 0;
      const total = slots.value.length;

      slots.value.forEach((slot, i) => {
        const startRow = i * rowsPerWorker;
        const endRow = Math.min(startRow + rowsPerWorker, height);

        if (startRow >= height) {
          completed++;
          if (completed === total) resolve();
          return;
        }

        slot.busy = true;

        const onMessage = (e: MessageEvent) => {
          if (e.data.workerIndex !== i) return;
          slot.worker.removeEventListener("message", onMessage);
          slot.busy = false;

          if (e.data.type === "error") {
            reject(new Error(e.data.message));
            return;
          }

          completed++;
          if (completed === total) resolve();
        };

        const onError = (e: ErrorEvent) => {
          slot.worker.removeEventListener("error", onError);
          slot.busy = false;
          reject(new Error(e.message));
        };

        slot.worker.addEventListener("message", onMessage);
        slot.worker.addEventListener("error", onError);

        slot.worker.postMessage({
          type: "process",
          payload: {
            inputSab,
            outputSab,
            width,
            height,
            startRow,
            endRow,
            filter,
            params,
            progressSab,
            workerIndex: i,
          },
        });
      });
    });
  }

  function terminateAll() {
    slots.value.forEach((s) => s.worker.terminate());
    slots.value = [];
    ready.value = false;
  }

  return { init, process, terminateAll, ready, poolSize };
}
