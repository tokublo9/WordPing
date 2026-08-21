import Hero from '@/components/Hero';

/**
 * Kept under the existing export name so downstream imports stay stable. The
 * previous scroll-pinned timeline now resolves to the automatic product hero.
 */
export function CinematicHero() {
  return <Hero />;
}
