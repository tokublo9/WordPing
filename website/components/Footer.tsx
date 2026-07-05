import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="bg-gray-900 border-t border-white/10 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-black">WP</span>
          </div>
          <span className="text-white font-bold">WordPing</span>
        </div>
        <p className="text-gray-500 text-sm">{t('tagline')}</p>
        <p className="text-gray-600 text-xs">{t('rights')}</p>
      </div>
    </footer>
  );
}
