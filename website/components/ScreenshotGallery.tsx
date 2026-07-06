'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const SHOTS = [
  { src: '/images/word-list.png',   label: 'Word List' },
  { src: '/images/flip-card.png',   label: 'Flip Cards' },
  { src: '/images/test-mode.png',   label: 'Quiz Mode' },
  { src: '/images/add-word-ai.png', label: 'AI Add Word' },
  { src: '/images/edit-word.png',   label: 'Edit Word' },
];

function Lightbox({ index, onClose, onPrev, onNext }: {
  index: number; onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div
        className="absolute inset-0 cursor-zoom-out"
        style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)' }}
        onClick={onClose}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index} className="relative z-10"
          style={{ maxHeight: '90svh', maxWidth: 'min(380px, 90vw)' }}
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -8 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          <div className="overflow-hidden rounded-[40px]" style={{ boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }}>
            <Image src={SHOTS[index].src} alt={SHOTS[index].label} width={390} height={844}
              className="block w-full" style={{ maxHeight: '84svh', objectFit: 'contain' }} />
          </div>
          <p className="mt-4 text-center text-sm font-medium text-white/70">
            {SHOTS[index].label} — {index + 1} / {SHOTS.length}
          </p>
        </motion.div>
      </AnimatePresence>

      {index > 0 && (
        <motion.button onClick={onPrev} aria-label="Previous"
          className="absolute left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-sm"
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M15 18l-6-6 6-6" /></svg>
        </motion.button>
      )}
      {index < SHOTS.length - 1 && (
        <motion.button onClick={onNext} aria-label="Next"
          className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-sm"
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M9 18l6-6-6-6" /></svg>
        </motion.button>
      )}
      <motion.button onClick={onClose} aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-sm"
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </motion.button>

      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {SHOTS.map((_, i) => (
          <div key={i} className="h-1.5 rounded-full transition-all" style={{
            width: i === index ? 20 : 6,
            background: i === index ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
          }} />
        ))}
      </div>
    </motion.div>
  );
}

export default function ScreenshotGallery() {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const openAt = useCallback((i: number) => {
    setLightboxIdx(i);
    document.body.style.overflow = 'hidden';
  }, []);

  const close = useCallback(() => {
    setLightboxIdx(null);
    document.body.style.overflow = '';
  }, []);

  const prev = useCallback(() => setLightboxIdx(i => (i !== null && i > 0 ? i - 1 : i)), []);
  const next = useCallback(() => setLightboxIdx(i => (i !== null && i < SHOTS.length - 1 ? i + 1 : i)), []);

  return (
    <>
      <section id="gallery" style={{ background: 'var(--bg-alt)', paddingTop: 96, paddingBottom: 96 }}>
        <div className="mx-auto max-w-6xl px-6">
          <motion.div className="mb-12 text-center"
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease: EASE }}>
            <span className="mb-4 inline-block rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400"
              style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.08)' }}>
              App Preview
            </span>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl" style={{ color: 'var(--text)' }}>
              See it in action
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm" style={{ color: 'var(--text-sub)' }}>
              Tap any screenshot to enlarge it.
            </p>
          </motion.div>

          <motion.div
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
            style={{ scrollSnapType: 'x mandatory' }}
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.65, ease: EASE }}>
            {SHOTS.map((shot, i) => (
              <motion.button key={shot.src} onClick={() => openAt(i)}
                className="group relative flex-none cursor-zoom-in focus:outline-none"
                style={{ scrollSnapAlign: 'center', width: 'clamp(200px, 38vw, 240px)' }}
                whileHover={{ y: -6 }} whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 340, damping: 22 }}>
                <div className="overflow-hidden rounded-[28px]"
                  style={{ boxShadow: '0 8px 32px var(--shadow)', border: '1px solid var(--border)' }}>
                  <Image src={shot.src} alt={shot.label} width={390} height={844}
                    className="block w-full" loading={i <= 1 ? 'eager' : 'lazy'} />
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-center rounded-b-[28px] p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }}>
                  <span className="text-xs font-semibold text-white">{shot.label}</span>
                </div>
              </motion.button>
            ))}
          </motion.div>

          <p className="mt-4 text-center text-xs sm:hidden" style={{ color: 'var(--text-sub)' }}>
            Swipe to see more
          </p>
        </div>
      </section>

      <AnimatePresence>
        {lightboxIdx !== null && (
          <Lightbox index={lightboxIdx} onClose={close} onPrev={prev} onNext={next} />
        )}
      </AnimatePresence>
    </>
  );
}
