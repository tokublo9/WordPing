import { useTranslations } from 'next-intl';

const FEATURES = [
  {
    key: 'reminders',
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.1)',
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
    bg: 'rgba(139,92,246,0.1)',
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
    bg: 'rgba(16,185,129,0.1)',
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
    bg: 'rgba(245,158,11,0.1)',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10" />
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      </svg>
    ),
  },
] as const;

export default function Features() {
  const t = useTranslations('features');

  return (
    <section
      id="features"
      style={{ background: '#06050f', paddingTop: 96, paddingBottom: 96 }}
    >
      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-blue-400">
            {t('badge')}
          </span>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/40">{t('subtitle')}</p>
        </div>

        {/* 2×2 grid */}
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map(({ key, color, bg, icon }) => (
            <div
              key={key}
              className="group rounded-3xl p-8 transition-colors"
              style={{
                background: '#0e0d1e',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Icon */}
              <div
                className="mb-6 inline-flex items-center justify-center rounded-2xl p-3"
                style={{ background: bg, color }}
              >
                {icon}
              </div>
              {/* Text */}
              <h3 className="mb-2 text-lg font-bold text-white">
                {t(`cards.${key}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-white/45">
                {t(`cards.${key}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
