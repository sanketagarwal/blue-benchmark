import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Basic Next.js config
  reactStrictMode: true,

  // Transpile workspace packages
  transpilePackages: ['@nullagent/agent-core', '@nullagent/database'],
};

export default nextConfig;
