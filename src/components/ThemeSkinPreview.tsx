import { Dimensions, Image, ImageBackground, StyleSheet, View } from 'react-native';
import { memo } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import type { ThemeSkin } from '../types';
import type { TranslationKey } from '../i18n';

const { width: SCREEN_W } = Dimensions.get('window');

// ── ShopItem type ─────────────────────────────────────────────────────────────
// Defined here so both KisekaeShopSheet and ThemeDetailsSheet can import it
// without creating a circular dependency.

export interface ShopItem {
  id: string;
  name: string;
  nameKey: TranslationKey;
  price: number;
  category: 'solid' | 'premium';
  previewBg: string;
  previewAccent: string;
  previewEmoji: string;
}

// ── Static geometry data ──────────────────────────────────────────────────────
// Positions expressed as fractions of card W/H so they work at any size.

// [xFrac, yFrac, sizePx]
export const PV_GALAXY_STARS: [number, number, number][] = [
  [0.05,0.04,1.5],[0.14,0.11,1],[0.24,0.07,1.5],[0.36,0.17,1],[0.46,0.05,1.5],
  [0.56,0.13,1],[0.66,0.08,1.5],[0.76,0.19,1],[0.86,0.06,1.5],[0.93,0.14,1],
  [0.10,0.24,1.5],[0.30,0.29,1],[0.50,0.27,1.5],[0.72,0.31,1],[0.89,0.21,1.5],
  [0.08,0.44,1],[0.40,0.54,1],[0.66,0.47,1],
];
export const PV_GALAXY_GLOWS: { x: number; y: number; sz: number; color: string }[] = [
  { x: 0.15, y: 0.09, sz: 10, color: '#818CF8' },
  { x: 0.72, y: 0.19, sz: 8,  color: '#C084FC' },
  { x: 0.42, y: 0.34, sz: 7,  color: '#818CF8' },
  { x: 0.86, y: 0.07, sz: 6,  color: '#A5F3FC' },
  { x: 0.56, y: 0.14, sz: 5,  color: '#F0ABFC' },
];

export const PV_AURORA_BANDS: { topFrac: number; color: string; op: number; rot: string }[] = [
  { topFrac: 0.05, color: '#00FF9F', op: 0.20, rot: '3deg'  },
  { topFrac: 0.15, color: '#00D4E8', op: 0.16, rot: '-2deg' },
  { topFrac: 0.24, color: '#7B2FBE', op: 0.14, rot: '4deg'  },
  { topFrac: 0.10, color: '#4CC9F0', op: 0.12, rot: '-3deg' },
  { topFrac: 0.20, color: '#C77DFF', op: 0.11, rot: '2deg'  },
];

export const PV_CYBER_LINES: { yFrac: number; color: string; op: number }[] = [
  { yFrac: 0.20, color: '#00E5FF', op: 0.28 },
  { yFrac: 0.44, color: '#FF00FF', op: 0.22 },
  { yFrac: 0.64, color: '#00E5FF', op: 0.24 },
  { yFrac: 0.82, color: '#7B00FF', op: 0.20 },
];
export const PV_CYBER_DOTS: { x: number; y: number; sz: number; color: string }[] = [
  { x: 0.12, y: 0.17, sz: 3.5, color: '#00E5FF' },
  { x: 0.35, y: 0.41, sz: 2.5, color: '#FF00FF' },
  { x: 0.60, y: 0.27, sz: 4.0, color: '#00E5FF' },
  { x: 0.79, y: 0.61, sz: 2.5, color: '#7B00FF' },
  { x: 0.50, y: 0.73, sz: 3.0, color: '#FF00FF' },
  { x: 0.89, y: 0.34, sz: 2.5, color: '#00E5FF' },
  { x: 0.22, y: 0.57, sz: 3.5, color: '#7B00FF' },
];

