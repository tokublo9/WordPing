import { useTranslations } from 'next-intl';

export default function DownloadCTA() {
  const t = useTranslations('cta');

  return (
    <section
      id="download"
      style={{
        background: '#06050f',
        paddingTop: 80,
        paddingBottom: 80,
      }}
    >
      {/* Gradient banner */}
      <div className="mx-auto max-w-5xl px-6">
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-16 text-center"
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e1b6a 40%, #3b0764 100%)',
            boxShadow: '0 0 80px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          {/* Glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 60% 60% at 50% -10%, rgba(99,102,241,0.4) 0%, transparent 70%)',
            }}
          />

          {/* Word ping logo icon */}
          <div className="relative mb-6 inline-flex">
            <div
              className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.2)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="WordPing" width={56} height={56} className="rounded-2xl" />
            </div>
          </div>

          <h2 className="relative mb-3 text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
            {t('title')}
          </h2>
          <p className="relative mx-auto mb-10 max-w-md text-white/60">{t('subtitle')}</p>

          <div className="relative inline-flex flex-col items-center gap-3">
            <span
              className="inline-flex items-center gap-3 rounded-2xl px-8 py-4 text-sm font-bold"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(8px)',
                cursor: 'default',
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              {t('button')}
            </span>
            <span className="text-xs text-white/30">{t('note')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
