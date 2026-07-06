'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import PhoneMockup from './PhoneMockup';

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
        background: '#06050f',
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* Aurora blob 1 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)',
          top: '-15%',
          right: '-10%',
          filter: 'blur(60px)',
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Aurora blob 2 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 70%)',
          bottom: '-10%',
          left: '-5%',
          filter: 'blur(80px)',
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-28 md:py-32">
        <div className="flex flex-col items-center gap-16 lg:flex-row lg:items-center lg:gap-12">

          {/* ── Left: copy ── */}
          <div className="flex-1 text-center lg:text-left">
            {/* Badge */}
            <motion.div {...fadeUp(0)} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-blue-400 backdrop-blur-sm">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-blue-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              {t('badge')}
            </motion.div>

            {/* Headline */}
            <motion.h1
              {...fadeUp(0.1)}
              className="mb-6 text-balance text-5xl font-black leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl"
            >
              {t('titleLine1')}{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #60a5fa 100%)',
                  backgroundSize: '200% auto',
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
              className="mx-auto mb-10 max-w-md text-balance text-lg leading-relaxed text-white/50 lg:mx-0"
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
                  boxShadow: '0 8px 32px rgba(59,130,246,0.35)',
                }}
                whileHover={{ scale: 1.03, boxShadow: '0 12px 40px rgba(59,130,246,0.5)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                {t('cta')}
              </motion.a>
              <p className="text-xs text-white/30">{t('ctaNote')}</p>
            </motion.div>
          </div>

          {/* ── Right: phone mockup ── */}
          <motion.div
            className="flex-shrink-0 lg:flex-1 lg:flex lg:justify-center"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
          >
            <PhoneMockup />
          </motion.div>
        </div>
      </div>

      {/* Bottom fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-32"
        style={{ background: 'linear-gradient(to bottom, transparent, #06050f)' }}
      />
    </section>
  );
}
