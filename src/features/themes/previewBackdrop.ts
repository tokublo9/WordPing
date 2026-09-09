/**
 * What the fullscreen theme preview is shown against.
 *
 * The viewer fills the screen behind a preview and has always been black. That
 * works for a light theme, whose screenshot reads as a bright rectangle on a
 * dark field — but a dark theme's preview has nowhere to end. Aurora, Galaxy,
 * Deep Sea, Cyber Neon, Night City, Rainy Window and Beautiful Woods all bleed
 * into the backdrop and the user cannot see where the phone screen they are
 * looking at stops.
 *
 * Those seven get white instead. It is a fixed list of theme ids, decided here
 * once, for three reasons:
 *
 *  - It is a property of the artwork, so it belongs beside the theme metadata
 *    rather than being re-derived at every place the viewer draws something.
 *  - Sampling the image would make the backdrop depend on which frame decoded
 *    first, and would differ between the still and the video for the same theme.
 *  - Ids, never display names: "Rainy Window" is `skin_rain`, and its localized
 *    name is a different string in each of twenty languages.
 *
 * The controls move with it. A white close glyph on a white field is an
 * invisible control, so the tint and the button's own backing are part of the
 * same answer and come from the same call.
 *
 * Pure — no react-native import — so the mapping is unit-tested directly.
 */

/** Theme ids whose previews are too dark to sit on black. */
export const LIGHT_BACKDROP_THEME_IDS: ReadonlySet<string> = new Set([
  'skin_aurora',      // Aurora
  'skin_galaxy',      // Galaxy
  'skin_deep_sea',    // Deep Sea
  'skin_cyber',       // Cyber Neon
  'skin_night_city',  // Night City
  'skin_rain',        // Rainy Window
  'shop_woods',       // Beautiful Woods
]);

export interface PreviewBackdrop {
  /** Fills the viewer behind both pages. */
  background: string;
  /** Close glyph, and anything else drawn directly on the backdrop. */
  controlTint: string;
  /** The close button's own disc, so it reads as a control either way. */
  controlBackground: string;
}

/** The long-standing look: a bright preview floating on black. */
const DARK_BACKDROP: PreviewBackdrop = {
  background: '#000',
  controlTint: '#fff',
  controlBackground: 'rgba(255,255,255,0.18)',
};

/** For the dark themes: the preview's own edges become visible again. */
const LIGHT_BACKDROP: PreviewBackdrop = {
  background: '#FFF',
  // Near-black rather than pure black, matching the app's own dark text, and
  // comfortably past the 4.5:1 contrast a control needs against white.
  controlTint: '#111827',
  controlBackground: 'rgba(17,24,39,0.12)',
};

/**
 * The backdrop for one theme's fullscreen preview.
 *
 * Both pages of a theme get the same answer — it is keyed on the theme, not on
 * which screen is being shown — so swiping between List View and Test View
 * cannot change the background under them. An unknown or absent id keeps the
 * existing black, which is what every theme outside the six gets.
 */
export function resolvePreviewBackdrop(themeId: string | null | undefined): PreviewBackdrop {
  return themeId != null && LIGHT_BACKDROP_THEME_IDS.has(themeId)
    ? LIGHT_BACKDROP
    : DARK_BACKDROP;
}

/** Whether this theme's preview is shown on white. For tests and assertions. */
export function usesLightPreviewBackdrop(themeId: string | null | undefined): boolean {
  return resolvePreviewBackdrop(themeId).background === LIGHT_BACKDROP.background;
}
