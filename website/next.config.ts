import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the output tracing root to this directory so Next.js doesn't walk up
  // to the Expo monorepo root and get confused by its package-lock.json.
  outputFileTracingRoot: path.join(path.dirname(new URL(import.meta.url).pathname), '..'),
};

export default withNextIntl(nextConfig);
