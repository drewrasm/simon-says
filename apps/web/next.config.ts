import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@simon-says/ui", "@prisma/client", "pg"],
};
export default nextConfig;
