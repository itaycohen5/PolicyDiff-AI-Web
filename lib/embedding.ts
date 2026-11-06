import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "node:path";

export const embeddingModel = "Xenova/all-MiniLM-L6-v2";
const shared = globalThis as typeof globalThis & { policyEncoder?: Promise<FeatureExtractionPipeline> };

function encoder() {
  env.localModelPath = path.resolve(".data", "models") + path.sep;
  env.allowRemoteModels = false;
  shared.policyEncoder ??= pipeline("feature-extraction", embeddingModel, { dtype: "q8" })
    .catch((error) => {
      shared.policyEncoder = undefined;
      throw error;
    });
  return shared.policyEncoder;
}

export async function embeddings(texts: string[]) {
  const model = await encoder();
  const rows: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += 16) {
    const tensor = await model(texts.slice(offset, offset + 16), { pooling: "mean", normalize: true });
    rows.push(...tensor.tolist() as number[][]);
  }
  return rows;
}

export function vectorLiteral(row: number[]) {
  return JSON.stringify(row);
}

export async function closeEncoder() {
  const model = await shared.policyEncoder;
  await model?.dispose();
  shared.policyEncoder = undefined;
}
