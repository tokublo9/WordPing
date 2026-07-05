'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { localeNames, locales, type Locale } from '@/i18n/routing';
import { useParams } from 'next/navigation';

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
      {/* Glassmorphism bar */}
      <div
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
        style={{
          background: 'rgba(6,5,15,0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <div className="overflow-hidden rounded-xl" style={{ width: 32, height: 32 }}>
            <Image src="/icon.png" alt="WordPing" width={32} height={32} className="object-cover" />
          </div>
          <span className="text-base font-bold text-white">WordPing</span>
        </a>

        {/* Nav links */}
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-white/50 transition-colors hover:text-white">
            {t('features')}
          </a>
          <a href="#how" className="text-sm text-white/50 transition-colors hover:text-white">
            {t('howItWorks')}
          </a>
          <a href="#premium" className="text-sm text-white/50 transition-colors hover:text-white">
            {t('premium')}
          </a>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Locale select */}
          <select
            value={currentLocale}
            onChange={onLocaleChange}
            className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {locales.map((loc) => (
              <option key={loc} value={loc} className="bg-[#0e0d1e] text-white">
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
