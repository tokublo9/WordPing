const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

/**
 * Every theme asset the bundler is told to include must exist.
 *
 * `require()` of an image is resolved statically by Metro, so a path that no
 * longer exists is not a missing picture — it is a build that does not start.
 * That is exactly what happened when the generated `*-poster.jpg` files were
 * replaced by hand-edited PNGs and the registry still pointed at the old names,
 * and nothing in the suite noticed because no test had ever looked at the file
 * system. This one does.
 */

const REGISTRY = 'src/components/ThemeSkinPreview.tsx';
const registry = read(REGISTRY);
/** The registry with comments stripped, for assertions about code alone. */
const registryCode = registry
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/\/\/.*$/gmu, '');

/** Ids declared in one `Partial<Record<...>>` block of the registry. */
function mapIds(source) {
  return [...source.matchAll(/^ {2}(\w+): +require\(/gmu)].map(match => match[1]);
}

/** Asset specifiers inside one block. */
function specifiersIn(source) {
  return [...source.matchAll(/require\('(\.\.\/\.\.\/[^']+)'\)/gu)].map(match => match[1]);
}

/** One named map's text, from its declaration to its closing brace. */
function sliceMap(name) {
  const from = registry.indexOf(`export const ${name}:`);
  assert.ok(from > -1, `${name} should exist`);
  return registry.slice(from, registry.indexOf('\n};', from));
}

function resolveRef(specifier) {
  return path.normalize(path.join(path.dirname(REGISTRY), specifier));
}

/** Every static asset path in the registry, resolved relative to its module. */
function staticRequires() {
  return [...registry.matchAll(/require\('(\.\.\/\.\.\/[^']+)'\)/gu)]
    .map(match => ({
      specifier: match[1],
      file: path.normalize(path.join(path.dirname(REGISTRY), match[1])),
    }));
}

test('the theme registry is the only module that requires a theme asset', () => {
  // One place to audit. A second registry elsewhere would be a second place for
  // a stale path to hide.
  const sources = ['src/components/KisekaeShopSheet.tsx', 'src/components/ThemeDetailsSheet.tsx', 'src/components/ProSheet.tsx', 'App.tsx'];
  for (const file of sources) {
    assert.doesNotMatch(read(file), /require\('[^']*screenshots\/theme/u, `${file} must go through ${REGISTRY}`);
  }
});

test('every static theme require points at a file that exists', () => {
  const refs = staticRequires();
  assert.ok(refs.length > 0, 'the registry should still require assets');

  const missing = refs.filter(ref => !fs.existsSync(ref.file));
  assert.deepEqual(
    missing.map(ref => ref.specifier),
    [],
    'these requires would fail to bundle',
  );
});

test('no deleted asset path survives anywhere in runtime code', () => {
  // The specific casualties of the PNG swap. Named individually so a partial
  // revert is caught rather than averaged away.
  const gone = [
    'deepsea1-poster.jpg',
    'galaxy1-poster.jpg',
    'aurora1-poster.jpg',
    'cyberneon1-poster.jpg',
    'beautifulwoods1-poster.jpg',
    'rainywindow1-poster.jpg',
    'deepsea2.png',
  ];
  const runtime = ['src', 'App.tsx'];
  for (const name of gone) {
    for (const root of runtime) {
      const hits = [];
      (function walk(entry) {
        const stat = fs.statSync(entry);
        if (stat.isDirectory()) {
          for (const child of fs.readdirSync(entry)) walk(path.join(entry, child));
          return;
        }
        if (!/\.(ts|tsx)$/u.test(entry)) return;
        if (read(entry).includes(name)) hits.push(entry);
      })(root);
      assert.deepEqual(hits, [], `${name} is still referenced`);
    }
  }
});

test('every video theme still has a page-1 poster to show before playback', () => {
  // A video with no poster shows nothing until the first frame decodes, which
  // is the flash the posters exist to prevent. Page 2 needs none — see below.
  const videos = registry.slice(
    registry.indexOf('export const THEME_VIDEOS:'),
    registry.indexOf('export const THEME_VIDEO_POSTERS:'),
  );
  const posters = registry.slice(
    registry.indexOf('export const THEME_VIDEO_POSTERS:'),
    registry.indexOf('export const THEME_VIDEOS_TEST:'),
  );

  const videoIds = mapIds(videos);
  assert.equal(videoIds.length, 6);
  assert.deepEqual(mapIds(posters).sort(), [...videoIds].sort(), 'every video theme needs exactly one poster');

  for (const ref of staticRequires()) {
    if (!posters.includes(ref.specifier)) continue;
    assert.match(ref.specifier, /1\.png$/u, `${ref.specifier} should be the page-1 edited PNG`);
  }
});

test('animated themes use *1.mov for page 1 and *2.mov for page 2', () => {
  const videos = registry.slice(
    registry.indexOf('export const THEME_VIDEOS:'),
    registry.indexOf('export const THEME_VIDEO_POSTERS:'),
  );
  const testVideos = registry.slice(registry.indexOf('export const THEME_VIDEOS_TEST:'));

  assert.deepEqual(mapIds(videos).sort(), mapIds(testVideos).sort(), 'both pages cover the same six themes');
  for (const [source, suffix] of [[videos, '1.mov'], [testVideos, '2.mov']]) {
    for (const spec of specifiersIn(source)) {
      assert.ok(spec.endsWith(suffix), `${spec} should end in ${suffix}`);
      assert.ok(fs.existsSync(resolveRef(spec)), `${spec} does not exist`);
    }
  }
});

test('every theme with a page 1 also has a page 2, by still or by clip', () => {
  const page1 = new Set([...mapIds(sliceMap('THEME_SCREENSHOTS')), ...mapIds(sliceMap('THEME_VIDEOS'))]);
  const page2 = new Set([...mapIds(sliceMap('THEME_SCREENSHOTS_TEST')), ...mapIds(sliceMap('THEME_VIDEOS_TEST'))]);
  assert.ok(page1.size > 0);
  const withoutTestView = [...page1].filter(id => !page2.has(id));
  assert.deepEqual(withoutTestView, [], 'these themes would show a blank second page');
  // And nothing has a page 2 without a page 1.
  assert.deepEqual([...page2].filter(id => !page1.has(id)), []);
});

test('the six animated themes have no page-2 poster, and none is required', () => {
  // Documented, not silently worked around: `X2.png` exists for no animated
  // theme. Nothing points at one — the gallery and fullscreen video components
  // both take a source alone and stay hidden until the player is ready.
  const details = read('src/components/ThemeDetailsSheet.tsx');
  for (const folder of ['deepsea', 'galaxy', 'aurora', 'cyberneon', 'beautifulwoods', 'rainywindow']) {
    assert.equal(
      fs.existsSync(`screenshots/theme/${folder}/${folder === 'beautifulwoods' ? 'beautifulwoods' : folder}2.png`),
      false,
      `${folder}2.png is not expected to exist`,
    );
  }
  assert.doesNotMatch(registry, /THEME_VIDEO_POSTERS_TEST|2\.png'\),\s*\n\s*\};[\s\S]{0,80}POSTER/u);
  assert.doesNotMatch(details, /poster/iu, 'the gallery video components take no poster');
});

test('nothing calls page 2 Flip Mode, in code or on screen', () => {
  const details = read('src/components/ThemeDetailsSheet.tsx');
  const detailsCode = details
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/.*$/gmu, '');

  // The gallery key, the maps and the label are all Test View now.
  assert.doesNotMatch(detailsCode, /flipmode|FLIP/u);
  assert.doesNotMatch(registryCode, /THEME_SCREENSHOTS_FLIP|THEME_VIDEOS_FLIP/u);
  assert.match(detailsCode, /type GalleryScreen = 'wordlist' \| 'test';/u);
  assert.match(
    detailsCode,
    /\{ key: 'wordlist', labelKey: 'theme_preview_wordlist' \},\s*\{ key: 'test', labelKey: 'theme_preview_testmode' \},/u,
  );
  // `theme_preview_flipmode` ("Card View") is no longer rendered anywhere.
  assert.doesNotMatch(details, /theme_preview_flipmode/u);
  for (const file of ['src/components/KisekaeShopSheet.tsx', 'src/components/ProSheet.tsx', 'App.tsx']) {
    assert.doesNotMatch(read(file), /theme_preview_flipmode/u, `${file} must not label a preview Flip Mode`);
  }

  // The English-preview footnote is untouched.
  assert.match(details, /\{t\('theme_preview_english_note'\)\}/u);
});

test('both galleries have exactly two pages, and the pager respects RTL', () => {
  const details = read('src/components/ThemeDetailsSheet.tsx');

  // Inline gallery: two entries, Word List then Test.
  const screens = details.slice(details.indexOf('const GALLERY_SCREENS'), details.indexOf('// Renders a looping'));
  assert.equal((screens.match(/\{ key: '/gu) ?? []).length, 2);

  // Fullscreen: a real pager over a two-entry tuple, not a single page.
  // Two pages, the page the tap opened on, and the theme whose backdrop they
  // are drawn against.
  assert.match(details, /type ViewerState = \{\s*pages: \[FullscreenEntry, FullscreenEntry\];\s*startIndex: GalleryPageIndex;[\s\S]{0,220}themeId: string;\s*\} \| null;/u);
  assert.match(details, /pagingEnabled/u);
  assert.match(details, /\{pages\.map\(\(entry, i\) => \(/u);
  // Off-screen page is paused rather than left playing.
  assert.match(details, /active=\{open && activePage === i\}/u);

  // Offsets go through the RTL-aware helper, never a bare index multiply.
  assert.match(details, /galleryPageOffsetX\(viewerState\?\.startIndex \?\? 0, SCREEN_W, I18nManager\.isRTL, pageCount\)/u);
  assert.match(details, /galleryPageAtOffsetX\(e\.nativeEvent\.contentOffset\.x, SCREEN_W, I18nManager\.isRTL, pageCount\)/u);
  assert.doesNotMatch(details, /startIndex \* SCREEN_W/u);

  // Each page is labelled with the same localized name as its mini frame.
  assert.match(details, /accessibilityLabel=\{t\(i === 0 \? 'theme_preview_wordlist' : 'theme_preview_testmode'\)\}/u);
  assert.match(details, /accessibilityRole="button"\s*accessibilityLabel=\{label\}/u);
});

test('the Word List frame and the themes it covers are unchanged', () => {
  // Removing the second frame must not have touched the first, nor the ids and
  // ordering the shop and the details sheet are keyed on.
  const shots = sliceMap('THEME_SCREENSHOTS');
  const ids = [...shots.matchAll(/^ {2}(\w+): +require\(/gmu)].map(match => match[1]);
  assert.equal(ids.length, 20);
  assert.equal(ids[0], 'solid_blue');
  assert.equal(ids.at(-1), 'skin_sunset');
  assert.ok(ids.includes('skin_deep_sea'));

  // Deep Sea's Word List still points at the same edited PNG its poster uses.
  assert.match(shots, /skin_deep_sea: +require\('\.\.\/\.\.\/screenshots\/theme\/deepsea\/deepsea1\.png'\),/u);
  assert.match(registry, /skin_deep_sea: +require\('\.\.\/\.\.\/screenshots\/theme\/deepsea\/deepsea1\.png'\),[\s\S]*THEME_VIDEO_POSTERS/u);
});

// ── Fullscreen preview backdrop ──────────────────────────────────────────────

test('the backdrop is resolved once, from the helper, and never compared inline', () => {
  const details = read('src/components/ThemeDetailsSheet.tsx');
  const detailsCode = details
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/.*$/gmu, '');

  assert.match(details, /import \{ resolvePreviewBackdrop \} from '\.\.\/features\/themes\/previewBackdrop';/u);
  assert.match(detailsCode, /const backdrop {2}= resolvePreviewBackdrop\(viewerState\?\.themeId\);/u);
  // Exactly one call: the six ids are not spelled out anywhere in the JSX.
  assert.equal((detailsCode.match(/resolvePreviewBackdrop\(/gu) ?? []).length, 1);
  for (const id of ['skin_aurora', 'skin_galaxy', 'skin_deep_sea', 'skin_cyber', 'skin_night_city', 'skin_rain', 'shop_woods']) {
    assert.doesNotMatch(detailsCode, new RegExp(`'${id}'`, 'u'), `${id} must not be compared in the viewer`);
  }
  // And nothing samples the artwork to decide.
  assert.doesNotMatch(detailsCode, /getPixel|averageColor|luminance|ImageColors/iu);
});

test('the backdrop covers both pages and only the fullscreen viewer', () => {
  const details = read('src/components/ThemeDetailsSheet.tsx');

  // One field behind the pager, so both pages sit on the same colour — there is
  // no per-page background to disagree.
  assert.match(details, /<View style=\{\[fsStyles\.backdrop, \{ backgroundColor: backdrop\.background \}\]\}>/u);
  assert.equal((details.match(/backdrop\.background/gu) ?? []).length, 1);
  assert.match(details, /pages\.map\(\(entry, i\) => \(/u);

  // The theme id reaches the viewer through the one state object, so a still
  // and a `.mov` on either page are drawn against the same backdrop.
  assert.match(details, /themeId: displayItem\.id,/u);
  assert.match(details, /themeId: string;/u);

  // The details screen itself, the mini frames and the shop cards are untouched.
  assert.doesNotMatch(read('src/components/KisekaeShopSheet.tsx'), /resolvePreviewBackdrop|previewBackdrop/u);
  const miniStyles = details.slice(details.indexOf('const miniStyles = StyleSheet.create'));
  assert.doesNotMatch(miniStyles, /backdrop\./u, 'the inline gallery keeps its own look');
});

test('the close control is tinted for whichever backdrop is behind it', () => {
  const details = read('src/components/ThemeDetailsSheet.tsx');
  assert.match(
    details,
    /<View style=\{\[fsStyles\.closeBtn, \{ backgroundColor: backdrop\.controlBackground \}\]\}>\s*<Ionicons name="close" size=\{22\} color=\{backdrop\.controlTint\} \/>/u,
  );
  // No hardcoded white glyph left to vanish on a white field.
  assert.doesNotMatch(details, /name="close" size=\{22\} color="#fff"/u);

  // Safe areas and the tap-to-close regions are unchanged.
  assert.match(details, /style=\{\[fsStyles\.topBar, \{ paddingTop: insets\.top \}\]\}/u);
  assert.match(details, /const topBarH {3}= insets\.top \+ 48;/u);
  assert.match(details, /const bottomH {3}= insets\.bottom \+ 32;/u);
  assert.equal((details.match(/onPress=\{onClose\}/gu) ?? []).length, 2);
});

test('the backdrop change touched no asset path', () => {
  // The registry is the only place asset paths live, and this change never
  // reaches it. Existence of every one is asserted at the top of this file.
  assert.doesNotMatch(registry, /previewBackdrop|backdrop/u);
  const backdropRule = read('src/features/themes/previewBackdrop.ts');
  assert.doesNotMatch(backdropRule, /require\(|screenshots\/|\.png|\.mov/u);
});
