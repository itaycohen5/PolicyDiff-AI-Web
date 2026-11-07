import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/[...path]/route";
import { readRequestBody } from "../lib/http";
import { uploadInput } from "../lib/contracts";

function post(resource: string, body: string, headers: Record<string, string> = {}) {
  return POST(new Request("http://localhost/api/" + resource, {
    method: "POST", body,
    headers: { host: "localhost", "content-type": "application/json", ...headers },
  }), { params: Promise.resolve({ path: resource.split("/") }) });
}

test("upload dates exclude year zero before PostgreSQL insertion", () => {
  const version = { name: "Date-boundary policy", label: "Edition", effectiveOn: "0000-01-01" };
  assert.equal(uploadInput.safeParse(version).success, false);
  assert.equal(uploadInput.safeParse({ ...version, effectiveOn: "0001-01-01" }).success, true);
});

test("mutating API rejects cross-origin and cross-site requests", async () => {
  const foreignOrigin = await post("comparisons", "{}", { origin: "https://untrusted.example" });
  assert.equal(foreignOrigin.status, 403);
  const foreignSite = await post("comparisons", "{}", { "sec-fetch-site": "cross-site" });
  assert.equal(foreignSite.status, 403);
});

test("comparison API rejects invalid JSON and bounds UTF-8 body bytes", async () => {
  const invalidJson = await post("comparisons", "{invalid}");
  assert.equal(invalidJson.status, 400);
  assert.equal(typeof (await invalidJson.json()).error, "string");
  const oversized = await post("comparisons", JSON.stringify({ question: "א".repeat(2500) }));
  assert.equal(oversized.status, 413);
  const understatedLength = await post("comparisons", "x".repeat(4097), { "content-length": "1" });
  assert.equal(understatedLength.status, 413);
});

test("malformed upload requests return a useful client error", async () => {
  const invalidForm = await post("versions", "broken multipart form", {
    "content-type": "multipart/form-data; boundary=missing", "content-length": "21",
  });
  assert.equal(invalidForm.status, 400);
  assert.equal(typeof (await invalidForm.json()).error, "string");
});

test("public demo blocks upload before parsing the request body", async () => {
  const previous = process.env.POLICYDIFF_DEMO_ONLY;
  process.env.POLICYDIFF_DEMO_ONLY = "1";
  try {
    const response = await post("versions", "not a valid form");
    assert.equal(response.status, 403);
  } finally {
    if (previous === undefined) delete process.env.POLICYDIFF_DEMO_ONLY;
    else process.env.POLICYDIFF_DEMO_ONLY = previous;
  }
});

function streamRequest(parts: Uint8Array[], headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/comparisons", {
    method: "POST", headers: { host: "localhost", ...headers },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        parts.forEach((part) => controller.enqueue(part));
        controller.close();
      },
    }), duplex: "half",
  } as RequestInit);
}

test("body limits accept chunked requests and enforce actual streamed bytes", async () => {
  const parts = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
  assert.deepEqual(await readRequestBody(streamRequest(parts), 4), new Uint8Array([1, 2, 3, 4]));
  await assert.rejects(readRequestBody(streamRequest(parts, { "content-length": "1" }), 3),
    (error: unknown) => error instanceof Error && "status" in error && error.status === 413);
  const invalidUtf8 = streamRequest([new Uint8Array([0xc3, 0x28])]);
  const response = await POST(invalidUtf8, { params: Promise.resolve({ path: ["comparisons"] }) });
  assert.equal(response.status, 400);
});

test("a stalled body times out and cancels its reader", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  const request = new Request("http://localhost/api/versions", {
    method: "POST", body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half",
  } as RequestInit);
  const pending = readRequestBody(request, 100);
  const rejected = assert.rejects(pending,
    (error: unknown) => error instanceof Error && "status" in error && error.status === 408);
  t.mock.timers.tick(30_000);
  await rejected;
  assert.equal(cancelled, true);
});
