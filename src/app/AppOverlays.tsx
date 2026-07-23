import { Animated } from 'react-native';
import type { ThemeSkin } from '../types';
import { SkinPatternOverlay } from '../components/SkinPatternOverlay';
import { SkinWallpaperOverlay } from '../components/SkinWallpaperOverlay';
import { DeepSeaOverlay } from '../components/DeepSeaOverlay';
import {
  AnimalOverlay,
  AuroraOverlay,
  BeautifulWoodsOverlay,
  CyberNeonOverlay,
  GalaxyOverlay,
  RainyWindowOverlay,
} from '../components/SkinOverlays';

export interface AppOverlaysProps {
  activeSkin: ThemeSkin | null;
  scrollY: Animated.Value;
}

export function AppOverlays({ activeSkin, scrollY }: AppOverlaysProps) {
  if (!activeSkin) return null;
  return (
    <>
      {activeSkin.patternType && (
        <SkinPatternOverlay patternType={activeSkin.patternType} />
      )}
      {activeSkin.wallpaperImage && (
        <SkinWallpaperOverlay
          image={activeSkin.wallpaperImage}
          blurIntensity={activeSkin.wallpaperBlur}
          overlayColor={activeSkin.wallpaperOverlayColor}
        />
      )}
      {activeSkin.id === 'skin_deep_sea'  && <DeepSeaOverlay scrollY={scrollY} />}
      {activeSkin.id === 'shop_woods'     && <BeautifulWoodsOverlay />}
      {activeSkin.id === 'skin_galaxy'    && <GalaxyOverlay />}
      {activeSkin.id === 'skin_cyber'     && <CyberNeonOverlay />}
      {activeSkin.id === 'skin_aurora'    && <AuroraOverlay />}
      {activeSkin.id === 'skin_rain'      && <RainyWindowOverlay />}
      {activeSkin.id === 'skin_paw'       && <AnimalOverlay />}
    </>
  );
}
