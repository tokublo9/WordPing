import { useTranslations } from 'next-intl';

const FEATURE_KEYS = ['flashcards', 'ai', 'test', 'notifications', 'themes', 'folders'] as const;

const ICONS: Record<typeof FEATURE_KEYS[number], React.ReactNode> = {
  flashcards: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
    </svg>
  ),
  ai: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-5 0v-15A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 8A2.5 2.5 0 0 1 17 10.5v9a2.5 2.5 0 0 1-5 0v-9A2.5 2.5 0 0 1 14.5 8Z" />
      <path d="M4.5 11A2.5 2.5 0 0 1 7 13.5v6a2.5 2.5 0 0 1-5 0v-6A2.5 2.5 0 0 1 4.5 11Z" />
    </svg>
  ),
  test: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  notifications: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  themes: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 10 10 0 1 0 0-20" />
    </svg>
  ),
  folders: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

export default function Features() {
  const t = useTranslations('features');

  return (
    <section id="features" className="py-24 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-widest">{t('badge')}</span>
          <h2 className="mt-3 text-4xl font-black text-gray-900 tracking-tight">{t('title')}</h2>
          <p className="mt-3 text-gray-500 text-lg">{t('subtitle')}</p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_KEYS.map(key => (
            <div
              key={key}
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                {ICONS[key]}
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1.5">{t(`cards.${key}.title`)}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{t(`cards.${key}.desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
