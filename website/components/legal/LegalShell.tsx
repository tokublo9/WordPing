import Image from 'next/image';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { LegalLocale, LegalSlug } from '@/lib/legalContent';
import { legalNavigation } from '@/lib/legalContent';
import ThemeToggle from '@/components/ThemeToggle';

interface Props {
  locale: LegalLocale;
  slug: LegalSlug;
  title: string;
  description: string;
  children: ReactNode;
}

export default function LegalShell({ locale, slug, title, description, children }: Props) {
  const nav = legalNavigation[locale];
  return (
    <main className="min-h-screen bg-page text-primary antialiased">
      <header
        className="sticky top-0 z-50 border-b border-theme"
        style={{
          background: 'var(--bg-header)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Link href="/" locale={locale} className="flex items-center gap-2.5" aria-label={`${nav.home} — WordCore`}>
            <span className="overflow-hidden rounded-xl" style={{ width: 34, height: 34 }}>
              <Image src="/icon.png" alt="" width={34} height={34} className="object-cover" />
            </span>
            <span className="font-bold">WordCore</span>
          </Link>
          <nav className="order-3 flex w-full items-center justify-center gap-5 text-sm sm:order-2 sm:w-auto" aria-label="Legal">
            <Link href="/privacy" locale={locale} className={slug === 'privacy' ? 'font-bold text-blue-500' : 'text-sub hover:text-blue-500'}>
              {nav.privacy}
            </Link>
            <Link href="/terms" locale={locale} className={slug === 'terms' ? 'font-bold text-blue-500' : 'text-sub hover:text-blue-500'}>
              {nav.terms}
            </Link>
            <Link href="/licenses" locale={locale} className={slug === 'licenses' ? 'font-bold text-blue-500' : 'text-sub hover:text-blue-500'}>
              {nav.licenses}
            </Link>
            <Link href="/support" locale={locale} className={slug === 'support' ? 'font-bold text-blue-500' : 'text-sub hover:text-blue-500'}>
              {nav.support}
            </Link>
          </nav>
          <div className="order-2 flex items-center gap-2 sm:order-3">
            <ThemeToggle />
            <span className="sr-only">{nav.language}</span>
            <Link
              href={`/${slug}`}
              locale="en"
              hrefLang="en"
              className={`rounded-lg px-2.5 py-1.5 text-xs ${locale === 'en' ? 'bg-blue-600 font-bold text-white' : 'text-sub'}`}
            >
              EN
            </Link>
            <Link
              href={`/${slug}`}
              locale="ja"
              hrefLang="ja"
              className={`rounded-lg px-2.5 py-1.5 text-xs ${locale === 'ja' ? 'bg-blue-600 font-bold text-white' : 'text-sub'}`}
            >
              日本語
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-blue-500">WordCore Legal</p>
          <h1 className="text-balance text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 text-base leading-7 text-sub sm:text-lg">{description}</p>
        </div>
        {children}
      </div>

      <footer className="border-t border-theme bg-alt">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-sub sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 WordCore. All rights reserved.</p>
          <p>{locale === 'ja' ? '運営者：Daiki Tokumoto' : 'Operator: Daiki Tokumoto'}</p>
        </div>
      </footer>
    </main>
  );
}
