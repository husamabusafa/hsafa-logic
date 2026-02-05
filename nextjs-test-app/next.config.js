/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@assistant-ui/react", "@hsafa/react-sdk", "@hsafa/ui-sdk"],
  // Disable static generation for pages that require runtime context
  output: "standalone",
};

export default nextConfig;
