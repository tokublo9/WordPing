const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const i18n = fs.readFileSync('src/i18n.ts', 'utf8');
const sheet = fs.readFileSync('src/components/AnnouncementsSheet.tsx', 'utf8');
const announcements = fs.readFileSync('src/features/announcements/announcements.ts', 'utf8');

/**
 * The welcome announcement said `WordCore` in all twenty languages.
 *
 * Every dictionary already carried the brand in its own script — `ワードコア`,
 * `워드코어`, `沃德科尔` — under `app_name`, and the announcement copy simply
 * spelled the Latin name out again. The fix is the interpolation the app already
 * uses for `{date}` and `{limit}`: the copy carries `{appName}` and the sheet
 * fills it from `app_name` at render.
 *
 * What is verified here is the whole chain — placeholder present in all twenty,
 * no locale left hardcoding the brand, and the substitution actually performed
 * against the active translator rather than a module-level constant.
 */

// ── Reading the dictionaries ─────────────────────────────────────────────────

const DICT_VAR = {
  'en-US': 'enUS', ja: 'ja', ko: 'ko', 'zh-CN': 'zhCN', es: 'es', fr: 'fr',
  de: 'de', it: 'it', 'pt-BR': 'ptBR', ru: 'ru', ar: 'ar', hi: 'hi', tr: 'tr',
  nl: 'nl', vi: 'vi', th: 'th', id: 'id', pl: 'pl', el: 'el', sv: 'sv',
};
const ORDER = Object.values(DICT_VAR)
  .map(v => ({ v, at: i18n.indexOf(`const ${v}: Dict = {`) }))
  .sort((a, b) => a.at - b.at);

