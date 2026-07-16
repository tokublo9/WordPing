'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { localeNames, locales, type Locale } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const currentLocale = params.locale as Locale;

  function onLocaleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(pathname, { locale: e.target.value as Locale });
  }

  return (
    <header className="fixed top-0 z-50 w-full">
      <div
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
        style={{
          background: 'var(--bg-header)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <div className="overflow-hidden rounded-xl" style={{ width: 32, height: 32 }}>
            <Image src="/icon.png" alt="WordMemo" width={32} height={32} className="object-cover" />
          </div>
          <span className="text-base font-bold" style={{ color: 'var(--text)' }}>WordMemo</span>
        </a>

        {/* Nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {(['features', 'howItWorks', 'premium'] as const).map(key => (
            <a
              key={key}
              href={`#${key === 'howItWorks' ? 'how' : key === 'premium' ? 'premium' : 'features'}`}
              className="text-sm transition-colors hover:text-blue-500 dark:hover:text-blue-400"
              style={{ color: 'var(--text-sub)' }}
            >
              {t(key)}
            </a>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2.5">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Locale select */}
          <select
            value={currentLocale}
            onChange={onLocaleChange}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-sub)',
            }}
          >
            {locales.map((loc) => (
              <option key={loc} value={loc} style={{ background: 'var(--bg-card)' }}>
                {localeNames[loc]}
              </option>
            ))}
          </select>

          {/* CTA */}
          <a
            href="#download"
            className="hidden items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-80 sm:inline-flex"
            style={{ background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)' }}
          >
            {t('download')}
          </a>
        </div>
      </div>
    </header>
  );
}
