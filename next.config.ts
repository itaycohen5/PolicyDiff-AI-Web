import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "@huggingface/transformers", "onnxruntime-node", "pg"],
};
export default config;
