import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// WebLLM runs here so model init and token generation stay off the UI thread.
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
