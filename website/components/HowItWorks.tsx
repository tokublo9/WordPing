'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const STEP_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'] as const;

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

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
        background: '#09091a',
        paddingTop: 96,
        paddingBottom: 96,
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="mb-4 inline-block rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-purple-400">
            {t('badge')}
          </span>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            {t('title')}
          </h2>
        </motion.div>

        {/* Steps */}
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
              {/* Connector line (desktop) */}
              {i < 3 && (
                <motion.div
                  className="absolute hidden lg:block"
                  aria-hidden
                  style={{
                    top: 20,
                    left: 'calc(100% - 0px)',
                    width: '100%',
                    height: 1,
                    background: `linear-gradient(90deg, ${STEP_COLORS[i]}60, rgba(255,255,255,0.03))`,
                    zIndex: 0,
                  }}
                  initial={{ scaleX: 0, originX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.12 + 0.3, ease: 'easeOut' }}
                />
              )}

              {/* Number badge */}
              <motion.div
                className="relative z-10 mb-5 flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black text-white"
                style={{ background: STEP_COLORS[i] }}
                whileHover={{ scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {i + 1}
              </motion.div>

              <h3 className="mb-2 text-base font-bold text-white">
                {t(`steps.${step}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-white/40">
                {t(`steps.${step}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
