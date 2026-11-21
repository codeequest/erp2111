import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // The browser calls /api/v1/* on the web origin; Next.js forwards it to the
  // NestJS API. Same origin = the refresh cookie works without CORS tricks.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
