'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const SKINS = [
  '/images/skin-night-city.png',
  '/images/skin-beautiful-woods.png',
  '/images/skin-sakura.png',
  '/images/skin-snow-mountain.png',
  '/images/skin-leaf.png',
  '/images/skin-deep-sea.png',
] as const;

const ITEMS = ['access', 'variety', 'personal'] as const;

export default function ThemesSection() {
  const t = useTranslations('themes');

  return (
    <section id="themes" className="py-24" style={{ background: 'var(--bg-page)' }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="mb-14 text-center">
          <span className="mb-4 inline-block rounded-full border border-pink-500/25 bg-pink-500/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-pink-500">{t('badge')}</span>
          <h2 className="text-balance text-4xl font-black tracking-tight sm:text-5xl" style={{ color: 'var(--text)' }}>{t('title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7" style={{ color: 'var(--text-sub)' }}>{t('subtitle')}</p>
        </div>

        <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <motion.div
            className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[2rem] border"
            style={{ borderColor: 'var(--border)', boxShadow: '0 24px 70px var(--shadow)' }}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <Image src="/images/theme-shop.png" alt={t('shopAlt')} width={390} height={844} className="h-auto w-full" />
          </motion.div>

          <div>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {ITEMS.map((key, index) => (
                <motion.article
                  key={key}
                  className="rounded-2xl border p-5"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  initial={{ opacity: 0, x: 18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                >
                  <h3 className="font-extrabold" style={{ color: 'var(--text)' }}>{t(`${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-6" style={{ color: 'var(--text-sub)' }}>{t(`${key}.desc`)}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14">
          <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-sub)' }}>{t('galleryLabel')}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {SKINS.map((src, index) => (
              <motion.div
                key={src}
                className="relative aspect-[9/19.5] overflow-hidden rounded-2xl border"
                style={{ borderColor: 'var(--border)', boxShadow: '0 8px 24px var(--shadow)' }}
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <Image src={src} alt="" fill sizes="(max-width: 640px) 33vw, 16vw" className="object-cover object-top" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
