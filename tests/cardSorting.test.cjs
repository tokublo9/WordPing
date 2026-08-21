const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(path) {
  const source = fs.readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const {
  getCardRating,
  mergeVisibleCardOrder,
  nextRegistrationTimestamp,
  shuffleCards,
  sortByRating,
  sortByRegistrationOrder,
} = loadTypeScriptModule('src/features/cards/cardSorting.ts');
const { SUPPORTED_LANGUAGES, translate } = loadTypeScriptModule('src/i18n.ts');

const REGISTRATION_LABELS = {
  'en-US': 'Registration order',
  ja: '登録順',
  ko: '등록 순서',
  'zh-CN': '添加顺序',
  es: 'Orden de registro',
  fr: 'Ordre d’ajout',
  de: 'Eingabereihenfolge',
  it: 'Ordine di inserimento',
  'pt-BR': 'Ordem de cadastro',
  ru: 'Порядок добавления',
  ar: 'ترتيب الإضافة',
  hi: 'जोड़ने का क्रम',
  tr: 'Eklenme sırası',
  nl: 'Volgorde van toevoegen',
  vi: 'Thứ tự thêm',
  th: 'ลำดับที่เพิ่ม',
  id: 'Urutan penambahan',
  pl: 'Kolejność dodania',
  el: 'Σειρά προσθήκης',
  sv: 'Tilläggsordning',
};

test('every supported locale has localized reorder preset labels', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, Object.keys(REGISTRATION_LABELS).length);
  for (const { code } of SUPPORTED_LANGUAGES) {
    const label = translate(code, 'reorder_registration_order');
    const randomLabel = translate(code, 'reorder_random');
    assert.equal(label, REGISTRATION_LABELS[code], code);
    assert.notEqual(randomLabel, 'reorder_random', code);
    assert.ok(randomLabel.trim().length > 0, code);
    assert.doesNotMatch(
      label,
      /reset|original|やり直し|元の順序|원래 순서|原始顺序|оригинал|الأصلي|मूल|orijinal|origineel|ต้นฉบับ|asli|oryginal|αρχικό/iu,
      code,
    );
  }
  assert.equal(translate('en-US', 'reorder_random'), 'Random');
  assert.equal(translate('ja', 'reorder_random'), 'ランダム');
});

test('Registration Order sorts earliest createdAt first and latest last without mutating input', () => {
  const displayed = [
    { id: 'latest', createdAt: 300 },
    { id: 'earliest', createdAt: 100 },
    { id: 'middle', createdAt: 200 },
  ];
  assert.deepEqual(sortByRegistrationOrder(displayed).map(card => card.id), [
    'earliest', 'middle', 'latest',
  ]);
  assert.deepEqual(displayed.map(card => card.id), ['latest', 'earliest', 'middle']);
});

test('Random returns a changed permutation without mutating the pending order', () => {
  const pending = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const shuffled = shuffleCards(pending, () => 0.25);
  assert.deepEqual([...shuffled].map(card => card.id).sort(), ['a', 'b', 'c', 'd']);
  assert.notDeepEqual(shuffled.map(card => card.id), pending.map(card => card.id));
  assert.deepEqual(pending.map(card => card.id), ['a', 'b', 'c', 'd']);
});

test('Random stays stable until invoked again, then creates a new pending order', () => {
  const original = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const firstPendingOrder = shuffleCards(original, () => 0.999999);
  const rerenderedOrder = firstPendingOrder;
  assert.deepEqual(rerenderedOrder.map(card => card.id), firstPendingOrder.map(card => card.id));

  const secondPendingOrder = shuffleCards(firstPendingOrder, () => 0.999999);
  assert.notDeepEqual(
    secondPendingOrder.map(card => card.id),
    firstPendingOrder.map(card => card.id),
  );
});

