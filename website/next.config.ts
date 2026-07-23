import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the output tracing root to this directory so Next.js doesn't walk up
  // to the Expo monorepo root and get confused by its package-lock.json.
  outputFileTracingRoot: path.join(path.dirname(new URL(import.meta.url).pathname), '..'),
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
      ],
    }];
  },
};

export default withNextIntl(nextConfig);
