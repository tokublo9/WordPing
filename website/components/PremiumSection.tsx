'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const ITEMS = [
  {
    key: 'colors' as const,
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    key: 'skins' as const,
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    key: 'personal' as const,
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    ),
  },
];

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: EASE },
  }),
};

export default function PremiumSection() {
  const t = useTranslations('premium');

  return (
    <section id="premium" style={{ background: 'var(--bg-page)', paddingTop: 96, paddingBottom: 96 }}>
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          className="relative overflow-hidden rounded-3xl p-10 text-center md:p-16"
          style={{
            background: 'linear-gradient(145deg, #111030 0%, #0a0820 50%, #0e0c28 100%)',
            border: '1px solid rgba(139,92,246,0.22)',
          }}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: EASE }}
          whileHover={{ boxShadow: '0 0 80px rgba(139,92,246,0.18)' }}
        >
          {/* Animated aurora glow */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(139,92,246,0.2) 0%, transparent 70%)',
            }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="relative">
            <motion.span
              className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
              style={{ border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              ★ {t('badge')}
            </motion.span>

            <motion.h2
              className="mb-4 text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            >
              {t('title')}
            </motion.h2>
            <motion.p
              className="mx-auto mb-12 max-w-lg text-white/40"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
            >
              {t('subtitle')}
            </motion.p>

            <div className="grid gap-5 sm:grid-cols-3">
              {ITEMS.map(({ key, icon }, i) => (
                <motion.div
                  key={key}
                  className="group rounded-2xl p-6 text-left"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  variants={itemVariants}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  whileHover={{
                    background: 'rgba(139,92,246,0.08)',
                    borderColor: 'rgba(139,92,246,0.25)',
                    y: -3,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                >
                  <div
                    className="mb-4 inline-flex items-center justify-center rounded-xl p-2.5"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}
                  >
                    {icon}
                  </div>
                  <h3 className="mb-1.5 font-bold text-white">{t(`${key}_title`)}</h3>
                  <p className="text-sm leading-relaxed text-white/40">{t(`${key}_desc`)}</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="mt-10"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <span
                className="inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-sm font-bold text-white/60"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'default' }}
              >
                🔜 {t('cta')}
              </span>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