test('legacy cards without timestamps use a deterministic stable fallback independent of displayed order', () => {
  const firstDisplay = [{ id: 'legacy-c' }, { id: 'legacy-a' }, { id: 'legacy-b' }];
  const reopenedDisplay = [{ id: 'legacy-b' }, { id: 'legacy-c' }, { id: 'legacy-a' }];
  const expected = ['legacy-a', 'legacy-b', 'legacy-c'];
  assert.deepEqual(sortByRegistrationOrder(firstDisplay).map(card => card.id), expected);
  assert.deepEqual(sortByRegistrationOrder(reopenedDisplay).map(card => card.id), expected);

  const timestampIds = [
    { id: 'card-1700000000200-b' },
    { id: 'card-1700000000100-a' },
  ];
  assert.deepEqual(sortByRegistrationOrder(timestampIds).map(card => card.id), [
    'card-1700000000100-a', 'card-1700000000200-b',
  ]);
});

test('new registration timestamps remain monotonic during rapid registrations', () => {
  const cards = [{ id: 'a', createdAt: 1000 }, { id: 'b', createdAt: 1001 }];
  assert.equal(nextRegistrationTimestamp(cards, 1000), 1002);
  assert.equal(nextRegistrationTimestamp([], 500), 500);
});

test('Lowest First puts rated cards low-to-high and all unrated variants at the bottom', () => {
  const cards = [
    { id: 'rating-3', createdAt: 1, rating: 3 },
    { id: 'missing', createdAt: 2 },
    { id: 'rating-1', createdAt: 3, rating: 1 },
    { id: 'rating-2', createdAt: 4, rating: 2 },
    { id: 'null', createdAt: 5, rating: null },
    { id: 'empty', createdAt: 6, testLevel: '' },
    { id: 'none', createdAt: 7, testLevel: 'none' },
  ];
  assert.deepEqual(sortByRating(cards, 'lowest').map(card => card.id), [
    'rating-1', 'rating-2', 'rating-3', 'missing', 'null', 'empty', 'none',
  ]);
});

test('categorical Lowest First follows unknown, slightly, good, perfect and preserves registration ties', () => {
  const cards = [
    { id: 'good-later', createdAt: 5, testLevel: 'good' },
    { id: 'perfect', createdAt: 2, testLevel: 'perfect' },
    { id: 'unknown', createdAt: 4, testLevel: 'unknown' },
    { id: 'good-earlier', createdAt: 3, testLevel: 'good' },
    { id: 'slightly', createdAt: 1, testLevel: 'slightly' },
  ];
  assert.deepEqual(sortByRating(cards, 'lowest').map(card => card.id), [
    'unknown', 'slightly', 'good-earlier', 'good-later', 'perfect',
  ]);
});

test('numeric rating zero is rated and sorts before positive ratings', () => {
  const zero = { id: 'zero', createdAt: 2, rating: 0 };
  assert.equal(getCardRating(zero), 0);
  assert.deepEqual(sortByRating([
    { id: 'unrated', createdAt: 1 },
    { id: 'one', createdAt: 3, rating: 1 },
    zero,
  ], 'lowest').map(card => card.id), ['zero', 'one', 'unrated']);
});

test('Highest First retains its existing rated order and leaves unrated cards last', () => {
  const cards = [
    { id: 'unrated', createdAt: 1 },
    { id: 'unknown', createdAt: 2, testLevel: 'unknown' },
    { id: 'perfect', createdAt: 3, testLevel: 'perfect' },
    { id: 'good', createdAt: 4, testLevel: 'good' },
  ];
  assert.deepEqual(sortByRating(cards, 'highest').map(card => card.id), [
    'perfect', 'good', 'unknown', 'unrated',
  ]);
});

test('filtered drag-and-drop preserves hidden slots and saved custom order', () => {
  const all = [
    { id: 'hidden-a' },
    { id: 'visible-a' },
    { id: 'hidden-b' },
    { id: 'visible-b' },
  ];
  const merged = mergeVisibleCardOrder(all, [all[3], all[1]]);
  assert.deepEqual(merged.map(card => card.id), [
    'hidden-a', 'visible-b', 'hidden-b', 'visible-a',
  ]);
});

test('reopening reorder mode does not redefine registration order from saved drag order', () => {
  const savedDragOrder = [
    { id: 'third', createdAt: 3 },
    { id: 'first', createdAt: 1 },
    { id: 'second', createdAt: 2 },
  ];
  assert.deepEqual(sortByRegistrationOrder(savedDragOrder).map(card => card.id), [
    'first', 'second', 'third',
  ]);
});
