const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const i18n = fs.readFileSync('src/i18n.ts', 'utf8');

/**
 * No locale may show an English plan name inside its own sentence.
 *
 * Korean read `Basic 플랜에 포함` and Chinese `含在 Basic 计划中` — the plan name
 * left untranslated in the middle of otherwise localized copy. Both dictionaries
 * already carried a proper name for the tier (`베이직`, `基础版`) in the plan
 * comparison table, so the app was contradicting itself screen to screen.
 *
 * The rule below is therefore not "no Latin text anywhere". It is: whatever a
 * locale writes as a plan name must be the name that locale itself declares in
 * `basic_plan_name` and `cmp_premium`. For eleven locales that declared name is
 * the Latin `Premium`, which is the established product spelling in those
 * markets and stays.
 */

// ── The authoritative registry ───────────────────────────────────────────────

/** Locale codes exactly as `SUPPORTED_LANGUAGES` declares them. */
function supportedLocales() {
  const registry = i18n.slice(i18n.indexOf('export const SUPPORTED_LANGUAGES'));
  return [...registry.matchAll(/\{ code: '([^']+)',/gu)].map(match => match[1]);
}

/** Locale code → the `const <name>: Dict` that holds it, in file order. */
const DICT_VAR = {
  'en-US': 'enUS', ja: 'ja', ko: 'ko', 'zh-CN': 'zhCN', es: 'es', fr: 'fr',
  de: 'de', it: 'it', 'pt-BR': 'ptBR', ru: 'ru', ar: 'ar', hi: 'hi', tr: 'tr',
  nl: 'nl', vi: 'vi', th: 'th', id: 'id', pl: 'pl', el: 'el', sv: 'sv',
};

const DICT_ORDER = Object.values(DICT_VAR)
  .map(v => ({ v, at: i18n.indexOf(`const ${v}: Dict = {`) }))
  .sort((a, b) => a.at - b.at);

function block(code) {
  const v = DICT_VAR[code];
  assert.ok(v, `no dictionary mapped for ${code}`);
  const at = i18n.indexOf(`const ${v}: Dict = {`);
  assert.ok(at > -1, `dictionary ${v} not found`);
  const next = DICT_ORDER.find(d => d.at > at);
  return i18n.slice(at, next ? next.at : i18n.length);
}

/**
 * Every `key: value` in one dictionary, joining multi-line concatenations.
 *
 * Several of the longest strings — `voice_credits_body`, `plan_downgrade_deferred_note`
 * — are written as `'…' + '…'` across lines, and a single-line reader would skip
 * exactly the copy most likely to carry a plan name.
 */
function entries(code) {
  const out = new Map();
  const re = /(?:^|[ ,])([a-z0-9_]+):\s*((?:(['"])(?:(?!\3)[^\\]|\\.)*\3\s*\+?\s*)+)/gmu;
  for (const m of block(code).matchAll(re)) {
    const literals = [...m[2].matchAll(/(['"])((?:(?!\1)[^\\]|\\.)*)\1/gu)].map(x => x[2]);
    out.set(m[1], literals.join(''));
  }
  return out;
}

/**
 * Latin `Basic` / `Premium` as a standalone word.
 *
 * A JavaScript `\b` would do here, but only by accident: it is ASCII-only, so it
 * fires between `c` and `プ`. Spelled out as an explicit Latin-letter boundary so
 * the intent survives anyone porting this check.
 */
const LATIN_PLAN_NAME = /(?<![A-Za-z])(Basic|Premium)(?![A-Za-z])/gu;

const LOCALES = supportedLocales();

test('the registry declares exactly twenty locales, and each has a dictionary', () => {
  assert.equal(LOCALES.length, 20);
  assert.deepEqual(
    LOCALES,
    ['en-US','es','fr','ja','ko','zh-CN','de','it','pt-BR','ru','ar','hi','tr','nl','vi','th','id','pl','el','sv'],
  );
  for (const code of LOCALES) assert.ok(entries(code).size > 100, `${code} looks empty`);
});

// ── 1 & 2: the plan-neutral Theme Details message ────────────────────────────

/** Placeholders a string carries, as a sorted multiset. */
function placeholders(value) {
  return (value.match(/\{[a-zA-Z]+\}/gu) ?? []).sort();
}

test('the neutral message is declared in all twenty dictionaries, and non-empty', () => {
  // `entries()` parses one dictionary block, so finding the key there is proof
  // it is written in that locale rather than inherited from anywhere.
  const missing = LOCALES.filter(code => !entries(code).has('theme_details_included_plan'));
  assert.deepEqual(missing, [], 'these locales do not declare theme_details_included_plan');

  for (const code of LOCALES) {
    const value = entries(code).get('theme_details_included_plan');
    assert.notEqual(value.trim(), '', `${code} declares it blank`);
  }
});

test('no locale reaches the English copy through the runtime fallback', () => {
  // `translate` is `dict[key] ?? DICTS['en-US'][key] ?? key`, so a locale that
  // omitted the key would silently render English and look translated. The
  // guarantee is that the first operand is always defined: every dictionary
  // declares the key itself, which the previous test establishes, and the type
  // makes an omission a compile error rather than a runtime fallback.
  assert.match(i18n, /return dict\[key\] \?\? DICTS\['en-US'\]\[key\] \?\? key;/u);
  assert.match(i18n, /type Dict = Record<TranslationKey, string>;/u);
  assert.match(i18n, /\| 'theme_details_included_plan'/u, 'the key must be in TranslationKey');

  // Counted across the file: one declaration per dictionary, no more and no
  // fewer. A locale sharing wording with another is fine — two languages may
  // legitimately phrase this the same way — but a locale *missing* it is not.
  const declarations = i18n.match(/(?:^|[ ,])theme_details_included_plan:/gmu) ?? [];
  assert.equal(declarations.length, LOCALES.length);
});

test('the neutral message carries the same placeholders in every locale', () => {
  const reference = placeholders(entries('en-US').get('theme_details_included_plan'));
  for (const code of LOCALES) {
    assert.deepEqual(
      placeholders(entries(code).get('theme_details_included_plan')),
      reference,
      `${code} lost or gained a placeholder`,
    );
  }
});

test('the neutral message names no tier, in any locale', () => {
  // The whole point of the key: it is shown to someone who already has a plan,
  // so naming one would tell a Premium subscriber they hold something else.
  for (const code of LOCALES) {
    const value = entries(code).get('theme_details_included_plan');
    assert.doesNotMatch(value, LATIN_PLAN_NAME, `${code} names a tier: ${value}`);
  }
});

test('Korean and Chinese carry no raw English plan name in this message', () => {
  // Called out separately from the sweep above because these two are the
  // locales the bug was reported in.
  for (const code of ['ko', 'zh-CN']) {
    const value = entries(code).get('theme_details_included_plan');
    assert.doesNotMatch(value, /Basic/u, `${code}: ${value}`);
    assert.doesNotMatch(value, /Premium/u, `${code}: ${value}`);
  }
});

test('the approved wording is pinned for the four reviewed locales', () => {
  const approved = {
    'en-US': 'Included with your plan',
    ja: '現在のプランに含まれています',
    ko: '현재 플랜에 포함',
    'zh-CN': '已包含在当前方案中',
  };
  for (const [code, value] of Object.entries(approved)) {
    assert.equal(entries(code).get('theme_details_included_plan'), value, code);
  }
});

test('the Basic-specific message survives only where naming Basic is correct', () => {
  // It is still the upsell shown to someone who has no plan, so it still exists
  // — but it now says each locale's own word for the tier.
  for (const code of LOCALES) {
    const value = entries(code).get('theme_details_included_basic');
    assert.ok(value, `${code} is missing theme_details_included_basic`);
  }
  assert.equal(entries('ko').get('theme_details_included_basic'), '베이직 플랜에 포함');
  assert.equal(entries('zh-CN').get('theme_details_included_basic'), '含在基础版计划中');
});

// ── 3 & 4: no accidental English plan name in any locale ─────────────────────

test('Korean and Chinese contain no raw English Basic or Premium at all', () => {
  for (const code of ['ko', 'zh-CN']) {
    const offenders = [];
    for (const [key, value] of entries(code)) {
      if (LATIN_PLAN_NAME.test(value)) offenders.push(`${key}: ${value}`);
      LATIN_PLAN_NAME.lastIndex = 0;
    }
    assert.deepEqual(offenders, [], `${code} still mixes English plan names into its copy`);
  }
});

test('any Latin plan name a locale keeps is the one that locale itself declares', () => {
  // The check that generalizes the Korean and Chinese bugs to the other
  // seventeen: a locale may write `Premium` only if `Premium` is what its own
  // comparison table calls the tier.
  for (const code of LOCALES) {
    if (code === 'en-US') continue;
    const dict = entries(code);
    const canonical = new Set([dict.get('basic_plan_name'), dict.get('cmp_premium'), dict.get('basic')]);
    for (const [key, value] of dict) {
      for (const [, name] of value.matchAll(LATIN_PLAN_NAME)) {
        assert.ok(
          canonical.has(name),
          `${code}/${key} writes "${name}" but that locale calls the tiers `
          + `${dict.get('basic_plan_name')} / ${dict.get('cmp_premium')}: ${value}`,
        );
      }
    }
  }
});

test('the locales that keep Latin Premium do so by their own declaration', () => {
  // Documented rather than assumed: these eleven declare `Premium` as the tier
  // name, so it is the product name and not leftover English.
  const keepsLatinPremium = ['es','fr','de','it','pt-BR','tr','nl','id','pl','sv'];
  for (const code of keepsLatinPremium) {
    assert.equal(entries(code).get('cmp_premium'), 'Premium', code);
  }
  // And no locale keeps Latin `Basic`: every one translated or transliterated it.
  for (const code of LOCALES) {
    if (code === 'en-US') continue;
    assert.notEqual(entries(code).get('basic_plan_name'), 'Basic', code);
  }
});

test('no non-English locale is left holding an untranslated English sentence', () => {
  // `plan_usage_desc` shipped as raw English in five locales — the same bug in
  // its worst form. Sampled on the keys this audit touched.
  const english = entries('en-US');
  const audited = [
    'plan_usage_desc', 'plan_usage_title', 'upgrade_to_basic', 'purchase_done_basic',
    'purchase_done_premium', 'theme_details_upgrade', 'ai_features_explain',
    'err_plan_required_speech', 'voice_limit_daily', 'voice_limit_monthly',
  ];
  for (const code of LOCALES) {
    if (code === 'en-US') continue;
    const dict = entries(code);
    for (const key of audited) {
      assert.notEqual(dict.get(key), english.get(key), `${code}/${key} is still the English string`);
    }
  }
});

// ── 5: placeholders ──────────────────────────────────────────────────────────

test('every placeholder survived the rewrites, in every locale', () => {
  const english = entries('en-US');
  const placeholders = value => (value.match(/\{[a-z]+\}/gu) ?? []).sort();
  for (const code of LOCALES) {
    if (code === 'en-US') continue;
    const dict = entries(code);
    for (const [key, source] of english) {
      const want = placeholders(source);
      if (want.length === 0) continue;
      const got = placeholders(dict.get(key) ?? '');
      if (!dict.has(key)) continue;
      assert.deepEqual(got, want, `${code}/${key} lost or gained a placeholder`);
    }
  }
});

// ── 6 & 7: the states stay distinct in the UI ────────────────────────────────

test('both paid tiers reach the same neutral message, and only that one', () => {
  const details = fs.readFileSync('src/components/ThemeDetailsSheet.tsx', 'utf8');
  // Comments stripped for the count: the component explains at length why the
  // key is neutral, and that prose is not a second call site.
  const detailsCode = details
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/.*$/gmu, '');

  // `included` is the one state a Basic *or* Premium subscriber resolves to —
  // the price module makes no distinction between them — and it renders the
  // neutral key. There is no tier branch anywhere near it.
  assert.match(
    details,
    /\{isUnlocked && priceDisplay\.state === 'included' && \([\s\S]{0,200}t\('theme_details_included_plan'\)/u,
  );
  assert.equal((detailsCode.match(/theme_details_included_plan/gu) ?? []).length, 1);
  assert.doesNotMatch(detailsCode, /isPremium|plan === '(?:basic|premium)'/u);

  const products = fs.readFileSync('src/features/themes/themeProducts.ts', 'utf8');
  assert.match(products, /access\.reason === 'subscription'/u);
  assert.doesNotMatch(products, /'basic'|'premium'/u, 'the price rule must not name a tier');
});

test('owned and Free stay separate from the included message', () => {
  const details = fs.readFileSync('src/components/ThemeDetailsSheet.tsx', 'utf8');
  // Bought outright: its own permanent label, on every plan.
  assert.match(details, /priceDisplay\.state === 'owned' \? \([\s\S]{0,200}t\('theme_owned'\)/u);
  // No plan: the upsell, which is the only place a tier is named.
  assert.match(details, /\{!isUnlocked && \([\s\S]{0,120}t\('theme_details_included_basic'\)/u);
  // A Free user never reaches the neutral message: it needs `isUnlocked`, and a
  // free theme resolves to `free` rather than `included`.
  const access = fs.readFileSync('src/features/themes/themeAccess.ts', 'utf8');
  assert.match(access, /if \(price <= 0\) return \{ state: 'unlocked', reason: 'free' \};/u);
});
