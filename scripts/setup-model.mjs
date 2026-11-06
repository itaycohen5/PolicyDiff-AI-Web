import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const model = "Xenova/all-MiniLM-L6-v2";
const revision = "cb3d680149bf9a3209564e1b27ab3bb355b65707";
const files = {
  "config.json": "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7",
  "tokenizer_config.json": "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3",
  "tokenizer.json": "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0",
  "onnx/model_quantized.onnx": "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1",
};
function checksum(file) {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}
for (const [name, hash] of Object.entries(files)) {
  const file = resolve(".data", "models", model, name);
  if (checksum(file) === hash) continue;
  mkdirSync(dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + ".tmp";
  try {
    execFileSync(process.platform === "win32" ? "curl.exe" : "curl",
      ["--fail", "--location", "--silent", "--show-error", "--retry", "4", "--retry-all-errors", "--max-time", "90",
        "https://huggingface.co/" + model + "/resolve/" + revision + "/" + name, "--output", temporary],
      { stdio: "inherit" });
    if (checksum(temporary) !== hash) throw new Error("Unexpected checksum for " + name);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}
console.log("MiniLM model files verified. Semantic search runs locally.");
