import assert from 'node:assert/strict';

const origin = process.argv[2] ?? 'http://localhost:4317';
const routes = [
  ['/', 'WordCore — Vocabulary study that stays with you'],
  ['/ja', 'WordCore — そばに置ける単語学習'],
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms of Service'],
  ['/licenses', 'Open Source Licences'],
  ['/commercial-transactions', 'Commercial Disclosure under Japan’s Specified Commercial Transactions Act'],
  ['/ja/privacy', 'プライバシーポリシー'],
  ['/ja/terms', '利用規約'],
  ['/ja/licenses', 'オープンソースライセンス'],
  ['/ja/commercial-transactions', '特定商取引法に基づく表記'],
];

const pages = new Map();
for (const [route, expected] of routes) {
  const response = await fetch(`${origin}${route}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'Twitterbot' },
  });
  assert.equal(response.status, 200, `${route} returned ${response.status}`);
  const html = await response.text();
  assert.ok(html.includes(expected), `${route} did not render ${expected}`);
  pages.set(route, html);
  console.log(`${route}: 200`);
}

const english = pages.get('/');
assert.match(english, /10 card fronts/u);
assert.match(english, /Backup &amp; Restore/u);
assert.match(english, /Priority Support/u);
assert.match(english, /href="\/privacy"/u);
assert.match(english, /href="\/terms"/u);
assert.match(english, /href="\/licenses"/u);
assert.match(english, /rel="canonical" href="https:\/\/word-ping-chi\.vercel\.app"/u);
assert.match(english, /hrefLang="ja" href="https:\/\/word-ping-chi\.vercel\.app\/ja"/u);
assert.doesNotMatch(english, /AI Add Word|AI Meaning|AI Translation|AI Breakdown|AI Example|Text-to-Speech|Google Play/u);

const japanese = pages.get('/ja');
assert.match(japanese, /カード表面10枚分/u);
assert.match(japanese, /href="\/ja\/privacy"/u);
assert.match(japanese, /href="\/ja\/terms"/u);
assert.match(japanese, /href="\/ja\/licenses"/u);
assert.match(japanese, /rel="canonical" href="https:\/\/word-ping-chi\.vercel\.app\/ja"/u);

console.log('Local production route and marketing-content checks passed.');
