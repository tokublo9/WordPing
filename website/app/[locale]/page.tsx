import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import ScreenshotGallery from '@/components/ScreenshotGallery';
import ThemesSection from '@/components/ThemesSection';
import PremiumSection from '@/components/PremiumSection';
import { Component as PricingSection } from '@/components/ui/squishy-pricing';
import DownloadCTA from '@/components/DownloadCTA';
import Footer from '@/components/Footer';

export default function Page() {
  return (
    <main className="antialiased">
      <Header />
      <Hero />
      <Features />
      <ScreenshotGallery />
      <ThemesSection />
      <HowItWorks />
      <PremiumSection />
      <PricingSection />
      <DownloadCTA />
      <Footer />
    </main>
  );
}
