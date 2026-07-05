import { useTranslations } from 'next-intl';

const STEPS = ['1', '2', '3'] as const;

export default function HowItWorks() {
  const t = useTranslations('how');

  return (
    <section id="how" className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-widest">{t('badge')}</span>
          <h2 className="mt-3 text-4xl font-black text-gray-900 tracking-tight">{t('title')}</h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {STEPS.map((step, i) => (
            <div key={step} className="flex flex-col items-center text-center md:items-start md:text-left">
              {/* Number */}
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white text-xl font-black flex items-center justify-center mb-5 shrink-0">
                {i + 1}
              </div>
              {/* Connector line (desktop only, between cards) */}
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t(`steps.${step}.title`)}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{t(`steps.${step}.desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
