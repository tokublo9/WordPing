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
      style={{ background: 'var(--bg-page)', minHeight: '100svh', display: 'flex', alignItems: 'center' }}
    >
      {/* Aurora blobs — dark mode only */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute hidden dark:block"
        style={{
          width: 640, height: 640, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 70%)',
          top: '-10%', right: '-8%', filter: 'blur(72px)',
        }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute hidden dark:block"
        style={{
          width: 480, height: 480, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
          bottom: '-12%', left: '-6%', filter: 'blur(88px)',
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* Light mode soft tint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{ background: 'radial-gradient(ellipse 55% 50% at 72% 38%, rgba(59,130,246,0.06) 0%, transparent 70%)' }}
      />

      {/* Grid overlay — dark only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden opacity-[0.022] dark:block"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-28 md:py-32">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-20">

          {/* ── Copy ── */}
          <div className="flex-1 text-center lg:text-left">
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

            <motion.h1
              {...fadeUp(0.1)}
              className="mb-6 text-balance text-5xl font-black leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl"
              style={{ color: 'var(--text)' }}
            >
              {t('titleLine1')}{' '}
              <span style={{
                background: 'linear-gradient(135deg,#3B82F6 0%,#8B5CF6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {t('titleHighlight')}
              </span>
            </motion.h1>

            <motion.p
              {...fadeUp(0.2)}
              className="mx-auto mb-10 max-w-md text-balance text-lg leading-relaxed lg:mx-0"
              style={{ color: 'var(--text-sub)' }}
            >
              {t('subtitle')}
            </motion.p>

            <motion.div {...fadeUp(0.3)} className="flex flex-col items-center gap-3 lg:items-start">
              <motion.a
                href="#download"
                className="inline-flex items-center gap-3 rounded-2xl px-7 py-4 text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#3B82F6 0%,#8B5CF6 100%)', boxShadow: '0 8px 32px rgba(59,130,246,0.3)' }}
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

          {/* ── Two phone mockups ── */}
          <motion.div
            className="relative flex-shrink-0"
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
          >
            {/* Glow behind phones */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background: 'radial-gradient(ellipse 90% 70% at 45% 55%, rgba(59,130,246,0.16) 0%, rgba(139,92,246,0.08) 55%, transparent 80%)',
                filter: 'blur(40px)',
                transform: 'scale(1.3)',
              }}
            />

            {/* Phone pair wrapper — handles overlap */}
            <div className="relative flex items-end">

              {/* LEFT — Notification lock screen (primary, foreground) */}
              <motion.div
                style={{ position: 'relative', zIndex: 2 }}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div
                  className="overflow-hidden"
                  style={{
                    width: 'clamp(180px, 28vw, 255px)',
                    borderRadius: 'clamp(32px, 5vw, 44px)',
                    boxShadow: [
                      '0 2px 0 0.5px rgba(255,255,255,0.12) inset',
                      '0 60px 120px rgba(0,0,0,0.32)',
                      '0 24px 48px rgba(0,0,0,0.18)',
                      '0 8px 16px rgba(0,0,0,0.10)',
                      '0 0 0 0.75px rgba(0,0,0,0.09)',
                    ].join(','),
                  }}
                >
                  <Image
                    src="/images/notification-lock-screen.png"
                    alt="WordPing notification on iPhone lock screen"
                    width={390}
                    height={844}
                    className="block w-full"
                    priority
                  />
                </div>

                {/* Caption chip */}
                <motion.div
                  className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-semibold text-white"
                  style={{ background: 'rgba(59,130,246,0.82)', backdropFilter: 'blur(8px)' }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.9, ease: EASE }}
                >
                  🔔 Smart reminders
                </motion.div>
              </motion.div>

              {/* RIGHT — Word list (secondary, sits behind + lower) */}
              <motion.div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  marginLeft: 'clamp(-28px, -4vw, -36px)',
                  marginTop: 'clamp(32px, 6vw, 56px)',
                }}
                animate={{ y: [0, 9, 0] }}
                transition={{ duration: 6.8, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}
              >
                <div
                  className="overflow-hidden"
                  style={{
                    width: 'clamp(148px, 22vw, 208px)',
                    borderRadius: 'clamp(28px, 4.5vw, 38px)',
                    boxShadow: [
                      '0 2px 0 0.5px rgba(255,255,255,0.10) inset',
                      '0 40px 80px rgba(0,0,0,0.22)',
                      '0 16px 36px rgba(0,0,0,0.13)',
                      '0 0 0 0.75px rgba(0,0,0,0.08)',
                    ].join(','),
                    opacity: 0.92,
                  }}
                >
                  <Image
                    src="/images/word-list.png"
                    alt="WordPing word list screen"
                    width={390}
                    height={844}
                    className="block w-full"
                    priority
                  />
                </div>

                {/* Caption chip */}
                <motion.div
                  className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-semibold text-white"
                  style={{ background: 'rgba(100,116,139,0.72)', backdropFilter: 'blur(8px)' }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 1.1, ease: EASE }}
                >
                  📖 Your word list
                </motion.div>
              </motion.div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* Bottom fade into next section */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-28"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-page))' }}
      />
    </section>
  );
}
