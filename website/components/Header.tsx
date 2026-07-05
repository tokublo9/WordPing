'use client';

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
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-black tracking-tight">WP</span>
          </div>
          <span className="text-gray-900 font-bold text-lg">WordPing</span>
        </a>

        {/* Nav links — hidden on small screens */}
        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            {t('features')}
          </a>
          <a href="#how" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            {t('howItWorks')}
          </a>
        </nav>

        {/* Right: locale switcher + CTA */}
        <div className="flex items-center gap-3">
          <select
            value={currentLocale}
            onChange={onLocaleChange}
            className="text-sm text-gray-600 bg-transparent border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {locales.map(loc => (
              <option key={loc} value={loc}>{localeNames[loc]}</option>
            ))}
          </select>

          <a
            href="#download"
            className="hidden sm:inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            {t('download')}
          </a>
        </div>
      </div>
    </header>
  );
}
