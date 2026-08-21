import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPARISON_ROWS, PLAN_FEATURES } from '../lib/marketingContract.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const repoRoot = resolve(root, '..');
const read = relativePath => readFileSync(resolve(root, relativePath), 'utf8');
const readRepo = relativePath => readFileSync(resolve(repoRoot, relativePath), 'utf8');
const messages = locale => JSON.parse(read(`messages/${locale}.json`));
const row = key => COMPARISON_ROWS.find(([rowKey]) => rowKey === key);

test('the website contract matches the app feature flags and plan gates', () => {
  const planLimits = readRepo('src/lib/planLimits.ts');
  const flags = readRepo('src/features/flags.ts');
  const backup = readRepo('src/features/backup/backupAccess.ts');
  const themes = readRepo('src/features/themes/themeAccess.ts');

  assert.match(planLimits, /basic:\s*200/u);
  assert.match(planLimits, /premium:\s*null/u);
  assert.match(flags, /AI_TEXT_FEATURES_ENABLED\s*=\s*false/u);
  assert.match(flags, /TEXT_TO_SPEECH_ENABLED\s*=\s*false/u);
  assert.match(backup, /return plan === 'premium'/u);
  assert.match(themes, /Basic or Premium subscription/u);

  assert.deepEqual(row('aiVoice'), ['aiVoice', 'promoOnly', 'basicVoice', 'premiumVoice']);
  assert.deepEqual(row('backup'), ['backup', 'notIncluded', 'notIncluded', 'included']);
  assert.deepEqual(row('transfer'), ['transfer', 'notIncluded', 'notIncluded', 'included']);
  assert.deepEqual(row('priority'), ['priority', 'notIncluded', 'notIncluded', 'included']);
  assert.ok(PLAN_FEATURES.basic.includes('basicVoice'));
  assert.ok(!PLAN_FEATURES.basic.includes('backup'));
  assert.ok(!PLAN_FEATURES.basic.includes('priority'));
  assert.ok(PLAN_FEATURES.premium.includes('backup'));
  assert.ok(PLAN_FEATURES.premium.includes('priority'));
});

test('EN and JA advertise only current visible features and use the confirmed voice allowance', () => {
  for (const locale of ['en', 'ja']) {
    const text = JSON.stringify(messages(locale));
    assert.doesNotMatch(text, /Supabase|AI Meaning|AI Translation|AI Breakdown|AI Example|Text[- ]to[- ]Speech/iu);
    assert.doesNotMatch(text, /10 AI voice|Unlimited AI voice|120 uses|100\s*\/\s*month/iu);
  }

  const en = messages('en');
  const ja = messages('ja');
  assert.equal(en.plans.values.basicVoice, '200/month');
  assert.equal(ja.plans.values.basicVoice, '月200回');
  assert.match(en.plans.premiumVoiceNote, /no monthly product quota/u);
  assert.match(ja.plans.premiumVoiceNote, /月間の製品利用枠はありません/u);
  assert.match(en.features.cards.local.desc, /no account/u);
  assert.match(ja.features.cards.local.title, /端末内/u);
});

test('marketing has no individual-theme sale or hidden AI screenshot', () => {
  const themes = `${read('components/ThemesSection.tsx')}\n${JSON.stringify(messages('en').themes)}\n${JSON.stringify(messages('ja').themes)}`;
  const gallery = read('components/ScreenshotGallery.tsx');
  assert.doesNotMatch(themes, /\$\d|¥\d|Buy now|購入ボタン/iu);
  assert.match(themes, /themes are not sold individually/u);
  assert.doesNotMatch(gallery, /add-word-ai/u);
});

test('legal footer links retain the production route contract', () => {
  const footer = read('components/Footer.tsx');
  assert.match(footer, /href="\/privacy"/u);
  assert.match(footer, /href="\/terms"/u);
  assert.match(footer, /href="\/licenses"/u);
  assert.match(readRepo('src/config/legalUrls.ts'), /https:\/\/word-ping-chi\.vercel\.app\/privacy/u);
});

test('hero lifecycle and reduced-motion behavior are wired into the rendered hero', () => {
  const hero = read('components/Hero.tsx');
  assert.match(hero, /createHeroPlayback/u);
  assert.match(hero, /IntersectionObserver/u);
  assert.match(hero, /visibilitychange/u);
  assert.match(hero, /prefers-reduced-motion/u);
  assert.match(hero, /playback\.dispose\(\)/u);
});

test('metadata uses production canonicals, alternates and the canonical iOS icon', () => {
  const page = read('app/[locale]/page.tsx');
  assert.match(page, /https:\/\/word-ping-chi\.vercel\.app/u);
  assert.match(page, /canonical/u);
  assert.match(page, /x-default/u);
  assert.match(page, /twitter/u);

  const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(digest(resolve(repoRoot, 'assets/icon.png')), digest(resolve(root, 'public/icon.png')));
});
