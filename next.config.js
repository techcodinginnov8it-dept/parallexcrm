const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['playwright-chromium'],
  outputFileTracingRoot: path.resolve(__dirname),
  outputFileTracingIncludes: {
    '/api/prospect/search': [
      './node_modules/playwright-core/.local-browsers/**/*',
    ],
    '/api/prospect/enrich': [
      './node_modules/playwright-core/.local-browsers/**/*',
    ],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
};

module.exports = nextConfig;
