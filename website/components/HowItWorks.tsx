import { useTranslations } from 'next-intl';

const STEP_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'] as const;

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
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-purple-400">
            {t('badge')}
          </span>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            {t('title')}
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {(['1', '2', '3', '4'] as const).map((step, i) => (
            <div key={step} className="relative flex flex-col">
              {/* Connector line (desktop) */}
              {i < 3 && (
                <div
                  className="absolute hidden lg:block"
                  aria-hidden
                  style={{
                    top: 20,
                    left: 'calc(100% - 0px)',
                    width: '100%',
                    height: 1,
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))',
                    zIndex: 0,
                  }}
                />
              )}

              {/* Number badge */}
              <div
                className="relative z-10 mb-5 flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black text-white"
                style={{ background: STEP_COLORS[i] }}
              >
                {i + 1}
              </div>

              <h3 className="mb-2 text-base font-bold text-white">
                {t(`steps.${step}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-white/40">
                {t(`steps.${step}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
