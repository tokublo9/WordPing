import { useTranslations } from 'next-intl';
import AppStoreBadge from './AppStoreBadge';

export default function Hero() {
  const t = useTranslations('hero');

  return (
    <section className="relative overflow-hidden bg-white pt-20 pb-28 px-6">
      {/* Subtle background blob */}
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-blue-50 opacity-60 blur-3xl pointer-events-none"
      />

      <div className="relative max-w-3xl mx-auto text-center">
        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full mb-6">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm.75 4.75a.75.75 0 00-1.5 0v4.59L7.3 9.4a.75.75 0 10-1.1 1.02l2.5 2.7a.75.75 0 001.1 0l2.5-2.7a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" />
          </svg>
          {t('badge')}
        </span>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl font-black text-gray-900 leading-tight tracking-tight mb-6 whitespace-pre-line">
          {t('title')}
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-gray-500 leading-relaxed max-w-xl mx-auto mb-10">
          {t('subtitle')}
        </p>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          <AppStoreBadge />
          <p className="text-xs text-gray-400">{t('ctaNote')}</p>
        </div>
      </div>
    </section>
  );
}
