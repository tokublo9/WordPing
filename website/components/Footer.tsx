import Image from 'next/image';
import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer
      style={{
        background: '#06050f',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        paddingTop: 40,
        paddingBottom: 40,
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="overflow-hidden rounded-xl" style={{ width: 28, height: 28 }}>
              <Image src="/icon.png" alt="WordPing" width={28} height={28} className="object-cover" />
            </div>
            <span className="font-bold text-white">WordPing</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-white/30 transition-colors hover:text-white/60">
              Privacy
            </a>
            <a href="#" className="text-xs text-white/30 transition-colors hover:text-white/60">
              Terms
            </a>
          </div>

          {/* Tagline + Copyright */}
          <div className="text-right">
            <p className="text-xs text-white/30">{t('tagline')}</p>
            <p className="mt-1 text-xs text-white/20">{t('rights')}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
