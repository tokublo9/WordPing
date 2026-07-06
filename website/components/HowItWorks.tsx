'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const STEP_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'] as const;

const stepVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.12, ease: EASE },
  }),
};

export default function HowItWorks() {
  const t = useTranslations('how');

  return (
    <section
      id="how"
      style={{
        background: 'var(--bg-alt)',
        paddingTop: 96,
        paddingBottom: 96,
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <span
            className="mb-4 inline-block rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400"
            style={{ borderColor: 'rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.08)' }}
          >
            {t('badge')}
          </span>
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl" style={{ color: 'var(--text)' }}>
            {t('title')}
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {(['1', '2', '3', '4'] as const).map((step, i) => (
            <motion.div
              key={step}
              className="relative flex flex-col"
              variants={stepVariants}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
            >
              {i < 3 && (
                <motion.div
                  className="absolute hidden lg:block"
                  aria-hidden
                  style={{
                    top: 20, left: 'calc(100% - 0px)',
                    width: '100%', height: 1,
                    background: `linear-gradient(90deg, ${STEP_COLORS[i]}50, transparent)`,
                    zIndex: 0,
                  }}
                  initial={{ scaleX: 0, originX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.12 + 0.3, ease: 'easeOut' }}
                />
              )}

              <motion.div
                className="relative z-10 mb-5 flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black text-white"
                style={{ background: STEP_COLORS[i] }}
                whileHover={{ scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {i + 1}
              </motion.div>

              <h3 className="mb-2 text-base font-bold" style={{ color: 'var(--text)' }}>
                {t(`steps.${step}.title`)}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-sub)' }}>
                {t(`steps.${step}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
