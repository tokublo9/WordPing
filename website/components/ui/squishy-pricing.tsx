'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const SPRING = { type: 'spring', stiffness: 340, damping: 22 } as const;

/* ── Plan data ─────────────────────────────────────────────────────── */
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Everything you need to start building vocabulary.',
    color: '#3B82F6',
    featured: false,
    features: [
      { text: 'Up to 30 words', included: true },
      { text: 'Blue theme color', included: true },
      { text: 'Flashcards & test mode', included: true },
      { text: 'Push notifications', included: true },
      { text: '10 AI voice plays', included: true },
      { text: 'All theme colors', included: false },
      { text: 'Premium skins', included: false },
      { text: 'Unlimited words', included: false },
      { text: 'Unlimited AI voice', included: false },
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 'Coming Soon',
    period: null,
    description: 'Unlock the full WordMemo experience.',
    color: '#8B5CF6',
    featured: true,
    features: [
      { text: 'Unlimited words', included: true },
      { text: 'All 5 theme colors', included: true },
      { text: 'Flashcards & test mode', included: true },
      { text: 'Push notifications', included: true },
      { text: 'Unlimited AI voice', included: true },
      { text: 'All theme colors', included: true },
      { text: '15 premium skins', included: true },
      { text: 'Priority support', included: true },
      { text: 'All future features', included: true },
    ],
  },
] as const;

/* ── Check / X icons ───────────────────────────────────────────────── */
function Check({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 flex-none" style={{ color }}>
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity="0.2" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 flex-none" style={{ color: 'var(--text-sub)' }}>
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity="0.15" />
      <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeOpacity="0.35" />
    </svg>
  );
}

