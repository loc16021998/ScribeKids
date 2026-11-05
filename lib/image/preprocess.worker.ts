/// <reference lib="webworker" />
import { preprocessHandwriting, type PreprocessOptions } from "./preprocess";

type Request = {
  id: number;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  options?: PreprocessOptions;
};

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, data, width, height, options } = event.data;
  try {
    const result = preprocessHandwriting(data, width, height, options);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, result }, [result.data.buffer]);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
