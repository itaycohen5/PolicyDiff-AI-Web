import { RequestError } from "./errors";

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const body = await readRequestBody(request, maxBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new RequestError("The request must contain valid UTF-8 text.", 400);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("The request must contain valid JSON.", 400);
  }
}

export async function readRequestBody(request: Request, maxBytes: number) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    throw new RequestError("Invalid content length.", 400);
  }
  if (length !== null && Number(length) > maxBytes) {
    throw new RequestError("The request body is too large.", 413);
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestError("The request timed out. Try again.", 408)), 30_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestError("The request body is too large.", 413);
      chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof RequestError) throw error;
    throw new RequestError("The request body could not be read. Try again.", 400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
