'use client';

import { useTranslations } from 'next-intl';
import {
  COMPARISON_ROWS,
  PLAN_FEATURES,
  type ComparisonValue as ComparisonValueType,
  type WebsitePlan,
} from '@/lib/marketingContract.mjs';

function InclusionIcon({ included }: { included: boolean }) {
  return included ? (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-emerald-500" aria-hidden="true"><circle cx="10" cy="10" r="8" /><path d="m6.5 10 2.2 2.2 4.8-5" /></svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5 opacity-45" aria-hidden="true"><circle cx="10" cy="10" r="8" /><path d="m7 7 6 6m0-6-6 6" /></svg>
  );
}

function ComparisonValue({ value }: { value: ComparisonValueType }) {
  const t = useTranslations('plans.values');
  if (value === 'included' || value === 'notIncluded') {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold sm:text-xs">
        <InclusionIcon included={value === 'included'} />
        <span className="sr-only">{t(value)}</span>
      </span>
    );
  }
  return <span className="text-[10px] font-extrabold leading-4 sm:text-xs">{t(value)}</span>;
}

function PlanCard({ plan }: { plan: WebsitePlan }) {
  const t = useTranslations('plans');
  const featured = plan === 'premium';

  return (
    <article
      className="relative flex min-w-0 flex-col rounded-3xl border p-6 sm:p-7"
      style={{
        background: featured ? 'linear-gradient(145deg,#151238,#0b0a21)' : 'var(--bg-card)',
        borderColor: featured ? 'rgba(245,190,80,0.4)' : 'var(--border)',
        color: featured ? '#fff' : 'var(--text)',
      }}
    >
      {featured && <span className="absolute right-5 top-5 rounded-full bg-amber-400/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-300">{t('recommended')}</span>}
      <p className="text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: featured ? '#F7D98B' : 'var(--text-sub)' }}>{t(`${plan}.name`)}</p>
      <p className="mt-5 text-2xl font-black">{t(`${plan}.price`)}</p>
      <p className="mt-3 min-h-[48px] text-sm leading-6" style={{ color: featured ? 'rgba(255,255,255,0.62)' : 'var(--text-sub)' }}>{t(`${plan}.description`)}</p>
      <ul className="mt-7 space-y-3">
        {PLAN_FEATURES[plan].map(feature => (
          <li key={feature} className="flex items-start gap-3 text-sm leading-5">
            <InclusionIcon included />
            <span>{t(`features.${feature}`)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function Component() {
  const t = useTranslations('plans');

  return (
    <section id="plans" className="py-24" style={{ background: 'var(--bg-alt)' }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-14 text-center">
          <span className="mb-4 inline-block rounded-full border border-violet-500/25 bg-violet-500/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-violet-500">{t('badge')}</span>
          <h2 className="text-balance text-4xl font-black tracking-tight sm:text-5xl" style={{ color: 'var(--text)' }}>{t('title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7" style={{ color: 'var(--text-sub)' }}>{t('subtitle')}</p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <PlanCard plan="free" />
          <PlanCard plan="basic" />
          <PlanCard plan="premium" />
        </div>

        <div className="mt-14 overflow-hidden rounded-3xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-[minmax(96px,1.5fr)_repeat(3,minmax(50px,1fr))] border-b px-2 py-4 sm:grid-cols-[minmax(140px,1.5fr)_repeat(3,minmax(80px,1fr))] sm:px-5" style={{ borderColor: 'var(--border)' }}>
            <p className="self-end text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-sub)' }}>{t('comparisonFeature')}</p>
            {(['free', 'basic', 'premium'] as const).map(plan => <p key={plan} className="break-words px-1 text-center text-[11px] font-black sm:text-sm" style={{ color: 'var(--text)' }}>{t(`${plan}.name`)}</p>)}
          </div>
          {COMPARISON_ROWS.map(([key, free, basic, premium], index) => (
            <div key={key} className="grid grid-cols-[minmax(96px,1.5fr)_repeat(3,minmax(50px,1fr))] items-center px-2 py-4 sm:grid-cols-[minmax(140px,1.5fr)_repeat(3,minmax(80px,1fr))] sm:px-5" style={{ borderTop: index === 0 ? undefined : '1px solid var(--border)' }}>
              <p className="pr-2 text-xs font-bold leading-5 sm:text-sm" style={{ color: 'var(--text)' }}>{t(`rows.${key}`)}</p>
              {[free, basic, premium].map((value, valueIndex) => (
                <div key={`${key}-${valueIndex}`} className="flex min-w-0 justify-center px-0.5 text-center" style={{ color: valueIndex === 2 ? '#B7791F' : valueIndex === 1 ? '#6366F1' : 'var(--text-sub)' }}>
                  <ComparisonValue value={value} />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="mx-auto mt-7 max-w-3xl space-y-2 text-center text-xs leading-5" style={{ color: 'var(--text-sub)' }}>
          <p>{t('basicVoiceNote')}</p>
          <p>{t('premiumVoiceNote')}</p>
          <p>{t('priceNote')}</p>
        </div>
      </div>
    </section>
  );
}
