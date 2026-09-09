import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIGHT_BACKDROP_THEME_IDS,
  resolvePreviewBackdrop,
  usesLightPreviewBackdrop,
} from '../../src/features/themes/previewBackdrop';

/**
 * Seven dark themes whose fullscreen preview would otherwise have no visible edge.
 *
 * Keyed on internal ids, never on the display name — "Rainy Window" is
 * `skin_rain`, and every name is a different string in each of twenty locales.
 */

const DARK_THEMES = [
  'skin_aurora',
  'skin_galaxy',
  'skin_deep_sea',
  'skin_cyber',
  'skin_night_city',
  'skin_rain',
  'shop_woods',
] as const;

test('exactly the seven named themes are on the light backdrop list', () => {
  assert.deepEqual([...LIGHT_BACKDROP_THEME_IDS].sort(), [...DARK_THEMES].sort());
  assert.equal(LIGHT_BACKDROP_THEME_IDS.size, 7);
});

test('each of the seven resolves to a white backdrop', () => {
  for (const id of DARK_THEMES) {
    assert.equal(resolvePreviewBackdrop(id).background, '#FFF', id);
    assert.equal(usesLightPreviewBackdrop(id), true, id);
  }
});

test('every other theme keeps the existing black backdrop', () => {
  const others = [
    'solid_blue', 'solid_gray', 'solid_green', 'solid_pink', 'solid_purple', 'solid_sky',
    'solid_mint', 'solid_red', 'solid_orange', 'solid_yellow', 'solid_beige', 'solid_teal',
    'skin_leaf_blur', 'skin_sakura', 'skin_snow', 'shop_roses', 'skin_paw', 'skin_sunset',
  ];
  for (const id of others) {
    assert.equal(resolvePreviewBackdrop(id).background, '#000', id);
    assert.equal(usesLightPreviewBackdrop(id), false, id);
  }
  // An unknown, deleted or absent id falls back to the existing look.
  for (const id of ['not_a_theme', '', null, undefined]) {
    assert.equal(resolvePreviewBackdrop(id).background, '#000', String(id));
  }
});

test('a theme gets one backdrop, so both preview pages match', () => {
  // The rule takes only the theme id: there is no page argument it could
  // differ on, which is what makes List View and Test View agree by
  // construction rather than by two call sites happening to pass the same
  // thing.
  assert.equal(resolvePreviewBackdrop.length, 1);
  for (const id of [...DARK_THEMES, 'solid_blue']) {
    assert.deepEqual(resolvePreviewBackdrop(id), resolvePreviewBackdrop(id));
  }
});

test('the close control stays legible on whichever backdrop it lands on', () => {
  // Contrast of the glyph against the field behind it, by WCAG relative
  // luminance. A control the user cannot find is the failure mode of changing
  // the background at all.
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = (hex: string) => {
    const full = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
    const [r, g, b] = [1, 3, 5].map(i => channel(parseInt(full.slice(i, i + 2), 16) / 255));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  for (const id of ['skin_aurora', 'solid_blue']) {
    const backdrop = resolvePreviewBackdrop(id);
    assert.ok(
      contrast(backdrop.controlTint, backdrop.background) >= 4.5,
      `${id}: close glyph must reach 4.5:1 against its backdrop`,
    );
    // And the button's own disc is tinted for that field rather than fixed.
    assert.notEqual(backdrop.controlBackground, backdrop.background);
  }
  // The two answers are genuinely different, not the same object twice.
  assert.notEqual(
    resolvePreviewBackdrop('skin_aurora').controlTint,
    resolvePreviewBackdrop('solid_blue').controlTint,
  );
});
