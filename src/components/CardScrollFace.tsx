import { useCallback, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { FLIP_CARD_H, FLIP_CARD_PAD_H, FLIP_CARD_PAD_V } from '../constants';
import {
  IDLE_FLIP_GESTURE,
  reduceFlipGesture,
  shouldFlipOnPress,
  type FlipGesture,
} from '../features/cards/flipGesture';

interface Props {
  children: React.ReactNode;
  // Called on a quick tap anywhere on the card face (but not after a vertical drag).
  // Placing the Pressable INSIDE the ScrollView is the key: React Native's Pressable
  // automatically yields the gesture to the parent ScrollView on vertical drags, so
  // onFlip never fires after a scroll. Horizontal drags are stolen by the parent
  // PanResponder (FlipCardBrowser) without triggering onFlip.
  onFlip: () => void;
  /**
   * The card's voice control. Every caller passes a `WordCardVoiceButton` driven by
   * `useWordCardVoicePlayback`, so the icon, its loading and playing states and its tap
   * behaviour are identical on every screen.
   */
  voiceButton?: React.ReactNode;
  showVoice?: boolean;
  /**
   * This face's text can be selected and copied.
   *
   * Selectable text puts two gestures on the same pixels: a tap flips, a long
   * press starts the OS selection and its Copy menu. Setting this makes the
   * face treat a long press as a selection and not as a flip — see
   * `features/cards/flipGesture.ts`.
   *
   * Off by default so a face without selectable text keeps exactly the tap
   * behaviour it had, including on a slow press.
   */
  selectableText?: boolean;
  /**
   * Reports when this face's gesture became a text selection (`true`) and when
   * the next ordinary touch begins (`false`).
   *
   * A screen that also owns a drag gesture over the same pixels — Flip Mode's
   * horizontal card swipe — needs this to stand aside while the finger is
   * selecting, or it pulls the card out from under the Copy menu. Reported from
   * the same two events the flip decision uses, so the two can never disagree.
   * Only called on a `selectableText` face, because only there can a selection
   * start.
   */
  onSelectionGesture?: (selecting: boolean) => void;
}

export function CardScrollFace({
  children,
  onFlip,
  voiceButton,
  showVoice = true,
  selectableText = false,
  onSelectionGesture,
}: Props) {
  // A ref, not state: the decision is read inside the very handlers that write
  // it, and re-rendering the card face mid-gesture would be both pointless and
  // disruptive to the selection in progress.
  const gesture = useRef<FlipGesture>(IDLE_FLIP_GESTURE);

  // Every new touch starts a fresh gesture, so a long press can never disable
  // tap-to-flip beyond the gesture it belongs to.
  const handlePressIn = useCallback(() => {
    gesture.current = reduceFlipGesture(gesture.current, 'press-in');
    onSelectionGesture?.(false);
  }, [onSelectionGesture]);

  // Defining this is also what makes Pressability itself withhold `onPress` for
  // the same gesture; the ref covers the platforms and edge cases where a press
  // still arrives. The platform's own long-press threshold is used — there is
  // no timing constant here to fall out of step with text selection.
  const handleLongPress = useCallback(() => {
    gesture.current = reduceFlipGesture(gesture.current, 'long-press');
    onSelectionGesture?.(true);
  }, [onSelectionGesture]);

  const handlePress = useCallback(() => {
    gesture.current = reduceFlipGesture(gesture.current, 'press');
    if (shouldFlipOnPress(gesture.current)) onFlip();
  }, [onFlip]);

  return (
    <View style={s.container}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator
        scrollIndicatorInsets={{ top: 4, bottom: 4 }}
        bounces={false}
      >
        {/*
          The Pressable is the sole content-size owner. Keeping flex growth off the
          ScrollView content container lets Yoga measure every wrapped line during
          the initial layout instead of first constraining it to the viewport and
          correcting the native scroll size after interaction. Short content still
          fills the card through this minimum; long content grows intrinsically.
        */}
        <Pressable
          style={s.pressable}
          onPress={handlePress}
          // Wired only for a selectable face. Without these the Pressable is
          // exactly what it was, so Flip Mode's own faces are untouched.
          {...(selectableText
            ? { onPressIn: handlePressIn, onLongPress: handleLongPress }
            : null)}
        >
          {children}
        </Pressable>
      </ScrollView>

      {/* Voice button is outside the ScrollView so it stays fixed while text scrolls. */}
      {showVoice && voiceButton && (
        <View style={s.wordCardVoiceBtn}>{voiceButton}</View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  pressable: {
    minHeight: FLIP_CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: FLIP_CARD_PAD_V,
    paddingHorizontal: FLIP_CARD_PAD_H,
    paddingBottom: FLIP_CARD_PAD_V,
  },
  wordCardVoiceBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
