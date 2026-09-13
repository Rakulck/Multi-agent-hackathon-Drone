import type { NextConfig } from "next";

const nextConfig: NextConfig & { agentRules?: boolean } = {
  reactStrictMode: true,
  agentRules: false,
  turbopack: {},
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.next/**", "**/drone-fleet-intelligence-starter/**"],
      };
    }

    return config;
  },
};

export default nextConfig;
