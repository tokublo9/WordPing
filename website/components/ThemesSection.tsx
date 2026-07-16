'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const SKINS = [
  { src: '/images/skin-night-city.png', name: 'Night City',      color: '#3B82F6' },
  { src: '/images/skin-beautiful-woods.png', name: 'Beautiful Woods', color: '#22C55E' },
  { src: '/images/skin-sakura.png',     name: 'Sakura',          color: '#EC4899' },
  { src: '/images/skin-snow-mountain.png', name: 'Snow Mountain', color: '#94A3B8' },
  { src: '/images/skin-leaf.png',       name: 'Leaf',            color: '#10B981' },
  { src: '/images/skin-deep-sea.png',   name: 'Deep Sea',        color: '#6366F1' },
];

const THEME_COLORS = [
  { name: 'Blue',   hex: '#3B82F6', free: true },
  { name: 'Purple', hex: '#7C6BF8', free: false },
  { name: 'Pink',   hex: '#EC4899', free: false },
  { name: 'Teal',   hex: '#14B8A6', free: false },
  { name: 'Coral',  hex: '#FF6B6B', free: false },
];

export default function ThemesSection() {
  return (
    <section
      id="themes"
      style={{
        background: 'var(--bg-page)',
        paddingTop: 96,
        paddingBottom: 96,
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <span
            className="mb-4 inline-block rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-widest"
            style={{
              borderColor: 'rgba(236,72,153,0.25)',
              background: 'rgba(236,72,153,0.08)',
              color: '#EC4899',
            }}
          >
            Themes & Skins
          </span>
          <h2
            className="text-4xl font-black tracking-tight sm:text-5xl"
            style={{ color: 'var(--text)' }}
          >
            Choose a look that fits you
          </h2>
          <p
            className="mx-auto mt-4 max-w-lg text-base leading-relaxed"
            style={{ color: 'var(--text-sub)' }}
          >
            WordMemo lets you customize your learning space with clean colors and beautiful premium skins.
            Make it feel like yours.
          </p>
        </motion.div>

        {/* Main layout: shop screenshot + skin grid */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start">

          {/* Left: Theme Shop screenshot */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <div
              className="relative mx-auto overflow-hidden rounded-3xl"
              style={{
                maxWidth: 300,
                boxShadow: '0 32px 80px rgba(0,0,0,0.18)',
                border: '1px solid var(--border)',
              }}
            >
              <Image
                src="/images/theme-shop.png"
                alt="WordMemo Theme Shop"
                width={390}
                height={844}
                className="block w-full"
              />
              {/* Subtle label overlay */}
              <div
                className="absolute bottom-0 inset-x-0 flex items-end justify-center p-5"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
              >
                <span className="text-sm font-bold text-white">Theme Shop</span>
              </div>
            </div>
          </motion.div>

          {/* Right: features + theme color dots + skin grid */}
          <div>
            {/* Feature bullets */}
            <motion.div
              className="mb-8 space-y-4"
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              {[
                {
                  icon: '🎨',
                  title: 'Theme colors',
                  desc: 'Pick from 5 accent colors. Blue is always free — unlock more with Basic.',
                },
                {
                  icon: '✨',
                  title: '15 premium skins',
                  desc: 'Beautiful wallpaper backgrounds: Night City, Sakura, Galaxy, Aurora, and more.',
                },
                {
                  icon: '💫',
                  title: 'Make it personal',
                  desc: 'Every folder can have its own feel. Your study space, your rules.',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  className="flex items-start gap-4 rounded-2xl p-4"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                  }}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
                >
                  <span className="text-2xl leading-none">{item.icon}</span>
                  <div>
                    <p className="mb-0.5 font-bold" style={{ color: 'var(--text)' }}>{item.title}</p>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-sub)' }}>{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Theme color swatches */}
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-sub)' }}>
                Theme Colors
              </p>
              <div className="flex items-center gap-3">
                {THEME_COLORS.map((c) => (
                  <div key={c.name} className="flex flex-col items-center gap-1.5">
                    <div
                      className="relative flex h-9 w-9 items-center justify-center rounded-full"
                      style={{ background: c.hex, boxShadow: `0 4px 12px ${c.hex}55` }}
                    >
                      {c.free && (
                        <span
                          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px] font-black"
                          style={{ color: c.hex }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--text-sub)' }}>
                      {c.free ? 'Free' : 'Basic'}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Skin screenshot grid */}
        <motion.div
          className="mt-14"
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <p
            className="mb-6 text-center text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--text-sub)' }}
          >
            Premium Skins
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {SKINS.map((skin, i) => (
              <motion.div
                key={skin.src}
                className="group relative overflow-hidden rounded-2xl"
                style={{
                  aspectRatio: '9/19.5',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                  border: '1px solid var(--border)',
                }}
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.07, ease: EASE }}
                whileHover={{ y: -5, scale: 1.03 }}
              >
                <Image
                  src={skin.src}
                  alt={skin.name}
                  fill
                  sizes="(max-width: 640px) 33vw, 16vw"
                  className="object-cover object-top"
                />
                <div
                  className="absolute inset-x-0 bottom-0 flex items-end justify-center p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
                >
                  <span className="text-[10px] font-bold text-white">{skin.name}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
