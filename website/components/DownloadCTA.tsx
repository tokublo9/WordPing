import { useTranslations } from 'next-intl';
import AppStoreBadge from './AppStoreBadge';

export default function DownloadCTA() {
  const t = useTranslations('cta');

  return (
    <section id="download" className="py-24 px-6 bg-gray-900">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-4xl font-black text-white tracking-tight mb-4">{t('title')}</h2>
        <p className="text-gray-400 text-lg mb-10">{t('subtitle')}</p>
        <AppStoreBadge className="mx-auto" />
      </div>
    </section>
  );
}
