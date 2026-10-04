import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the LangChain / Deep Agents runtime as plain Node modules on the
  // server instead of bundling them (they have optional native/ws deps).
  serverExternalPackages: ["deepagents", "langsmith", "langchain", "@langchain/core", "@langchain/langgraph", "@langchain/anthropic"],
};

export default nextConfig;
