const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const i18n = read('src/i18n.ts');

/**
 * Three pieces of copy that had drifted from what the app actually does.
 *
 * Every dictionary is typed `Dict = Record<TranslationKey, string>`, so a
 * missing key is a compile error rather than a silent English fallback — the
 * counts below are therefore about *coverage of the twenty locales*, not about
 * whether a lookup would resolve. `test_info_title` is required of every
 * locale, so counting it counts the dictionaries.
 */
const LOCALE_COUNT = (i18n.match(/^ {2}test_info_title:/gmu) ?? []).length;

test('the dictionary count these assertions are measured against is twenty', () => {
  assert.equal(LOCALE_COUNT, 20);
});

// ── 1. The four-result explanation popup ─────────────────────────────────────

/**
 * Every value written for a key, one per dictionary.
 *
 * Two shapes have to be tolerated or the count silently under-reports and the
 * assertion passes on half the locales: some dictionaries write one key per
 * line and some pack several onto one, and a value containing an apostrophe is
 * double-quoted instead (French `"Langue d'explication"`).
 */
function values(key) {
  const pattern = new RegExp(`(?:^|[ ,])${key}: *(['"])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`, 'gmu');
  return [...i18n.matchAll(pattern)].map(match => match[2]);
}

const RESULT_KEYS = [
  'test_info_perfect_exp',
  'test_info_good_exp',
  'test_info_slightly_exp',
  'test_info_unknown_exp',
];

test('all four result explanations are written in every one of the twenty locales', () => {
  for (const key of RESULT_KEYS) {
    assert.equal(values(key).length, LOCALE_COUNT, `${key} needs one entry per locale`);
  }
});

test('no locale still tells the user about Flip Mode', () => {
  // The mode was withdrawn — `FLIP_MODE_ENABLED` is false and the row that
  // switched to it is not rendered — so copy that sends someone there is
  // describing a screen they cannot reach.
  const flipMode = /flip ?mode|flip-mod|フリップモード|플립 ?모드|翻转模式|modo flip|mode flip/iu;
  for (const key of RESULT_KEYS) {
    for (const value of values(key)) {
      assert.doesNotMatch(value, flipMode, `${key} still refers to Flip Mode: ${value}`);
    }
  }
});

test('the three timed results still name the Word List, the wait and the filter colour', () => {
  // The rewrite removed one clause and nothing else: which list the word leaves,
  // how long it stays away and which coloured filter brings it back are the
  // whole point of the popup.
  const good     = "test_info_good_exp:    'The word is hidden from the Word List, then shown again after 3 days. You can still view it using the blue filter.'";
  const slightly = "test_info_slightly_exp:'The word is hidden from the Word List, then shown again after 1 day. You can still view it using the yellow filter.'";
  const unknown  = "test_info_unknown_exp: 'The word is hidden from the Word List, then shown again after 1 hour. You can still view it using the red filter.'";
  for (const copy of [good, slightly, unknown]) assert.ok(i18n.includes(copy), copy);

  // The waits are quoted from the scheduler, which is untouched.
  const visibility = read('src/features/cards/visibility.ts');
  assert.match(visibility, /PRETTY_GOOD_HIDE_MS = 72 \* 60 \* 60 \* 1000/u);
  assert.match(visibility, /NOT_REALLY_HIDE_MS = 24 \* 60 \* 60 \* 1000/u);
  assert.match(visibility, /DONT_KNOW_HIDE_MS = 60 \* 60 \* 1000/u);
});

test('every locale explains the three timed results rather than labelling them', () => {
  // Eighteen locales carried a bare label — "Repasar en 3 días", "3일 후 복습" —
  // where English carried a sentence. Rewriting only the three that mentioned
  // Flip Mode would have left one short line above three paragraphs, so all
  // four moved together. A sentence is the shortest thing that can carry the
  // filter colour, which is what the label never said.
  //
  // The floor separates the two forms in every script: the longest retired
  // label was 23 characters ("In 1 Stunde wiederholen") and the shortest
  // explanation now written is comfortably past 30, including the dense CJK
  // ones. `test_info_perfect_exp` is deliberately outside this — it is one
  // clause with no wait and no filter to name, so in Chinese it is legitimately
  // shorter than a German label. Its coverage is the twenty-entry count above
  // plus the exact English and Japanese copy in testModeInfoSheet.test.cjs.
  for (const key of ['test_info_good_exp', 'test_info_slightly_exp', 'test_info_unknown_exp']) {
    for (const value of values(key)) {
      assert.ok(
        value.length >= 30,
        `${key} is still a label rather than an explanation: ${value}`,
      );
    }
  }
});

