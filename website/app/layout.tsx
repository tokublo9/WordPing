import type { ReactNode } from 'react';

// Root layout is intentionally minimal — the [locale] layout owns <html> and <body>.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children as React.ReactElement;
}
