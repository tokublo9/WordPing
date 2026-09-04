import { useColorScheme } from 'react-native';
import type { Appearance, Palette, ThemeSkin } from '../../types';
import { DARK, FREE_SKIN_IDS, LIGHT, SKINS } from '../../constants';
import { isThemeOwnedIndividually } from './themeProducts';

export interface UseThemeControllerParams {
  skinId: string | null;
  themeColor: string;
  appearance: Appearance;
  isSubscribed: boolean;
  /**
   * Entitlement ids currently active on this account.
   *
   * A theme bought individually stays active without a subscription, so this
   * is what makes that access permanent rather than merely purchasable.
   * Optional: absent means nothing is owned, the behaviour before themes could
   * be bought.
   */
  ownedEntitlementIds?: ReadonlySet<string>;
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
  ownedEntitlementIds,
}: UseThemeControllerParams): UseThemeControllerReturn {
  const systemScheme = useColorScheme();

  // Free users may activate solid_blue and solid_gray. Every other skin needs
  // either a subscription or an outright purchase of that specific theme —
  // without the second clause, buying a theme would stop working the moment a
  // subscription lapsed, which is the opposite of what buying one means.
  const activeSkin: ThemeSkin | null = SKINS.find(s => s.id === skinId && (
    isSubscribed
    || FREE_SKIN_IDS.has(s.id)
    || (ownedEntitlementIds !== undefined && isThemeOwnedIndividually(s.id, ownedEntitlementIds))
  )) ?? null;

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
