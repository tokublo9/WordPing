import { useColorScheme } from 'react-native';
import type { Appearance, Palette, ThemeSkin } from '../../types';
import { DARK, FREE_SKIN_IDS, LIGHT, SKINS } from '../../constants';
import { isThemeUnlocked } from './themeAccess';
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
  /**
   * The temporary Simulator recording override, already resolved against
   * `__DEV__` — see `src/dev/themeAccessOverride.ts`.
   *
   * This hook is where a theme stops being a stored id and becomes an actual
   * wallpaper, palette and colour, so it is the gate that decides whether the
   * override is visible at all. Without it the shop unlocked every theme and
   * this resolved `activeSkin` to null a moment later, which is exactly what
   * "the theme does not apply" looked like. Absent means off.
   */
  devUnlockOverride?: boolean;
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
  devUnlockOverride = false,
}: UseThemeControllerParams): UseThemeControllerReturn {
  const systemScheme = useColorScheme();

  /**
   * The one access rule, not a third copy of it.
   *
   * Free users may activate solid_blue and solid_gray; every other skin needs a
   * subscription or an outright purchase of that specific theme — and buying
   * one has to keep working after a subscription lapses, which is why ownership
   * is its own term. That is `resolveThemeAccess`, the same rule the shop and
   * the price display already answer with, so a theme cannot be unlocked in the
   * shop and refused here.
   *
   * `isSubscriptionLoaded: true` because there is no separate loading state at
   * this layer: the caller has already resolved `isSubscribed`, and it is false
   * until RevenueCat answers. `price` is the skin's own free/paid flag, which
   * for a skin is membership of `FREE_SKIN_IDS`.
   */
  const activeSkin: ThemeSkin | null = SKINS.find(s => s.id === skinId && isThemeUnlocked({
    price: FREE_SKIN_IDS.has(s.id) ? 0 : 1,
    isSubscribed,
    isSubscriptionLoaded: true,
    ownedIndividually: ownedEntitlementIds !== undefined
      && isThemeOwnedIndividually(s.id, ownedEntitlementIds),
    devUnlockOverride,
  })) ?? null;

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
