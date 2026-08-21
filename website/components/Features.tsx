'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const FEATURE_KEYS = [
  'local',
  'modes',
  'organization',
  'management',
  'reminders',
  'voice',
  'backup',
  'themes',
] as const;

const COLORS = ['#2563EB', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#0284C7', '#8B5CF6'];

function FeatureIcon({ index }: { index: number }) {
  const paths = [
    <><path d="M4 6h16v12H4z" /><path d="M8 21h8M12 18v3" /></>,
    <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m9 9 6 3-6 3V9z" /></>,
    <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="7" r="3" /><circle cx="7" cy="17" r="3" /><path d="M14 17h6" /></>,
    <><path d="M3 6h7l2 2h9v10H3z" /><path d="M7 12h10M7 15h7" /></>,
    <><path d="M6 8a6 6 0 0 1 12 0c0 6 3 9 3 9H3s3-3 3-9" /><path d="M10 21h4" /></>,
    <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
    <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18" /><circle cx="12" cy="12" r="3" /></>,
  ];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">{paths[index]}</svg>;
}

export default function Features() {
  const t = useTranslations('features');

  return (
    <section id="features" className="py-24" style={{ background: 'var(--bg-page)' }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="mb-14 text-center">
          <span className="mb-4 inline-block rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-blue-500">{t('badge')}</span>
          <h2 className="text-balance text-4xl font-black tracking-tight sm:text-5xl" style={{ color: 'var(--text)' }}>{t('title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7" style={{ color: 'var(--text-sub)' }}>{t('subtitle')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_KEYS.map((key, index) => {
            const color = COLORS[index];
            return (
              <motion.article
                key={key}
                className="rounded-3xl border p-6"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.45, delay: (index % 4) * 0.06 }}
              >
                <div className="mb-5 inline-flex rounded-2xl p-3" style={{ color, background: `${color}16` }}>
                  <FeatureIcon index={index} />
                </div>
                <h3 className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>{t(`cards.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-sub)' }}>{t(`cards.${key}.desc`)}</p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
