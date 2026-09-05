import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Palette } from '../types';
import { useLang } from '../i18n';
import {
  anchorBelowRect,
  isMeasuredRect,
  type SpotlightRect,
} from '../features/onboarding/spotlight';

/**
 * One line of Test Mode introduction, acknowledged once.
 *
 * Used by the first and third steps. The second step is not this dialog: it is
 * the Info popup itself, opened automatically, so the four results are
 * described in exactly one place whichever way the user arrives at them.
 *
 * NOT A `Modal`, deliberately, and this is the whole reason the file exists
 * rather than reusing a dialog component:
 *
 *  - Test Mode already mounts one native modal, the Info popup. A second
 *    `Modal` alongside it is the classic React Native way to end up with a
 *    presented window that outlives its content and silently swallows every
 *    touch on the screen.
 *  - The test screen is unmounted by the X button. A native modal torn down
 *    while it is still presenting or dismissing leaves that window behind — so
 *    the control that ends the session would be the control that breaks the app.
 *
 * An ordinary absolutely-positioned overlay has neither problem: it is plain
 * views, and it is mounted and unmounted by ordinary reconciliation, leaving
 * nothing behind at any point in the transition.
 *
 * It is hosted by App, outside the SafeAreaView, because an absolutely-filled
 * child is laid out inside its parent's padding: nothing rendered under the
 * safe-area insets can dim the status bar or the home-indicator strip, and
 * nothing rendered under the header can place itself against the whole screen.
 *
 * Covering the header is a consequence of that, and the trade it makes is
 * deliberate: while a step is up, a tap where the X is lands on the backdrop
 * and dismisses the step, and the next tap reaches the X. What keeps the
 * controls working is that this is not a native modal and that it cannot
 * outlive the test — never that it leaves part of the screen uncovered.
 */

interface Props {
  visible: boolean;
  /** The already-translated message. */
  message: string;
  onDismiss: () => void;
  /**
   * The measured target to leave bright. Until it exists nothing is drawn: a
   * tutorial that points at a real control must never flash at screen centre.
   */
  spotlight?: SpotlightRect | null;
  pal: Palette;
  themeColor: string;
}

export function TestIntroDialog({
  visible, message, onDismiss, spotlight = null, pal, themeColor,
}: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  if (!visible || !isMeasuredRect(spotlight)) return null;

  const anchored = anchorBelowRect({
    rect: spotlight,
    windowHeight,
    bottomInset: insets.bottom,
  });

  return (
    <View style={styles.overlay}>
      {/* One backdrop with one rounded hole — never strips that can seam or
          overlapping translucent layers that can darken twice. */}
      <SpotlightDim
        rect={spotlight}
        windowWidth={windowWidth}
        windowHeight={windowHeight}
      />

      {/* Dismissal, over the whole window including the lit target: the step
          says what to do next, and the target only becomes tappable once it has
          been acknowledged. */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('test_intro_got_it')}
      />

      {/* Above both. `box-none` so a tap beside the card still reaches the
          backdrop rather than being caught by this positioning box. */}
      <View
        style={[styles.anchoredSlot, { top: anchored.top, height: anchored.maxHeight }]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.dialog,
            { backgroundColor: pal.dialog, borderColor: pal.border, maxHeight: anchored.maxHeight },
          ]}
          accessibilityViewIsModal
        >
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={[styles.message, { color: pal.text }]} accessibilityRole="text">
              {message}
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: themeColor }]}
            onPress={onDismiss}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('test_intro_got_it')}
          >
            <Text style={styles.buttonLabel}>{t('test_intro_got_it')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * The dim, with a rounded hole cut in it.
 *
 * One view, not four strips around a gap: a single enormous border painted in
 * the backdrop colour, with a transparent middle. React Native draws the inner
 * corner at `borderRadius - borderWidth`, so asking for the target's own radius
 * plus the spread gives a hole that matches its corners and dimensions exactly,
 * and there is no seam anywhere because there is only one layer of colour.
 *
 * The spread is the window's own width plus its height, which is more than the
 * distance from any point on screen to any edge — so wherever the target sits,
 * the dim still reaches every corner of the window.
 */
function SpotlightDim({
  rect, windowWidth, windowHeight,
}: {
  rect: SpotlightRect; windowWidth: number; windowHeight: number;
}) {
  const spread = windowWidth + windowHeight;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: rect.x - spread,
        top: rect.y - spread,
        width: rect.width + spread * 2,
        height: rect.height + spread * 2,
        borderWidth: spread,
        borderColor: DIM_COLOR,
        borderRadius: rect.radius + spread,
      }}
    />
  );
}

const DIM_COLOR = 'rgba(0,0,0,0.45)';

const styles = StyleSheet.create({
  // The host box: the window itself, since App renders this outside the
  // SafeAreaView. It paints nothing — the dim below it does.
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000 },
  // Under the lit target. `top` and available height are measured, never constants,
  // and the body scrolls rather than growing past the bottom inset.
  anchoredSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    elevation: 24,
  },
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingBottom: 4 },
  message: { fontSize: 15, lineHeight: 22 },
  button: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
