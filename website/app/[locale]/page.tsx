import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CinematicHero } from '@/components/ui/cinematic-hero';
import Header from '@/components/Header';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import ScreenshotGallery from '@/components/ScreenshotGallery';
import ThemesSection from '@/components/ThemesSection';
import { Component as PricingSection } from '@/components/ui/squishy-pricing';
import DownloadCTA from '@/components/DownloadCTA';
import Footer from '@/components/Footer';

const PRODUCTION_ORIGIN = 'https://word-ping-chi.vercel.app';
const MARKETING_LOCALES = ['en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'vi', 'id', 'th', 'ar'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const path = locale === 'en' ? '/' : `/${locale}`;
  const languages = Object.fromEntries(MARKETING_LOCALES.map(item => [item, item === 'en' ? '/' : `/${item}`]));

  return {
    metadataBase: new URL(PRODUCTION_ORIGIN),
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: path,
      languages: { ...languages, 'x-default': '/' },
    },
    icons: {
      icon: [{ url: '/icon.png', type: 'image/png', sizes: '1254x1254' }],
      apple: [{ url: '/icon.png', sizes: '1254x1254' }],
    },
    openGraph: {
      type: 'website',
      url: path,
      title: t('title'),
      description: t('description'),
      siteName: 'WordCore',
      locale: locale === 'ja' ? 'ja_JP' : 'en_US',
      images: [{ url: '/icon.png', width: 1254, height: 1254, alt: t('imageAlt') }],
    },
    twitter: {
      card: 'summary',
      title: t('title'),
      description: t('description'),
      images: ['/icon.png'],
    },
  };
}

export default function Page() {
  return (
    <main className="antialiased">
      <Header />
      <CinematicHero />
      <Features />
      <ScreenshotGallery />
      <ThemesSection />
      <HowItWorks />
      <PricingSection />
      <DownloadCTA />
      <Footer />
    </main>
  );
}