test('the four results, their icons and their order are untouched', () => {
  const screen = read('src/components/TestModeScreen.tsx');
  const answers = screen.slice(screen.indexOf('const ANSWERS'), screen.indexOf('// ── Information popup'));
  assert.match(answers, /kind: 'perfect',[\s\S]{0,100}icon: '◎',[\s\S]{0,30}color: '#22c55e'/u);
  assert.match(answers, /kind: 'good',[\s\S]{0,100}icon: 'ellipse-outline',[\s\S]{0,30}color: '#3B82F6'/u);
  assert.match(answers, /kind: 'slightly',[\s\S]{0,100}icon: 'triangle-outline',[\s\S]{0,30}color: '#f59e0b'/u);
  assert.match(answers, /kind: 'unknown',[\s\S]{0,100}icon: 'close-outline',[\s\S]{0,30}color: '#ef4444'/u);
});

// ── 1b. Vertical Flip, and the last reachable Flip Mode reference ────────────

/**
 * The surfaces Vertical Flip actually reaches, traced rather than assumed.
 *
 * Two components read the flag to pick a rotation axis: `TestModeScreen` and
 * `FlipCardBrowser`. Only the first is reachable — `setCardViewMode` in
 * `useCards.ts` refuses `'flip'` outright while `FLIP_MODE_ENABLED` is false, so
 * `cardViewMode` is permanently `'list'` and the Flip layer never activates.
 * The Word List's own card flip is not a third surface: `SwipeableCard` swaps
 * its rendered faces and animates no rotation at all, and never reads the flag.
 *
 * So the row's explanation names Test Mode and nothing else. It used to promise
 * a mode the build cannot open.
 */
test('exactly one reachable surface reads the Vertical Flip flag', () => {
  const testMode = read('src/components/TestModeScreen.tsx');
  const browser = read('src/components/FlipCardBrowser.tsx');
  const card = read('src/components/SwipeableCard.tsx');
  const cards = read('src/features/cards/useCards.ts');
  const flags = read('src/features/flags.ts');

  // Both axis pickers are identical; what differs is whether the screen opens.
  assert.match(testMode, /const rotateKey = verticalFlip \? 'rotateX' : 'rotateY';/u);
  assert.match(browser, /const rotateKey = verticalFlip \? 'rotateX' : 'rotateY';/u);

  // The gate that makes the second one unreachable.
  assert.match(flags, /export const FLIP_MODE_ENABLED = false;/u);
  assert.match(
    cards,
    /if \(!FLIP_MODE_ENABLED\) \{\s*setSelectedCardViewMode\('list'\);\s*return;\s*\}/u,
  );

  // The Word List row is not a Vertical Flip surface at all.
  assert.doesNotMatch(card, /verticalFlip|rotateX|rotateY/u);
});

test('vertical_flip_info names Test Mode alone, in every one of the twenty locales', () => {
  const explanations = values('vertical_flip_info');
  assert.equal(explanations.length, LOCALE_COUNT, 'vertical_flip_info needs one entry per locale');

  // Not one of them still sends the user to a mode the build cannot open. The
  // pattern covers the inflected forms too — Russian "режиме карточек",
  // Polish "trybu kart" — which a stem-only match would walk straight past.
  const removedMode =
    /flip ?mode|flip-mod|フリップモード|플립 ?모드|翻卡模式|翻转模式|modo (tarjeta|carta|flip)|mode (carte|flip)|Kartenmodus|modalità carte|modo cartão|режим\w* карточек|وضع البطاقات|कार्ड मोड|Kart modu|kaartmodus|chế độ thẻ|โหมดการ์ด|mode kartu|tryb\w* kart|λειτουργία καρτών|kortläge/iu;
  for (const value of explanations) {
    assert.doesNotMatch(value, removedMode, `still promises a removed mode: ${value}`);
  }

  // Each keeps its own first sentence and its own existing word for Test Mode,
  // so no locale was flattened into a translation of the English or trimmed to
  // a stub. The floor is 25 rather than the 30 used for the result popup above:
  // Chinese says the whole thing in 27 characters, and a floor that ignored how
  // dense the script is would be measuring the language, not the copy.
  assert.ok(explanations.every(value => value.length >= 25), 'no locale may be reduced to a stub');
  for (const expected of [
    'Changes the card-flip animation from horizontal to vertical. Applies to Test Mode.',
    'カードをめくるアニメーションを横方向から縦方向に変更します。テストモードに適用されます。',
    'Ändert die Umdrehanimation der Karte von horizontal zu vertikal. Gilt für den Testmodus.',
    'Ändrar kortets vändningsanimation från vågrät till lodrät. Gäller testläget.',
  ]) {
    assert.ok(explanations.includes(expected), `missing: ${expected}`);
  }
});