export const PV_WOODS_RAYS = [0.22, 0.48, 0.70] as const;
export const PV_WOODS_MOTES: [number, number][] = [
  [0.12,0.62],[0.28,0.50],[0.44,0.72],[0.60,0.40],[0.75,0.66],[0.88,0.55],[0.34,0.80],
];

export const PV_RAIN_DROPS: { x: number; y: number; len: number }[] = [
  { x: 0.06, y: 0.10, len: 14 }, { x: 0.20, y: 0.32, len: 11 },
  { x: 0.34, y: 0.58, len: 16 }, { x: 0.48, y: 0.20, len: 12 },
  { x: 0.60, y: 0.50, len: 15 }, { x: 0.73, y: 0.08, len: 11 },
  { x: 0.83, y: 0.38, len: 16 }, { x: 0.91, y: 0.22, len: 12 },
  { x: 0.14, y: 0.70, len: 13 },
];

export const PV_DEEP_SEA_BUBBLES: { x: number; y: number; size: number; opacity: number }[] = [
  { x: 0.12, y: 0.18, size: 0.040, opacity: 0.72 },
  { x: 0.28, y: 0.34, size: 0.065, opacity: 0.48 },
  { x: 0.76, y: 0.14, size: 0.050, opacity: 0.62 },
  { x: 0.88, y: 0.42, size: 0.032, opacity: 0.76 },
  { x: 0.56, y: 0.52, size: 0.075, opacity: 0.42 },
  { x: 0.18, y: 0.64, size: 0.030, opacity: 0.68 },
  { x: 0.70, y: 0.72, size: 0.044, opacity: 0.58 },
  { x: 0.38, y: 0.82, size: 0.058, opacity: 0.46 },
  { x: 0.91, y: 0.88, size: 0.027, opacity: 0.72 },
];

export const PV_PAWS: { x: number; y: number; rot: number; s: number }[] = [
  { x: 0.70, y: 0.70, rot: 12,  s: 0.85 },
  { x: 0.80, y: 0.53, rot: -8,  s: 0.78 },
  { x: 0.72, y: 0.36, rot: 12,  s: 0.85 },
  { x: 0.82, y: 0.20, rot: -8,  s: 0.78 },
];
export const PV_PAW_COLOR = 'rgba(141,104,84,0.52)';

export const THEME_SCREENSHOTS: Partial<Record<string, number>> = {
  solid_blue:      require('../../screenshots/theme/blue/blue1.png'),
  solid_gray:      require('../../screenshots/theme/gray/gray1.png'),
  solid_green:     require('../../screenshots/theme/green/green1.png'),
  solid_pink:      require('../../screenshots/theme/pink/pink1.png'),
  solid_purple:    require('../../screenshots/theme/purple/purple1.png'),
  solid_sky:       require('../../screenshots/theme/skyblue/skyblue1.png'),
  solid_mint:      require('../../screenshots/theme/mint/mint1.png'),
  solid_red:       require('../../screenshots/theme/red/red1.png'),
  solid_orange:    require('../../screenshots/theme/orange/orange1.png'),
  solid_yellow:    require('../../screenshots/theme/yellow/yellow1.png'),
  solid_beige:     require('../../screenshots/theme/beige/beige1.png'),
  solid_teal:      require('../../screenshots/theme/teal/teal1.png'),
  skin_deep_sea:   require('../../screenshots/theme/deepsea/deepsea1.png'),
  skin_leaf_blur:  require('../../screenshots/theme/greennature/greennature1.png'),
  skin_sakura:     require('../../screenshots/theme/sakura/sakura1.png'),
  skin_snow:       require('../../screenshots/theme/snowmountain/snowmountain1.png'),
  shop_roses:      require('../../screenshots/theme/roses/roses1.png'),
  skin_coffee:     require('../../screenshots/theme/coffeehouse/coffeehouse1.png'),
  skin_paw:        require('../../screenshots/theme/animals/animals1.png'),
  skin_night_city: require('../../screenshots/theme/nightcity/nightcity1.png'),
  skin_sunset:     require('../../screenshots/theme/sunset/sunset1.png'),
};

