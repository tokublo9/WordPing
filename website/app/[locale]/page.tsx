import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import PremiumSection from '@/components/PremiumSection';
import DownloadCTA from '@/components/DownloadCTA';
import Footer from '@/components/Footer';

export default function Page() {
  return (
    <main className="antialiased">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <PremiumSection />
      <DownloadCTA />
      <Footer />
    </main>
  );
}
