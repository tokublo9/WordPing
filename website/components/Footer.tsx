import Image from 'next/image';
import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer style={{ background: 'var(--bg-alt)', borderTop: '1px solid var(--border)', paddingTop: 40, paddingBottom: 40 }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="overflow-hidden rounded-xl" style={{ width: 28, height: 28 }}>
              <Image src="/icon.png" alt="WordPing" width={28} height={28} className="object-cover" />
            </div>
            <span className="font-bold" style={{ color: 'var(--text)' }}>WordPing</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#" className="text-xs transition-colors hover:text-blue-500 dark:hover:text-blue-400" style={{ color: 'var(--text-sub)' }}>
              Privacy
            </a>
            <a href="#" className="text-xs transition-colors hover:text-blue-500 dark:hover:text-blue-400" style={{ color: 'var(--text-sub)' }}>
              Terms
            </a>
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
