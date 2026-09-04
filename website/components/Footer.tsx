import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer style={{ background: 'var(--bg-alt)', borderTop: '1px solid var(--border)', paddingTop: 40, paddingBottom: 40 }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="overflow-hidden rounded-xl" style={{ width: 28, height: 28 }}>
              <Image src="/icon.png" alt="WordCore" width={28} height={28} className="object-cover" />
            </div>
            <span className="font-bold" style={{ color: 'var(--text)' }}>WordCore</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/privacy" className="text-xs transition-colors hover:text-blue-500 dark:hover:text-blue-400" style={{ color: 'var(--text-sub)' }}>
              {t('privacy')}
            </Link>
            <Link href="/terms" className="text-xs transition-colors hover:text-blue-500 dark:hover:text-blue-400" style={{ color: 'var(--text-sub)' }}>
              {t('terms')}
            </Link>
            <Link href="/licenses" className="text-xs transition-colors hover:text-blue-500 dark:hover:text-blue-400" style={{ color: 'var(--text-sub)' }}>
              {t('licenses')}
            </Link>
            <Link href="/support" className="text-xs transition-colors hover:text-blue-500 dark:hover:text-blue-400" style={{ color: 'var(--text-sub)' }}>
              {t('support')}
            </Link>
          </div>

          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--text-sub)' }}>{t('tagline')}</p>
            <p className="mt-1 text-xs opacity-50" style={{ color: 'var(--text-sub)' }}>{t('rights')}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
