import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@studio-os/ui', '@studio-os/contracts'],
  reactStrictMode: true,
};

export default nextConfig;