/* ── Single plan card ──────────────────────────────────────────────── */
function PlanCard({ plan, isActive, onHover, onLeave }: {
  plan: typeof PLANS[number];
  isActive: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const isFeatured = plan.featured;

  return (
    <motion.div
      onHoverStart={onHover}
      onHoverEnd={onLeave}
      style={{ position: 'relative', flex: '1 1 0', minWidth: 0, maxWidth: 380 }}
      animate={isActive ? { y: -8, scale: 1.02 } : { y: 0, scale: 1 }}
      transition={SPRING}
    >
      {/* Popular badge */}
      <AnimatePresence>
        {isFeatured && (
          <motion.div
            className="absolute -top-4 left-1/2 z-10"
            style={{ transform: 'translateX(-50%)' }}
            initial={{ opacity: 0, y: 6, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={SPRING}
          >
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1 text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)', boxShadow: '0 4px 16px rgba(139,92,246,0.4)' }}
            >
              ✦ Most Popular
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card */}
      <motion.div
        className="relative h-full overflow-hidden rounded-3xl p-8"
        style={{
          background: isFeatured
            ? 'linear-gradient(145deg, #16143a 0%, #0f0e2a 60%, #130f30 100%)'
            : 'var(--bg-card)',
          border: `1px solid ${isFeatured ? 'rgba(139,92,246,0.35)' : 'var(--border)'}`,
          boxShadow: isActive
            ? isFeatured
              ? '0 20px 60px rgba(139,92,246,0.3)'
              : '0 20px 40px var(--shadow)'
            : isFeatured
              ? '0 8px 32px rgba(139,92,246,0.15)'
              : '0 2px 12px var(--shadow)',
        }}
        transition={{ duration: 0.3 }}
      >
        {/* Featured glow */}
        {isFeatured && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139,92,246,0.2) 0%, transparent 65%)',
            }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        <div className="relative">
          {/* Plan name + icon */}
          <div className="mb-6 flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: isFeatured ? 'rgba(139,92,246,0.2)' : 'rgba(59,130,246,0.1)',
                color: plan.color,
              }}
            >
              {plan.id === 'free' ? (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-5 w-5">
                  <circle cx="10" cy="10" r="8" />
                  <path d="M10 6v4l3 3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-5 w-5">
                  <path d="M9.5 3.5L11.5 7.5L16 8.2L12.75 11.35L13.5 16L9.5 13.85L5.5 16L6.25 11.35L3 8.2L7.5 7.5L9.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: isFeatured ? 'rgba(167,139,250,0.8)' : 'var(--text-sub)' }}
              >
                {plan.name}
              </p>
            </div>
          </div>

          {/* Price */}
          <div className="mb-2">
            {plan.period ? (
              <div className="flex items-end gap-1.5">
                <span
                  className="text-5xl font-black leading-none tracking-tight"
                  style={{ color: isFeatured ? '#fff' : 'var(--text)' }}
                >
                  {plan.price}
                </span>
                <span
                  className="mb-1.5 text-sm"
                  style={{ color: isFeatured ? 'rgba(255,255,255,0.4)' : 'var(--text-sub)' }}
                >
                  / {plan.period}
                </span>
              </div>
            ) : (
              <span
                className="inline-flex items-center rounded-2xl px-4 py-2 text-lg font-bold"
                style={{
                  background: 'rgba(139,92,246,0.15)',
                  color: '#a78bfa',
                  border: '1px solid rgba(139,92,246,0.2)',
                }}
              >
                🔜 {plan.price}
              </span>
            )}
          </div>
          <p
            className="mb-8 text-sm leading-relaxed"
            style={{ color: isFeatured ? 'rgba(255,255,255,0.45)' : 'var(--text-sub)' }}
          >
            {plan.description}
          </p>

          {/* Feature list */}
          <ul className="mb-8 space-y-3">
            {plan.features.map((f) => (
              <li key={f.text} className="flex items-center gap-3">
                {f.included ? <Check color={plan.color} /> : <Cross />}
                <span
                  className="text-sm"
                  style={{
                    color: f.included
                      ? isFeatured ? 'rgba(255,255,255,0.85)' : 'var(--text)'
                      : 'var(--text-sub)',
                    opacity: f.included ? 1 : 0.55,
                  }}
                >
                  {f.text}
                </span>
              </li>
            ))}
          </ul>

          {/* CTA button */}
          <motion.div
            className="flex items-center justify-center rounded-2xl py-3.5 text-sm font-bold"
            style={{
              background: isFeatured
                ? 'linear-gradient(135deg, #7C3AED, #8B5CF6)'
                : 'var(--bg-alt)',
              color: isFeatured ? '#fff' : 'var(--text)',
              border: isFeatured ? 'none' : '1px solid var(--border)',
              boxShadow: isFeatured ? '0 4px 20px rgba(139,92,246,0.35)' : 'none',
              cursor: isFeatured ? 'default' : 'default',
            }}
            whileTap={{ scale: 0.97 }}
            transition={SPRING}
          >
            {isFeatured ? '🔜 Coming Soon' : 'Get Started Free'}
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Main export ───────────────────────────────────────────────────── */
export function Component() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <section
      id="pricing"
      style={{ background: 'var(--bg-alt)', paddingTop: 96, paddingBottom: 96 }}
    >
      <div className="mx-auto max-w-5xl px-6">
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
              borderColor: 'rgba(139,92,246,0.25)',
              background: 'rgba(139,92,246,0.08)',
              color: '#8B5CF6',
            }}
          >
            Pricing
          </span>
          <h2
            className="text-4xl font-black tracking-tight sm:text-5xl"
            style={{ color: 'var(--text)' }}
          >
            Simple, honest pricing
          </h2>
          <p
            className="mx-auto mt-4 max-w-md text-base"
            style={{ color: 'var(--text-sub)' }}
          >
            Start free. Upgrade when you want more.
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div
          className="flex flex-col items-stretch gap-6 pt-6 sm:flex-row sm:items-start sm:justify-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.65, ease: EASE }}
        >
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isActive={hoveredId === plan.id}
              onHover={() => setHoveredId(plan.id)}
              onLeave={() => setHoveredId(null)}
            />
          ))}
        </motion.div>

        {/* Footnote */}
        <motion.p
          className="mt-12 text-center text-sm"
          style={{ color: 'var(--text-sub)' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          No credit card required to start. Cancel anytime.
        </motion.p>
      </div>
    </section>
  );
}