test('Vertical Flip still behaves and still persists exactly as it did', () => {
  // The copy changed; the setting did not. Same default, same key, same write.
  const settingsState = read('src/app/useAppSettings.ts');
  const persistence = read('src/app/useAppPersistence.ts');
  const settings = read('src/components/SettingsModal.tsx');

  assert.match(settingsState, /const \[verticalFlip, setVerticalFlip\] = useState\(false\);/u);
  assert.match(
    persistence,
    /AsyncStorage\.setItem\(VERTICAL_FLIP_KEY, verticalFlip \? 'true' : 'false'\)/u,
  );
  // Still an ordinary toggle row with its info button, rendered unconditionally
  // — it is the Word Flip row above it that is withheld, not this one.
  assert.match(
    settings,
    /<ToggleRow\s+icon="swap-vertical-outline"\s+label=\{t\('vertical_flip'\)\}\s+info=\{t\('vertical_flip_info'\)\}/u,
  );
  // And the label is untouched: the setting is named for what it does.
  assert.ok(values('vertical_flip').includes('Vertical Flip'));
  assert.equal(values('vertical_flip').length, LOCALE_COUNT);
});

test('no reachable Settings or tutorial copy refers to the deleted Flip Mode', () => {
  const settings = read('src/components/SettingsModal.tsx');

  // `view_flip` is the one Settings key that still says "Flip Mode", and the row
  // that draws it is withheld behind the flag rather than rendered disabled.
  assert.match(
    settings,
    /\{FLIP_MODE_ENABLED && \(\s*<ToggleRow[\s\S]{0,200}label=\{t\('view_flip'\)\}/u,
  );
  assert.equal(
    (settings.match(/t\('view_flip'\)/gu) ?? []).length,
    1,
    'view_flip must have exactly one call site, and it must be the guarded one',
  );

  // The tutorial copy is dead: no component reads a `tutN_` key, statically or
  // by building the name. Kept rather than deleted from twenty dictionaries for
  // a screen that no longer exists — removing it is churn, not a fix.
  const sources = ['App.tsx', 'src/components/OnboardingModal.tsx', 'src/components/SettingsModal.tsx'];
  for (const path of sources) {
    assert.doesNotMatch(read(path), /tut[0-9]_(?:title|desc)/u, `${path} must not render tutorial copy`);
  }
});

// ── 2. The Settings language row ─────────────────────────────────────────────

test('Settings names the row, its label and the picker just "Language"', () => {
  const settings = read('src/components/SettingsModal.tsx');
  const picker = read('src/components/LanguageModal.tsx');

  // Row label, its accessibility label, and the screen the row opens.
  assert.match(settings, /accessibilityLabel=\{`\$\{t\('language'\)\}: \$\{t\(activeLang\.nameKey\)\}`\}/u);
  assert.match(settings, /<Text style=\{\[styles\.removeAdsLabel, \{ color: pal\.text \}\]\}>\{t\('language'\)\}<\/Text>/u);
  assert.match(picker, /<Text style=\{\[styles\.title, \{ color: pal\.text \}\]\}>\{t\('language'\)\}<\/Text>/u);

  // Neither surface reaches for the onboarding wording any more. Matched
  // outside comments, which still explain why the key moved.
  for (const [path, source] of [['SettingsModal.tsx', settings], ['LanguageModal.tsx', picker]]) {
    assert.doesNotMatch(source, /t\('ob_native_lang'\)/u, `${path} must not label anything Explanation Language`);
  }
});

test('onboarding still asks for the Explanation Language', () => {
  const onboarding = read('src/components/OnboardingModal.tsx');
  assert.match(
    onboarding,
    /const langTitleKey: TranslationKey = showingLearnLang \? 'ob_learn_lang' *: 'ob_native_lang';/u,
  );
  assert.match(
    onboarding,
    /const langDescKey: *TranslationKey = showingLearnLang \? 'ob_learn_lang_desc' : 'ob_native_lang_desc';/u,
  );
  // Its copy is untouched, so the step that first asks the question still names
  // it the way it always did — in every locale.
  const asked = values('ob_native_lang');
  assert.equal(asked.length, LOCALE_COUNT);
  assert.ok(asked.includes('Explanation Language'), 'onboarding must still say Explanation Language');
  assert.ok(asked.includes('説明言語'));
  assert.ok(asked.includes("Langue d'explication"));
});

test('every locale has its own word for Language, and none of them says Explanation', () => {
  const named = values('language');
  assert.equal(named.length, LOCALE_COUNT);
  for (const value of named) {
    assert.doesNotMatch(value, /explanation|explicaci|explicaç|erklär|説明|설명|说明/iu, value);
  }
  // A sample across scripts, so a locale cannot quietly fall back to English.
  for (const expected of ['Language', '言語', '언어', '语言', 'Sprache', 'Язык', 'اللغة', 'ภาษา']) {
    assert.ok(named.includes(expected), `no locale renders Language as ${expected}`);
  }
});

test('the language list itself is untouched', () => {
  // Twenty entries, each with its code, onboarding code and localized name.
  const registry = i18n.slice(i18n.indexOf('export const SUPPORTED_LANGUAGES'));
  assert.equal((registry.match(/onboardingCode: '/gu) ?? []).length, LOCALE_COUNT);
  for (const key of ['lang_name_japanese', 'lang_name_korean', 'lang_name_swedish']) {
    assert.equal(values(key).length, LOCALE_COUNT, `${key} needs one entry per locale`);
  }
});

// ── 3. The brand name in a solid-colour theme preview ────────────────────────

test('both solid-colour previews draw the localized brand name, not a literal', () => {
  const shop = read('src/components/KisekaeShopSheet.tsx');
  const details = read('src/components/ThemeDetailsSheet.tsx');

  // The shop grid card and the Theme Details hero are the two places a solid
  // theme is drawn as a mock screen with the app's name on it.
  assert.match(shop, /<Text style=\{\[styles\.cardWordPing, \{ color: item\.previewAccent \}\]\}>\{t\('app_name'\)\}<\/Text>/u);
  assert.match(details, /<Text style=\{\[s\.heroCardWordPing, \{ color: displayItem\.previewAccent \}\]\}>\{t\('app_name'\)\}<\/Text>/u);

  // Resolved through the active-language translator, not a fixed dictionary.
  assert.match(shop, /const t = useLang\(\);/u);
  assert.match(details, /const t = useLang\(\);/u);

  // And neither file spells the brand out in JSX, which is what made every
  // language show the English name.
  for (const [path, source] of [['KisekaeShopSheet.tsx', shop], ['ThemeDetailsSheet.tsx', details]]) {
    assert.doesNotMatch(source, /['"`>]WordCore['"`<]/u, `${path} must not hardcode the brand name`);
  }
});

test('every locale carries its own brand copy, transliterated where the script differs', () => {
  const brand = values('app_name');
  assert.equal(brand.length, LOCALE_COUNT, 'app_name needs one entry per locale');

  // The eight non-Latin locales each render the name in their own script — the
  // check that would fail if one of them were left as the English spelling.
  const transliterated = {
    ja: 'ワードコア',
    ko: '워드코어',
    'zh-CN': '沃德科尔',
    ru: 'ВордКор',
    ar: 'وورد كور',
    hi: 'वर्डकोर',
    th: 'เวิร์ดคอร์',
    el: 'ΓουόρντΚορ',
  };
  for (const [locale, name] of Object.entries(transliterated)) {
    assert.ok(brand.includes(name), `${locale} must render the brand as ${name}`);
  }

  // The remaining twelve are Latin-script languages that keep the Latin
  // spelling. That is an explicit entry, not a fallback: each dictionary is a
  // full Record, so there is nowhere for a missing key to fall back *to*.
  assert.equal(
    brand.filter(value => value === 'WordCore').length,
    LOCALE_COUNT - Object.keys(transliterated).length,
  );
  assert.match(i18n, /type Dict = Record<TranslationKey, string>;/u);
});

test('nothing about the themes themselves moved', () => {
  const shop = read('src/components/KisekaeShopSheet.tsx');
  // Ids, images and the free pair are what ownership and persistence are keyed
  // on; renaming the drawn label must never reach them.
  assert.match(shop, /const FREE_TAB_IDS = new Set\(\['solid_blue', 'solid_gray'\]\);/u);
  assert.match(shop, /\{ id: 'solid_blue',   name: 'Blue', nameKey: 'theme_name_blue', price: 0, category: 'solid'/u);
  const previews = read('src/components/ThemeSkinPreview.tsx');
  assert.match(previews, /solid_blue: +require\('\.\.\/\.\.\/screenshots\/theme\/blue\/blue1\.png'\),/u);
});

// ── 4. The Japanese name of Natural AI Voice ─────────────────────────────────

/**
 * One spelling for one product name.
 *
 * The Japanese dictionary had grown three: `自然なAI音声`, `ナチュラルAI音声`
 * and `ナチュラルAIボイス`, sometimes two of them inside the same string. The
 * feature is `ナチュラルAI音声`.
 *
 * The awkward part is that `自然な` is also an ordinary Japanese adjective, and
 * this file legitimately says `自然な発音`, `自然な例文` and `自然な音声` about
 * things that are not the product. So the rule is not "never say 自然な" — it is
 * "never say 自然な immediately before AI音声 or AIボイス".
 */

/** The Japanese dictionary alone, so a match cannot come from another locale. */
const japanese = i18n.slice(
  i18n.indexOf('const ja: Dict = {'),
  i18n.indexOf('const ko: Dict = {'),
);

test('the Japanese dictionary is where these assertions are measured', () => {
  assert.ok(japanese.length > 1000);
  assert.ok(japanese.includes('app_name:'), 'the slice should be a whole dictionary');
});

test('no Japanese copy calls the feature 自然なAI音声, in any spacing', () => {
  // Half-width space, full-width space, or none; 音声 or ボイス.
  const retired = /自然な[ 　]*AI[ 　]*(?:音声|ボイス)/gu;
  const hits = japanese.match(retired) ?? [];
  assert.deepEqual(hits, [], 'these are the retired product name');
});

test('every mention of the product name is ナチュラルAI音声', () => {
  // `ナチュラル` introduces the product name and nothing else, so anything that
  // follows it must be the one spelling.
  const named = japanese.match(/ナチュラル[^、。」』\s']{0,10}/gu) ?? [];
  assert.ok(named.length >= 5, `expected several mentions, found ${named.length}`);
  for (const mention of named) {
    assert.ok(
      mention.startsWith('ナチュラルAI音声'),
      `unexpected spelling of the product name: ${mention}`,
    );
  }
  // The four surfaces that name it outright.
  assert.ok(japanese.includes("feature_ai_voice: 'ナチュラルAI音声',"));
  assert.ok(japanese.includes("voice_pick_info_title: 'ナチュラルAI音声',"));
  assert.ok(japanese.includes('ナチュラルAI音声．AIツール'));
  assert.ok(japanese.includes('すべてのカードをナチュラルAI音声で読み上げます。'));
});

test('ordinary Japanese uses of 自然な are left alone', () => {
  // "natural pronunciation", "natural example sentences", "natural speech" —
  // none of these is the product, and a blanket find-and-replace would have
  // broken all three.
  for (const phrase of ['より自然な発音', '自然な例文', '自然な音声に変換', '自然な音声をつくる']) {
    assert.ok(japanese.includes(phrase), `${phrase} should survive the rename`);
  }
});

test('the rename touched Japanese only, and no key or identifier', () => {
  // Every other locale keeps its own wording; none gains a Japanese string.
  const others = i18n.slice(i18n.indexOf('const ko: Dict = {'));
  assert.doesNotMatch(others, /ナチュラルAI音声|自然なAI音声/u);
  const english = i18n.slice(i18n.indexOf('const enUS: Dict = {'), i18n.indexOf('const ja: Dict = {'));
  assert.match(english, /feature_ai_voice: 'Natural AI Voice',/u);

  // Key names are untouched: the five that changed still exist under the same
  // keys, in every locale. Counted as declarations rather than parsed values —
  // `voice_credits_body` is a multi-line concatenation in English and Japanese,
  // which `values()` deliberately does not try to read.
  for (const key of ['feature_ai_voice', 'ai_voice_desc', 'plan_hero_subtitle', 'tts_info_body', 'voice_credits_body']) {
    // The TranslationKey union writes `'key'` without a colon, so this counts
    // dictionary entries alone.
    const declarations = i18n.match(new RegExp(`(?:^|[ ,])${key}:`, 'gmu')) ?? [];
    assert.equal(declarations.length, LOCALE_COUNT, `${key} needs one entry per locale`);
  }
});
