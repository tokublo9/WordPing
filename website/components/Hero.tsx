'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: EASE },
});

export default function Hero() {
  const t = useTranslations('hero');

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: 'var(--bg-page)',
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* Aurora blobs — dark mode only */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute dark:block hidden"
        style={{
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)',
          top: '-15%', right: '-10%', filter: 'blur(60px)',
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute dark:block hidden"
        style={{
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 70%)',
          bottom: '-10%', left: '-5%', filter: 'blur(80px)',
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* Light mode subtle gradient top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 70% 40%, rgba(59,130,246,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Subtle grid — dark mode only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025] dark:block hidden"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-28 md:py-32">
        <div className="flex flex-col items-center gap-16 lg:flex-row lg:items-center lg:gap-16">

          {/* ── Left: copy ── */}
          <div className="flex-1 text-center lg:text-left">
            {/* Badge */}
            <motion.div
              {...fadeUp(0)}
              className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold text-blue-500 dark:text-blue-400"
              style={{ borderColor: 'var(--border)', background: 'rgba(59,130,246,0.08)' }}
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-blue-500 dark:bg-blue-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              {t('badge')}
            </motion.div>

            {/* Headline */}
            <motion.h1
              {...fadeUp(0.1)}
              className="mb-6 text-balance text-5xl font-black leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl"
              style={{ color: 'var(--text)' }}
            >
              {t('titleLine1')}{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {t('titleHighlight')}
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              {...fadeUp(0.2)}
              className="mx-auto mb-10 max-w-md text-balance text-lg leading-relaxed lg:mx-0"
              style={{ color: 'var(--text-sub)' }}
            >
              {t('subtitle')}
            </motion.p>

            {/* CTA */}
            <motion.div {...fadeUp(0.3)} className="flex flex-col items-center gap-3 lg:items-start">
              <motion.a
                href="#download"
                className="inline-flex items-center gap-3 rounded-2xl px-7 py-4 text-sm font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                  boxShadow: '0 8px 32px rgba(59,130,246,0.3)',
                }}
                whileHover={{ scale: 1.03, boxShadow: '0 12px 40px rgba(59,130,246,0.45)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                {t('cta')}
              </motion.a>
              <p className="text-xs" style={{ color: 'var(--text-sub)' }}>{t('ctaNote')}</p>
            </motion.div>
          </div>

          {/* ── Right: screenshots ── */}
          <motion.div
            className="relative flex-shrink-0 flex items-end justify-center gap-4"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
          >
            {/* Glow behind */}
            <div
              aria-hidden
              className="absolute inset-0 -z-10"
              style={{
                background: 'radial-gradient(ellipse 70% 60% at 50% 60%, rgba(59,130,246,0.18) 0%, rgba(139,92,246,0.1) 50%, transparent 80%)',
                filter: 'blur(32px)',
              }}
            />

            {/* Secondary screenshot — partially behind, left */}
            <motion.div
              className="relative hidden lg:block"
              style={{ marginBottom: -24 }}
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
            >
              <div
                className="overflow-hidden rounded-[32px]"
                style={{
                  width: 180,
                  boxShadow: '0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
                }}
              >
                <Image
                  src="/iphone2.png"
                  alt="Flip card view"
                  width={390}
                  height={844}
                  className="block w-full"
                  priority
                />
              </div>
            </motion.div>

            {/* Main screenshot — front and center */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div
                className="overflow-hidden rounded-[40px]"
                style={{
                  width: 230,
                  boxShadow: '0 40px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
                }}
              >
                <Image
                  src="/iphone1.png"
                  alt="WordPing word list"
                  width={390}
                  height={844}
                  className="block w-full"
                  priority
                />
              </div>
            </motion.div>

            {/* Tertiary screenshot — right, peeking */}
            <motion.div
              className="relative hidden xl:block"
              style={{ marginBottom: -40 }}
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
            >
              <div
                className="overflow-hidden rounded-[32px]"
                style={{
                  width: 160,
                  boxShadow: '0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
                }}
              >
                <Image
                  src="/iphone3.png"
                  alt="Test mode"
                  width={390}
                  height={844}
                  className="block w-full"
                  priority
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Bottom fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-32"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-page))' }}
      />
    </section>
  );
}
