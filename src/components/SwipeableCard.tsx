import { useCallback, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Palette, WordCard } from '../types';
import { REVEAL_WIDTH } from '../constants';

interface Props {
  item: WordCard;
  isFlipped: boolean;
  themeColor: string;
  pal: Palette;
  onFlip: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleNotif: () => void;
  onOpen: (close: () => void) => void;
}

export function SwipeableCard({
  item, isFlipped, themeColor, pal, onFlip, onEdit, onDelete, onToggleNotif, onOpen,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const startX = useRef(0);

  const closeRef = useRef<() => void>(() => {});
  const openRef  = useRef<() => void>(() => {});

  const close = useCallback(() => {
    isOpen.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: false, tension: 80, friction: 12 }).start();
  }, [translateX]);

  const open = useCallback(() => {
    isOpen.current = true;
    onOpen(close);
    Animated.spring(translateX, { toValue: -REVEAL_WIDTH, useNativeDriver: false, tension: 80, friction: 12 }).start();
  }, [translateX, close, onOpen]);

  closeRef.current = close;
  openRef.current  = open;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 8,
      onPanResponderGrant: () => {
        startX.current = isOpen.current ? -REVEAL_WIDTH : 0;
      },
      onPanResponderMove: (_, { dx }) => {
        const next = Math.min(0, Math.max(-REVEAL_WIDTH, startX.current + dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx }) => {
        if (startX.current === 0) {
          dx < -5 ? openRef.current() : closeRef.current();
        } else {
          dx < -30 ? openRef.current() : closeRef.current();
        }
      },
      onPanResponderTerminate: () => { closeRef.current(); },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const handleTap = () => {
    if (isOpen.current) close();
    else onFlip();
  };

  return (
    <View style={styles.cardRow}>
      <View style={styles.actionBg}>
        <TouchableOpacity
          style={[styles.circleBtn, { backgroundColor: item.notifOff ? '#C0C0C0' : themeColor }]}
          onPress={() => { close(); setTimeout(onToggleNotif, 220); }}
        >
          <Ionicons name={item.notifOff ? 'notifications-off-outline' : 'notifications-outline'} size={17} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.circleBtn, { backgroundColor: '#C0C0C0' }]}
          onPress={() => { close(); setTimeout(onEdit, 220); }}
        >
          <Ionicons name="create-outline" size={17} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.circleBtn, { backgroundColor: '#E05C5C' }]}
          onPress={() => { close(); setTimeout(onDelete, 220); }}
        >
          <Ionicons name="trash-outline" size={17} color="#fff" />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[styles.cardOuter, { shadowColor: '#000', transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.cardInner, { backgroundColor: isFlipped ? themeColor : pal.card }]}>
          <TouchableOpacity style={styles.cardFlipArea} onPress={handleTap} activeOpacity={1}>
            {isFlipped ? (
              <>
                <Text style={[styles.cardText, { color: '#fff' }]}>{item.meaning}</Text>
                {!!item.note?.trim() && (
                  <Text style={[styles.cardNote, { color: 'rgba(255,255,255,0.72)' }]}>
                    {item.note}
                  </Text>
                )}
              </>
            ) : (
              <Text style={[styles.cardText, { color: pal.text }]}>{item.word}</Text>
            )}
            {!isFlipped && !!item.notifOff && (
              <View style={styles.notifOffBadge} pointerEvents="none">
                <Ionicons name="notifications-off-outline" size={13} color={pal.sub} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardRow: { marginBottom: 10 },
  cardOuter: {
    borderRadius: 16,
    shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardInner: { borderRadius: 16, overflow: 'hidden' },
  actionBg: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: REVEAL_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  circleBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  cardFlipArea: { paddingVertical: 16, paddingHorizontal: 18 },
  cardText: { fontSize: 18, fontWeight: '600' },
  cardNote: { fontSize: 14, fontWeight: '400', marginTop: 8 },
  notifOffBadge: { position: 'absolute', bottom: 8, right: 10 },
});
