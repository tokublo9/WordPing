import { useColorScheme } from 'react-native';
import type { Appearance, Palette, ThemeSkin } from '../../types';
import { DARK, FREE_SKIN_IDS, LIGHT, SKINS } from '../../constants';

export interface UseThemeControllerParams {
  skinId: string | null;
  themeColor: string;
  appearance: Appearance;
  isSubscribed: boolean;
}

export interface UseThemeControllerReturn {
  activeSkin: ThemeSkin | null;
  isSolidSkin: boolean;
  isDark: boolean;
  pal: Palette;
  activeThemeColor: string;
}

export function useThemeController({
  skinId,
  themeColor,
  appearance,
  isSubscribed,
}: UseThemeControllerParams): UseThemeControllerReturn {
  const systemScheme = useColorScheme();

  // Free users may activate solid_blue and solid_gray; all other skins require a subscription.
  const activeSkin: ThemeSkin | null =
    SKINS.find(s => s.id === skinId && (isSubscribed || FREE_SKIN_IDS.has(s.id))) ?? null;

  // Solid-color skins are simple color themes — the user's Appearance (Light/Dark/System) still
  // applies. Only premium image/wallpaper skins force their own fixed palette and dark-bar setting.
  const isSolidSkin = !!activeSkin?.id.startsWith('solid_');

  const isDark = (activeSkin && !isSolidSkin)
    ? activeSkin.darkStatusBar
    : appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';

  const pal: Palette = (activeSkin && !isSolidSkin) ? activeSkin.palette : isDark ? DARK : LIGHT;

  const activeThemeColor = activeSkin ? activeSkin.themeColor : themeColor;

  return { activeSkin, isSolidSkin, isDark, pal, activeThemeColor };
}