export const THEME_SCREENSHOTS_FLIP: Partial<Record<string, number>> = {
  solid_blue:      require('../../screenshots/theme/blue/blue2.png'),
  solid_gray:      require('../../screenshots/theme/gray/gray2.png'),
  solid_green:     require('../../screenshots/theme/green/green2.png'),
  solid_pink:      require('../../screenshots/theme/pink/pink2.png'),
  solid_purple:    require('../../screenshots/theme/purple/purple2.png'),
  solid_sky:       require('../../screenshots/theme/skyblue/skyblue2.png'),
  solid_mint:      require('../../screenshots/theme/mint/mint2.png'),
  solid_red:       require('../../screenshots/theme/red/red2.png'),
  solid_orange:    require('../../screenshots/theme/orange/orange2.png'),
  solid_yellow:    require('../../screenshots/theme/yellow/yellow2.png'),
  solid_beige:     require('../../screenshots/theme/beige/beige2.png'),
  solid_teal:      require('../../screenshots/theme/teal/teal2.png'),
  skin_deep_sea:   require('../../screenshots/theme/deepsea/deepsea2.png'),
  skin_leaf_blur:  require('../../screenshots/theme/greennature/greennature2.png'),
  skin_sakura:     require('../../screenshots/theme/sakura/sakura2.png'),
  skin_snow:       require('../../screenshots/theme/snowmountain/snowmountain2.png'),
  shop_roses:      require('../../screenshots/theme/roses/roses2.png'),
  skin_coffee:     require('../../screenshots/theme/coffeehouse/coffeehouse2.png'),
  skin_paw:        require('../../screenshots/theme/animals/animals2.png'),
  skin_night_city: require('../../screenshots/theme/nightcity/nightcity2.png'),
  skin_sunset:     require('../../screenshots/theme/sunset/sunset2.png'),
};

// Video previews — only themes that ship .mov files appear here.
// Takes priority over the PNG screenshot maps in ThemeDetailsSheet.
export const THEME_VIDEOS: Partial<Record<string, number>> = {
  skin_deep_sea:  require('../../screenshots/theme/deepsea/deepsea1.mov'),
  skin_galaxy:    require('../../screenshots/theme/galaxy/galaxy1.mov'),
  skin_aurora:    require('../../screenshots/theme/aurora/aurora1.mov'),
  skin_cyber:     require('../../screenshots/theme/cyberneon/cyberneon1.mov'),
  shop_woods:     require('../../screenshots/theme/beautifulwoods/beautifulwoods1.mov'),
  skin_rain:      require('../../screenshots/theme/rainywindow/rainywindow1.mov'),
};

export const THEME_VIDEOS_FLIP: Partial<Record<string, number>> = {
  skin_deep_sea:  require('../../screenshots/theme/deepsea/deepsea2.mov'),
  skin_galaxy:    require('../../screenshots/theme/galaxy/galaxy2.mov'),
  skin_aurora:    require('../../screenshots/theme/aurora/aurora2.mov'),
  skin_cyber:     require('../../screenshots/theme/cyberneon/cyberneon2.mov'),
  shop_woods:     require('../../screenshots/theme/beautifulwoods/beautifulwoods2.mov'),
  skin_rain:      require('../../screenshots/theme/rainywindow/rainywindow2.mov'),
};

// ── PremiumSkinPreview ────────────────────────────────────────────────────────
// Static miniature that mirrors each premium skin's actual in-app appearance.
// Accepts explicit width/height so it can be used at any size (shop grid card,
// details hero, mini gallery frames, etc).

