import { createRequire } from "module";
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@assistant-ui/react"],
  output: "standalone",
  webpack: (config) => {
    // Force all workspace packages to share a single @assistant-ui/react instance.
    // pnpm can create duplicate copies with different peer-dep contexts, which
    // breaks React context (AssistantRuntimeProvider not visible to children).
    config.resolve.alias["@assistant-ui/react"] = require.resolve(
      "@assistant-ui/react"
    );
    return config;
  },
};

export default nextConfig;
