'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createHeroPlayback,
  type HeroPlayback,
  type HeroStep,
} from '@/lib/heroPlayback.mjs';

function HeroDemo({ step }: { step: HeroStep }) {
  const t = useTranslations('hero.demo');
  const position = ['word', 'meaning', 'test', 'result'].indexOf(step);

  return (
    <div className="hero-demo relative mx-auto w-full max-w-[390px]" aria-hidden="true">
      <div className="absolute -inset-8 -z-10 rounded-full bg-blue-500/15 blur-3xl" />
      <div
        className="relative min-h-[430px] overflow-hidden rounded-[2rem] border p-5 shadow-2xl sm:min-h-[470px] sm:p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/icon.png" alt="" width={42} height={42} className="rounded-xl" priority />
            <div>
              <p className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>WordCore</p>
              <p className="text-xs" style={{ color: 'var(--text-sub)' }}>{t('folder')}</p>
            </div>
          </div>
          <span className="rounded-full border px-3 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}>
            {t('counter')}
          </span>
        </div>

        <div className="relative min-h-[300px] overflow-hidden rounded-3xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-alt)' }}>
          <div className={`hero-stage ${step === 'word' ? 'is-active' : ''}`}>
            <p className="hero-eyebrow">{t('wordLabel')}</p>
            <p className="mt-12 break-words text-center text-4xl font-black tracking-tight sm:text-5xl" style={{ color: 'var(--text)' }}>
              serendipity
            </p>
            <p className="mt-5 text-center text-sm" style={{ color: 'var(--text-sub)' }}>{t('flipHint')}</p>
          </div>

          <div className={`hero-stage ${step === 'meaning' ? 'is-active' : ''}`}>
            <p className="hero-eyebrow">{t('meaningLabel')}</p>
            <p className="mt-7 text-2xl font-extrabold" style={{ color: 'var(--text)' }}>{t('meaning')}</p>
            <div className="my-5 h-px" style={{ background: 'var(--border)' }} />
            <p className="text-xs font-bold uppercase tracking-widest text-blue-500">{t('noteLabel')}</p>
            <p className="mt-2 text-sm leading-7" style={{ color: 'var(--text-sub)' }}>{t('note')}</p>
          </div>

          <div className={`hero-stage ${step === 'test' ? 'is-active' : ''}`}>
            <p className="hero-eyebrow">{t('testLabel')}</p>
            <p className="mt-6 text-center text-3xl font-black" style={{ color: 'var(--text)' }}>serendipity</p>
            <p className="mt-3 text-center text-sm" style={{ color: 'var(--text-sub)' }}>{t('testPrompt')}</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              {[
                [t('perfect'), '#22C55E'],
                [t('prettyGood'), '#3B82F6'],
                [t('notReally'), '#EAB308'],
                [t('dontKnow'), '#EF4444'],
              ].map(([label, color]) => (
                <div key={label} className="rounded-2xl border px-3 py-3 text-center text-xs font-bold" style={{ borderColor: `${color}66`, color }}>
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className={`hero-stage ${step === 'result' ? 'is-active' : ''}`}>
            <div className="mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/15 text-blue-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>
            <p className="mt-5 text-center text-xl font-black text-blue-500">{t('resultTitle')}</p>
            <p className="mx-auto mt-3 max-w-[260px] text-center text-sm leading-6" style={{ color: 'var(--text-sub)' }}>
              {t('resultDescription')}
            </p>
            <div className="mx-auto mt-7 flex w-fit items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-500">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              {t('blueFilter')}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-center gap-2">
          {[0, 1, 2, 3].map(index => (
            <span
              key={index}
              className="h-1.5 rounded-full transition-[width,background-color] duration-500"
              style={{ width: index === position ? 24 : 6, background: index === position ? '#3B82F6' : 'var(--border)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const t = useTranslations('hero');
  const sectionRef = useRef<HTMLElement>(null);
  const playbackRef = useRef<HeroPlayback | null>(null);
  const [step, setStep] = useState<HeroStep>('word');

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const playback = createHeroPlayback({ onStep: setStep });
    playbackRef.current = playback;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => playback.setReducedMotion(motionQuery.matches);
    const updateVisibility = () => playback.setDocumentVisible(document.visibilityState === 'visible');
    const observer = new IntersectionObserver(
      entries => playback.setVisible(entries[0]?.isIntersecting ?? false),
      { threshold: 0.2 },
    );

    updateMotion();
    updateVisibility();
    observer.observe(section);
    motionQuery.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
      playback.dispose();
      playbackRef.current = null;
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative flex min-h-[100svh] items-center overflow-hidden pt-16" style={{ background: 'var(--bg-page)' }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_30%,rgba(59,130,246,0.13),transparent_36%),radial-gradient(circle_at_15%_80%,rgba(139,92,246,0.1),transparent_30%)]" />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-20 sm:px-6 lg:grid-cols-[1fr_0.88fr] lg:gap-20 lg:py-24">
        <div className="text-center lg:text-left">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-500" style={{ borderColor: 'rgba(59,130,246,0.25)' }}>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            {t('badge')}
          </div>
          <h1 className="text-balance text-5xl font-black leading-[1.06] tracking-tight sm:text-6xl lg:text-7xl" style={{ color: 'var(--text)' }}>
            {t('titleLine1')}{' '}
            <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">{t('titleHighlight')}</span>
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-balance text-lg leading-8 lg:mx-0" style={{ color: 'var(--text-sub)' }}>
            {t('subtitle')}
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 lg:items-start">
            <a href="#download" className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-7 py-4 text-sm font-extrabold text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              {t('cta')}
            </a>
            <p className="text-xs" style={{ color: 'var(--text-sub)' }}>{t('ctaNote')}</p>
          </div>
          <ul className="mt-9 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold lg:justify-start" style={{ color: 'var(--text-sub)' }}>
            <li>✓ {t('proof.local')}</li>
            <li>✓ {t('proof.noAccount')}</li>
            <li>✓ {t('proof.ios')}</li>
          </ul>
        </div>

        <HeroDemo step={step} />
      </div>
    </section>
  );
}
