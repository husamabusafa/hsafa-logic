/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@assistant-ui/react", "@hsafa/react", "@hsafa/ui"],
  output: "standalone",
};

export default nextConfig;