function entries(code) {
  const at = i18n.indexOf(`const ${DICT_VAR[code]}: Dict = {`);
  assert.ok(at > -1, `no dictionary for ${code}`);
  const next = ORDER.find(d => d.at > at);
  const block = i18n.slice(at, next ? next.at : i18n.length);
  const out = new Map();
  const re = /(?:^|[ ,])([a-z0-9_]+):\s*((?:(['"])(?:(?!\3)[^\\]|\\.)*\3\s*\+?\s*)+)/gmu;
  for (const m of block.matchAll(re)) {
    const literals = [...m[2].matchAll(/(['"])((?:(?!\1)[^\\]|\\.)*)\1/gu)].map(x => x[2]);
    out.set(m[1], literals.join(''));
  }
  return out;
}

/** The app's own `fillTemplate`, so the test resolves copy the way the app does. */
function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/gu, (match, key) => values[key] ?? match);
}

const LOCALES = Object.keys(DICT_VAR);
const WELCOME_KEYS = ['announcement_welcome_title', 'announcement_welcome_body'];

/** Title and body as the sheet would render them for one locale. */
function rendered(code) {
  const dict = entries(code);
  const appName = dict.get('app_name');
  return {
    appName,
    title: fillTemplate(dict.get('announcement_welcome_title') ?? '', { appName }),
    body: fillTemplate(dict.get('announcement_welcome_body') ?? '', { appName }),
  };
}

// ── 1: every locale resolves through its own app_name ────────────────────────

test('all twenty welcome announcements carry the placeholder, not a brand name', () => {
  assert.equal(LOCALES.length, 20);
  for (const code of LOCALES) {
    const dict = entries(code);
    for (const key of WELCOME_KEYS) {
      const raw = dict.get(key);
      assert.ok(raw, `${code} is missing ${key}`);
      assert.match(raw, /\{appName\}/u, `${code}/${key} does not interpolate the brand`);
    }
  }
});

test('every locale renders its own localized brand, and none falls back to English', () => {
  for (const code of LOCALES) {
    const { appName, title, body } = rendered(code);
    assert.ok(appName, `${code} has no app_name`);
    assert.ok(title.includes(appName), `${code} title does not contain ${appName}: ${title}`);
    assert.ok(body.includes(appName), `${code} body does not contain ${appName}`);
    // Nothing left unsubstituted.
    assert.doesNotMatch(title, /\{\w+\}/u, `${code} title has an unfilled placeholder`);
    assert.doesNotMatch(body, /\{\w+\}/u, `${code} body has an unfilled placeholder`);
    // And no stray Latin brand beside the localized one.
    if (appName !== 'WordCore') {
      assert.doesNotMatch(title, /WordCore/u, `${code} title still shows the English brand`);
      assert.doesNotMatch(body, /WordCore/u, `${code} body still shows the English brand`);
    }
  }
});

// ── 2, 3, 4: the three reported languages ────────────────────────────────────

test('Japanese, Korean and Chinese render their own script', () => {
  assert.equal(rendered('ja').appName, 'ワードコア');
  assert.match(rendered('ja').title, /^ワードコアをインストール/u);
  assert.match(rendered('ja').body, /^ワードコアへようこそ/u);

  assert.equal(rendered('ko').appName, '워드코어');
  assert.match(rendered('ko').title, /^워드코어를 설치/u);
  assert.match(rendered('ko').body, /^워드코어에 오신/u);

  assert.equal(rendered('zh-CN').appName, '沃德科尔');
  // Chinese sets no space before the name; the Latin spelling used to need one.
  assert.match(rendered('zh-CN').title, /^感谢安装沃德科尔/u);
  assert.match(rendered('zh-CN').body, /^欢迎使用沃德科尔/u);
});

test('the other non-Latin locales are localized too', () => {
  for (const [code, name] of [
    ['ru', 'ВордКор'], ['ar', 'وورد كور'], ['hi', 'वर्डकोर'],
    ['th', 'เวิร์ดคอร์'], ['el', 'ΓουόρντΚορ'],
  ]) {
    const { title, body } = rendered(code);
    assert.ok(title.includes(name), `${code} title: ${title}`);
    assert.ok(body.includes(name), `${code} body`);
  }
  // English is unchanged, and the Latin-script locales keep the Latin brand
  // because that is what their own `app_name` says.
  assert.equal(rendered('en-US').title, 'Thank you for installing WordCore!');
});

// ── 5: language changes the text, never the identity ─────────────────────────

test('changing language changes the copy but not the id or read state', () => {
  // The id is a literal constant with no relationship to any translation, and
  // the read state is keyed by it — so no amount of re-rendering can mark the
  // welcome unread again.
  assert.match(announcements, /export const WELCOME_ANNOUNCEMENT_ID = 'welcome-first-install\.v1';/u);
  assert.match(announcements, /id: WELCOME_ANNOUNCEMENT_ID,\s*titleKey: 'announcement_welcome_title',\s*bodyKey: 'announcement_welcome_body',/u);
  // Nothing in the announcement model reads a translated value.
  assert.doesNotMatch(announcements, /app_name|appName|fillTemplate|useLang/u);
  // Read state and unread state are matched on `item.id` alone.
  assert.match(announcements, /readIds\.has\(item\.id\)/u);
  assert.match(announcements, /export function initialReadAnnouncementIds\(/u);

  // Two locales produce different copy for the same id.
  const ja = rendered('ja');
  const ko = rendered('ko');
  assert.notEqual(ja.title, ko.title);
  assert.notEqual(ja.body, ko.body);
});

/** Placeholders a string carries, as a sorted multiset. */
function placeholders(value) {
  return (value.match(/\{[a-zA-Z]+\}/gu) ?? []).sort();
}

test('every welcome value is declared, non-empty, and never reaches English by fallback', () => {
  // The gap the removed uniqueness check was standing in for, and did not cover.
  // `translate` is `dict[key] ?? DICTS['en-US'][key] ?? key`, so a locale that
  // omitted one of these keys would silently render the English sentence. For
  // the twelve locales whose own `app_name` is the Latin `WordCore`, that
  // fallback is invisible to every other assertion in this file: the English
  // title contains `WordCore`, so `title.includes(appName)` still passes.
  //
  // What rules it out is the first operand always being defined — one
  // declaration per dictionary, counted across the whole file.
  assert.match(i18n, /return dict\[key\] \?\? DICTS\['en-US'\]\[key\] \?\? key;/u);
  assert.match(i18n, /type Dict = Record<TranslationKey, string>;/u);
  for (const key of WELCOME_KEYS) {
    const declarations = i18n.match(new RegExp(`(?:^|[ ,])${key}:`, 'gmu')) ?? [];
    assert.equal(declarations.length, LOCALES.length, `${key} is not declared once per locale`);
  }

  for (const code of LOCALES) {
    const dict = entries(code);
    for (const key of WELCOME_KEYS) {
      assert.ok(dict.has(key), `${code} does not declare ${key}`);
      assert.notEqual(dict.get(key).trim(), '', `${code} declares ${key} blank`);
    }
  }
});

test('the welcome copy carries the same placeholders in every locale', () => {
  // Compared as a set against English rather than merely "nothing unfilled
  // remains", so a locale that dropped `{appName}` or gained a stray token is
  // caught in the dictionary rather than after substitution.
  const english = entries('en-US');
  for (const key of WELCOME_KEYS) {
    const reference = placeholders(english.get(key));
    assert.deepEqual(reference, ['{appName}'], `${key} should interpolate exactly the brand`);
    for (const code of LOCALES) {
      assert.deepEqual(
        placeholders(entries(code).get(key)),
        reference,
        `${code}/${key} lost or gained a placeholder`,
      );
    }
  }
});

test('the approved rendered titles are pinned exactly for the four reviewed locales', () => {
  // Exact equality, not a prefix: the checks above match only the opening of the
  // Japanese, Korean and Chinese sentences, which would not notice the rest of
  // the sentence changing.
  const approved = {
    'en-US': 'Thank you for installing WordCore!',
    ja: 'ワードコアをインストールしていただきありがとうございます！',
    ko: '워드코어를 설치해 주셔서 감사합니다!',
    'zh-CN': '感谢安装沃德科尔！',
  };
  for (const [code, title] of Object.entries(approved)) {
    assert.equal(rendered(code).title, title, code);
  }
});

test('the brand is resolved at render, from the active translator', () => {
  // Not a module constant: `t` comes from the language context, and the memo is
  // keyed on it, so a language switch recomputes the name and the rows re-render.
  assert.match(sheet, /import \{ fillTemplate \} from '\.\.\/lib\/fillTemplate';/u);
  assert.match(sheet, /const t = useLang\(\);/u);
  assert.match(sheet, /const brandValues = useMemo\(\(\) => \(\{ appName: t\('app_name'\) \}\), \[t\]\);/u);
  assert.match(sheet, /const title = fillTemplate\(t\(item\.titleKey\), brandValues\);/u);
  assert.match(sheet, /const body = fillTemplate\(t\(item\.bodyKey\), brandValues\);/u);

  // The id, the unread flag and the date are untouched by any of this.
  assert.match(sheet, /const unread = unreadIds\?\.has\(item\.id\) === true;/u);
  assert.match(sheet, /key=\{item\.id\}/u);
  assert.match(sheet, /formatDate\(item\.publishedAt, language\)/u);

  // No string-replacement hack, and no second copy of the brand.
  assert.doesNotMatch(sheet, /'WordCore'|"WordCore"/u);
  assert.doesNotMatch(sheet, /\.replace\(/u);
});

// ── 6: the brand is not duplicated into announcement copy ────────────────────

test('no welcome translation hardcodes the brand outside English app_name', () => {
  for (const code of LOCALES) {
    const dict = entries(code);
    for (const key of WELCOME_KEYS) {
      assert.doesNotMatch(
        dict.get(key),
        /WordCore/u,
        `${code}/${key} spells the brand out instead of interpolating it`,
      );
    }
  }
  // The twenty spellings live in exactly one key each.
  const names = LOCALES.map(code => entries(code).get('app_name'));
  assert.equal(names.length, 20);
  assert.ok(names.every(name => name && name.trim() !== ''));
  // Nine distinct spellings: eight locales write the brand in their own script,
  // and the remaining twelve share the Latin `WordCore` their own `app_name`
  // declares.
  assert.equal(names.filter(name => name === 'WordCore').length, 12);
  assert.equal(new Set(names).size, 9);
});