export const PremiumSkinPreview = memo(function PremiumSkinPreview({
  item, skinData, width, height, disableBlur = false,
}: {
  item: ShopItem;
  skinData: ThemeSkin | undefined;
  width: number;
  height: number;
  /** When true, skip the wallpaper blur overlay so the image reads clearly. */
  disableBlur?: boolean;
}) {
  const W = width;
  const H = height;
  const blurScale = Math.sqrt(W / SCREEN_W);

  // Wallpaper skins: image + blur + overlay — mirrors SkinWallpaperOverlay
  if (skinData?.wallpaperImage) {
    return (
      <>
        <ImageBackground source={skinData.wallpaperImage} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {!disableBlur && (skinData.wallpaperBlur ?? 0) > 0 && (
          <BlurView
            intensity={Math.round(skinData.wallpaperBlur! * blurScale)}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        {skinData.wallpaperOverlayColor ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: skinData.wallpaperOverlayColor }]} />
        ) : null}
      </>
    );
  }

  // Deep Sea: vertical gradient
  if (item.id === 'skin_deep_sea') {
    return (
      <>
        <LinearGradient
          colors={['#1585CC', '#0C5290', '#062A54', '#030F28', '#010610']}
          locations={[0, 0.28, 0.55, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {PV_DEEP_SEA_BUBBLES.map((bubble, i) => {
          const size = Math.max(3, bubble.size * W);
          return (
            <View
              key={`deep-sea-bubble-${i}`}
              style={{
                position: 'absolute',
                left: bubble.x * W - size / 2,
                top: bubble.y * H - size / 2,
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: Math.max(0.7, size * 0.12),
                borderColor: `rgba(255,255,255,${bubble.opacity})`,
                backgroundColor: `rgba(255,255,255,${bubble.opacity * 0.22})`,
              }}
            />
          );
        })}
      </>
    );
  }

  // Galaxy: dark bg + static stars + glow particles
  if (item.id === 'skin_galaxy') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#050714' }]} />
        {PV_GALAXY_GLOWS.map((g, i) => (
          <View key={`g${i}`} style={{
            position: 'absolute', left: g.x * W - g.sz / 2, top: g.y * H - g.sz / 2,
            width: g.sz, height: g.sz, borderRadius: g.sz / 2,
            backgroundColor: g.color, opacity: 0.20,
          }} />
        ))}
        {PV_GALAXY_STARS.map(([x, y, s], i) => (
          <View key={`s${i}`} style={{
            position: 'absolute', left: x * W, top: y * H,
            width: s, height: s, borderRadius: s / 2,
            backgroundColor: '#fff', opacity: 0.70,
          }} />
        ))}
      </>
    );
  }

  // Aurora: dark bg + coloured elliptical bands
  if (item.id === 'skin_aurora') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#07091A' }]} />
        {PV_AURORA_BANDS.map((b, i) => (
          <View key={i} style={{
            position: 'absolute', top: b.topFrac * H, left: -W * 0.25,
            width: W * 1.5, height: H * 0.16, borderRadius: H * 0.08,
            backgroundColor: b.color, opacity: b.op,
            transform: [{ rotate: b.rot }],
          }} />
        ))}
      </>
    );
  }

  // Cyber Neon: dark bg + diagonal beams from corners + floating particles
  if (item.id === 'skin_cyber') {
    // Compute beam geometry for this preview size (same math as SkinOverlays.tsx)
    const diag   = Math.sqrt((W / 2) ** 2 + (H / 2) ** 2);
    const beamL  = diag * 1.30;
    const corners: [number, number, string][] = [
      [0, 0, '#00E5FF'], [W, 0, '#FF00FF'],
      [0, H, '#7B00FF'], [W, H, '#00BFFF'],
    ];
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#040810' }]} />
        {corners.map(([x0, y0, color], i) => {
          const dx     = (W / 2 - x0) / diag;
          const dy     = (H / 2 - y0) / diag;
          const cx     = x0 + beamL / 2 * dx;
          const cy     = y0 + beamL / 2 * dy;
          const rotDeg = Math.atan2(dy, dx) * (180 / Math.PI) - 90;
          const rot    = `${rotDeg.toFixed(1)}deg`;
          return [
            // Soft glow
            <View key={`bg${i}`} style={{
              position: 'absolute', left: cx - 4, top: cy - beamL / 2,
              width: 8, height: beamL, backgroundColor: color, opacity: 0.14,
              transform: [{ rotate: rot }],
            }} />,
            // Core line
            <View key={`bl${i}`} style={{
              position: 'absolute', left: cx - 0.75, top: cy - beamL / 2,
              width: 1.5, height: beamL, backgroundColor: '#ffffff', opacity: 0.38,
              transform: [{ rotate: rot }],
            }} />,
          ];
        })}
        {PV_CYBER_DOTS.map((d, i) => (
          <View key={`d${i}`} style={{
            position: 'absolute', left: d.x * W, top: d.y * H,
            width: d.sz, height: d.sz, borderRadius: d.sz / 2,
            backgroundColor: d.color, opacity: 0.80,
          }} />
        ))}
      </>
    );
  }

  // Beautiful Woods: dark green bg + light rays + dust motes
  if (item.id === 'shop_woods') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0E1A0E' }]} />
        {PV_WOODS_RAYS.map((xFrac, i) => (
          <View key={i} style={{
            position: 'absolute', left: xFrac * W - 22, top: -H * 0.12,
            width: 44, height: H * 1.35, backgroundColor: '#FFE090',
            opacity: 0.06, transform: [{ rotate: '14deg' }],
          }} />
        ))}
        {PV_WOODS_MOTES.map(([x, y], i) => (
          <View key={`m${i}`} style={{
            position: 'absolute', left: x * W, top: y * H,
            width: 2, height: 2, borderRadius: 1,
            backgroundColor: '#E8D5B0', opacity: 0.15,
          }} />
        ))}
      </>
    );
  }

  // Rain: dark blue bg + thin diagonal raindrops
  if (item.id === 'skin_rain') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0D1520' }]} />
        {PV_RAIN_DROPS.map((d, i) => (
          <View key={i} style={{
            position: 'absolute', left: d.x * W, top: d.y * H,
            width: 1.5, height: d.len, borderRadius: 1,
            backgroundColor: '#B0D4F0', opacity: 0.28,
            transform: [{ rotate: '9deg' }],
          }} />
        ))}
      </>
    );
  }

  // Animal: warm bg + paw prints
  if (item.id === 'skin_paw') {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF8F0' }]} />
        {PV_PAWS.map(({ x, y, rot, s }, i) => (
          <View key={i} style={{
            position: 'absolute', left: x * W, top: y * H,
            transform: [{ rotate: `${rot}deg` }],
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 * s, marginBottom: 1.5 * s, justifyContent: 'center' }}>
              <View style={{ width: 4.5 * s, height: 4.5 * s, borderRadius: 2.5 * s, backgroundColor: PV_PAW_COLOR, marginBottom: 1.5 * s }} />
              <View style={{ width: 5 * s, height: 5.5 * s, borderRadius: 2.5 * s, backgroundColor: PV_PAW_COLOR }} />
              <View style={{ width: 5 * s, height: 5.5 * s, borderRadius: 2.5 * s, backgroundColor: PV_PAW_COLOR }} />
              <View style={{ width: 4.5 * s, height: 4.5 * s, borderRadius: 2.5 * s, backgroundColor: PV_PAW_COLOR, marginBottom: 1.5 * s }} />
            </View>
            <View style={{ width: 13 * s, height: 10 * s, borderRadius: 6.5 * s, backgroundColor: PV_PAW_COLOR, alignSelf: 'center' }} />
          </View>
        ))}
      </>
    );
  }

  // Fallback: solid palette bg
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: skinData?.palette.bg ?? item.previewBg }]} />;
});
