'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const FEATURES = [
  {
    key: 'reminders',
    color: '#3B82F6',
    glow: 'rgba(59,130,246,0.15)',
    border: 'rgba(59,130,246,0.2)',
    bg: 'rgba(59,130,246,0.08)',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    key: 'flashcards',
    color: '#8B5CF6',
    glow: 'rgba(139,92,246,0.15)',
    border: 'rgba(139,92,246,0.2)',
    bg: 'rgba(139,92,246,0.08)',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M2 10h20M9 15l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'notes',
    color: '#10B981',
    glow: 'rgba(16,185,129,0.15)',
    border: 'rgba(16,185,129,0.2)',
    bg: 'rgba(16,185,129,0.08)',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    key: 'themes',
    color: '#F59E0B',
    glow: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.2)',
    bg: 'rgba(245,158,11,0.08)',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10" />
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      </svg>
    ),
  },
] as const;

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export default function Features() {
  const t = useTranslations('features');

  return (
    <section id="features" style={{ background: '#06050f', paddingTop: 96, paddingBottom: 96 }}>
      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="mb-4 inline-block rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-blue-400">
            {t('badge')}
          </span>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/40">{t('subtitle')}</p>
        </motion.div>

        {/* Bento grid */}
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {/* Card 0 — large, spans 2 rows on lg */}
          {FEATURES.map(({ key, color, glow, border, bg, icon }, i) => (
            <motion.div
              key={key}
              variants={cardVariants}
              className={`group relative overflow-hidden rounded-3xl p-8 ${i === 0 ? 'lg:row-span-2' : ''}`}
              style={{
                background: '#0e0d1e',
                border: `1px solid rgba(255,255,255,0.06)`,
              }}
              whileHover={{
                borderColor: border,
                boxShadow: `0 0 32px ${glow}`,
                y: -3,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              {/* Hover glow overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: `radial-gradient(ellipse 60% 50% at 30% 30%, ${glow} 0%, transparent 70%)`,
                }}
              />

              {/* Icon */}
              <div
                className="relative mb-6 inline-flex items-center justify-center rounded-2xl p-3"
                style={{ background: bg, color }}
              >
                {icon}
              </div>

              {/* Text */}
              <h3 className="relative mb-2 text-lg font-bold text-white">
                {t(`cards.${key}.title`)}
              </h3>
              <p className="relative text-sm leading-relaxed text-white/45">
                {t(`cards.${key}.desc`)}
              </p>

              {/* Large icon watermark for the hero card */}
              {i === 0 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute bottom-6 right-6 opacity-[0.06]"
                  style={{ color, transform: 'scale(4)', transformOrigin: 'bottom right' }}
                >
                  {icon}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
