import type { WorkerRequest, WorkerResponse } from "./permit-checker.worker.ts";

export interface PermitCheckerWorker extends Worker {
  postMessage: (message: WorkerRequest) => void;
}

let sharedWorker: PermitCheckerWorker | null = null;
let initPromise: Promise<void> | null = null;

export function getPermitCheckerWorker() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL or Anon Key missing in frontend environment variables.");
  }

  if (!sharedWorker) {
    sharedWorker = new Worker(new URL("./permit-checker.worker.ts", import.meta.url), {
      type: "module",
    }) as PermitCheckerWorker;
  }

  if (!initPromise) {
    initPromise = new Promise<void>((resolve, reject) => {
      const worker = sharedWorker;
      if (!worker) return reject(new Error("Worker not available"));

      const cleanup = () => {
        worker.removeEventListener("message", onMessage as EventListener);
        worker.removeEventListener("error", onError as EventListener);
      };

      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        const data = event.data;
        if (data.type === "INIT_SUCCESS") {
          cleanup();
          resolve();
        }
        if (data.type === "INIT_ERROR") {
          cleanup();
          reject(new Error(data.error));
        }
      };

      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message));
      };

      worker.addEventListener("message", onMessage as EventListener);
      worker.addEventListener("error", onError as EventListener);
      worker.postMessage({
        type: "INIT",
        payload: { supabaseUrl, supabaseAnonKey },
      });
    });
  }

  return { worker: sharedWorker, ready: initPromise };
}
