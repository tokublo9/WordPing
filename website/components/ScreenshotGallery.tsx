'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const SHOTS = [
  { src: '/images/word-list.png', key: 'wordList' },
  { src: '/images/flip-card.png', key: 'flipMode' },
  { src: '/images/test-mode.png', key: 'testMode' },
  { src: '/images/edit-word.png', key: 'editWord' },
  { src: '/images/theme-shop.png', key: 'themes' },
] as const;

interface LightboxProps {
  index: number;
  onClose(): void;
  onPrev(): void;
  onNext(): void;
}

function Lightbox({ index, onClose, onPrev, onNext }: LightboxProps) {
  const t = useTranslations('gallery');
  const shot = SHOTS[index];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && index > 0) onPrev();
      if (event.key === 'ArrowRight' && index < SHOTS.length - 1) onNext();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [index, onClose, onNext, onPrev]);

  return (
    <motion.div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('dialogLabel')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="absolute inset-0 cursor-zoom-out bg-black/90 backdrop-blur-md" onClick={onClose} aria-label={t('close')} />
      <motion.div key={index} className="relative z-10 max-h-[86svh] max-w-[min(380px,86vw)]" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="overflow-hidden rounded-[2rem] shadow-2xl">
          <Image src={shot.src} alt={t(`shots.${shot.key}`)} width={390} height={844} className="block max-h-[80svh] w-auto object-contain" />
        </div>
        <p className="mt-3 text-center text-sm font-semibold text-white/80">{t(`shots.${shot.key}`)} · {index + 1}/{SHOTS.length}</p>
      </motion.div>
      {index > 0 && <button type="button" onClick={onPrev} aria-label={t('previous')} className="absolute left-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6">←</button>}
      {index < SHOTS.length - 1 && <button type="button" onClick={onNext} aria-label={t('next')} className="absolute right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6">→</button>}
      <button type="button" onClick={onClose} aria-label={t('close')} className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-xl text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">×</button>
    </motion.div>
  );
}

export default function ScreenshotGallery() {
  const t = useTranslations('gallery');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const close = useCallback(() => setLightboxIndex(null), []);
  const previous = useCallback(() => setLightboxIndex(index => index !== null ? Math.max(0, index - 1) : null), []);
  const next = useCallback(() => setLightboxIndex(index => index !== null ? Math.min(SHOTS.length - 1, index + 1) : null), []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxIndex]);

  return (
    <>
      <section id="gallery" className="py-24" style={{ background: 'var(--bg-alt)' }}>
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="mb-12 text-center">
            <span className="mb-4 inline-block rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-blue-500">{t('badge')}</span>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl" style={{ color: 'var(--text)' }}>{t('title')}</h2>
            <p className="mx-auto mt-4 max-w-lg" style={{ color: 'var(--text-sub)' }}>{t('subtitle')}</p>
          </div>

          <div className="flex snap-x gap-4 overflow-x-auto pb-5 scrollbar-hide">
            {SHOTS.map((shot, index) => (
              <button
                type="button"
                key={shot.src}
                onClick={() => setLightboxIndex(index)}
                className="group relative w-[min(72vw,240px)] flex-none snap-center rounded-[1.8rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-4"
                aria-label={t('open', { name: t(`shots.${shot.key}`) })}
              >
                <div className="overflow-hidden rounded-[1.8rem] border transition-transform duration-300 group-hover:-translate-y-1" style={{ borderColor: 'var(--border)', boxShadow: '0 8px 30px var(--shadow)' }}>
                  <Image src={shot.src} alt={t(`shots.${shot.key}`)} width={390} height={844} className="block h-auto w-full" loading={index < 2 ? 'eager' : 'lazy'} />
                </div>
                <span className="mt-3 block text-sm font-bold" style={{ color: 'var(--text)' }}>{t(`shots.${shot.key}`)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs sm:hidden" style={{ color: 'var(--text-sub)' }}>{t('swipe')}</p>
        </div>
      </section>

      <AnimatePresence>{lightboxIndex !== null && <Lightbox index={lightboxIndex} onClose={close} onPrev={previous} onNext={next} />}</AnimatePresence>
    </>
  );
}
