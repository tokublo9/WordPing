import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../types';
import { subscribeToTopBanner, type TopBannerRequest } from '../lib/topBanner';

/**
 * Matches the custom-voice-locked banner already in App.tsx: same geometry, same
 * spring, same 4s dwell, same tap-or-swipe-up dismissal. Kept as its own
 * component because this one is driven by requests from deep inside the card
 * hooks rather than by a single piece of App state.
 */
export const TOP_BANNER_VISIBLE_MS = 4_000;
const OFFSCREEN_Y = -56;

interface Props {
  pal: Palette;
}

export function TopBanner({ pal }: Props) {
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState<TopBannerRequest | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true })
      .start(({ finished }) => {
        // Only unmount when the slide-out ran to completion; a second notice
        // arriving mid-animation must not blank the banner.
        if (finished) setRequest(null);
      });
  }, [anim, clearTimer]);

  // Swipe up to dismiss, matching the existing banner's gesture.
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
    onPanResponderRelease: (_, gesture) => { if (gesture.dy < -20) dismissRef.current(); },
  })).current;
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => subscribeToTopBanner(next => {
    clearTimer();
    setRequest(next);
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, tension: 90, friction: 9, useNativeDriver: true }).start();
    hideTimer.current = setTimeout(() => dismissRef.current(), TOP_BANNER_VISIBLE_MS);
  }), [anim, clearTimer]);

  useEffect(() => () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    anim.stopAnimation();
  }, [anim]);

  if (!request) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          top: insets.top + 8,
          backgroundColor: pal.dialog,
          borderColor: pal.border,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [OFFSCREEN_Y, 0] }) }],
        },
      ]}
      {...pan.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={dismiss}
        style={styles.touch}
        accessibilityRole="alert"
        accessibilityLabel={request.message}
      >
        <Ionicons name="information-circle" size={18} color="#f59e0b" style={styles.icon} />
        <Text style={[styles.text, { color: pal.text }]}>{request.message}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 8,
  },
  touch: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 8, alignSelf: 'flex-start', marginTop: 1 },
  // The limit messages run to three or four lines in Japanese, so unlike the
  // single-line locked-voice banner this must not be centred or clipped.
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
