import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import DownloadCTA from '@/components/DownloadCTA';
import Footer from '@/components/Footer';

export default function Page() {
  return (
    <main className="bg-white font-sans antialiased">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <DownloadCTA />
      <Footer />
    </main>
  );
}
