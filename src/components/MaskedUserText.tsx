import { View, type StyleProp, type ViewStyle } from 'react-native';
import { PostHogMaskView } from 'posthog-react-native';

interface Props {
  /**
   * Whether these children are the user's own content.
   *
   * False for the seeded tutorial cards, whose text is the app's and is the
   * same for everybody — see `features/cards/builtInCards.ts`.
   */
  masked: boolean;
  /**
   * Layout the wrapper must carry.
   *
   * Some call sites hand the wrapper the flex their `Text` used to own, so the
   * style has to survive both branches — which is why the unmasked branch is
   * still a `View` and not a bare fragment.
   */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Wraps user-authored text so Session Replay redacts it, and leaves app-authored
 * text legible.
 *
 * Both branches render one `View` with the same style and `collapsable={false}`,
 * so the native view tree and the layout are identical whichever way the flag
 * goes. Only the mask marker differs. Returning the children bare when unmasked
 * would have dropped the wrapper's style — and with it the flex handoff at the
 * three sites where the wrapper took the `Text`'s flex — so the built-in cards
 * would have laid out differently from the user's.
 *
 * NOTHING HERE MAY CHANGE WHAT THE USER SEES. Recording is an observer: it does
 * not alter opacity, visibility, mounting, layout, scroll position, animation or
 * touch handling, and it must not start doing so to make a recording tidier. A
 * mask is a rectangle the SDK paints onto its own screenshot in window
 * coordinates, with no knowledge of what covers it, so one belonging to the
 * screen behind an open sheet is drawn over that sheet. That overlap is a
 * limitation of PostHog's React Native replay and is accepted as such; it exists
 * only inside the recording and is invisible in the app.
 *
 * `PostHogMaskView` rather than a hand-written `accessibilityLabel` because it
 * marks the wrapper and sets `importantForAccessibility="no"` on that wrapper
 * alone, leaving the text underneath readable to a screen reader. It also sets
 * `collapsable={false}`, without which React Native can flatten a layout-only
 * wrapper out of the tree and silently drop the mask; the unmasked branch sets
 * the same so neither branch can be flattened.
 */
export function MaskedUserText({ masked, style, children }: Props) {
  if (masked) {
    return <PostHogMaskView style={style}>{children}</PostHogMaskView>;
  }
  return <View style={style} collapsable={false}>{children}</View>;
}
