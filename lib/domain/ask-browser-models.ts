// Prebuilt WebLLM models. Sizes are the Hugging Face weight shards plus the
// matching WebGPU wasm library (tokenizer files are small and extra).

export interface AskBrowserModel {
  id: string;
  label: string;
  bytes: number;
}

export const ASK_BROWSER_MODELS: readonly AskBrowserModel[] = [
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B",
    bytes: 868_547_584 + 5_225_782,
  },
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 3B",
    bytes: 1_736_187_904 + 5_438_957,
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B",
    bytes: 1_807_423_488 + 5_957_281,
  },
];

export const ASK_DEFAULT_MODEL_ID = ASK_BROWSER_MODELS[0].id;

export function formatDownload(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}
