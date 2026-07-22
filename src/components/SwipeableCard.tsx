import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import { preloadAI, speak, speakWordCard, stopPlayback } from '../lib/tts';

import type { Palette, WordCard } from '../types';
import { REVEAL_WIDTH } from '../constants';
import { useLang } from '../i18n';
import { type GestureDirection, lockGestureDirection } from '../lib/gestureDirection';

const SCREEN_H = Dimensions.get('window').height;

const ACTION_MENU_H = 210;

interface LiftedLayout {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}

interface Props {
  item: WordCard;
  isFlipped: boolean;
  themeColor: string;
  pal: Palette;
  voiceLocked: boolean;
  isSubscribed: boolean;
  onFlip: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onToggleNotif: () => void;
  onVoiceLocked: () => void;
  onOpen: (close: () => void) => void;
  /** Ref to the close-function of whichever card is currently swiped open (null if none). */
  openCardRef: React.MutableRefObject<(() => void) | null>;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  showLevelLabel?: boolean;
  onHorizontalSwipeLockChange?: (locked: boolean) => void;
  onGestureStart?: () => void;
  onVerticalGestureLock?: () => void;
  isVerticalGestureLocked?: () => boolean;
  showFullCard?: boolean;
  isPremium?: boolean;
  onCustomVoiceLocked?: () => void;
  reorderMode?: boolean;
  reorderHandle?: React.ReactNode;
}

export function SwipeableCard({
  item, isFlipped, themeColor, pal, voiceLocked, isSubscribed,
  onFlip, onEdit, onDelete, onMove, onToggleNotif, onVoiceLocked, onOpen, openCardRef,
  selectionMode = false, selected = false, onToggleSelect,
  showLevelLabel = true, onHorizontalSwipeLockChange,
  onGestureStart, onVerticalGestureLock, isVerticalGestureLocked,
  showFullCard = false,
  isPremium = false, onCustomVoiceLocked,
  reorderMode = false, reorderHandle,
}: Props) {
  const t = useLang();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const startX = useRef(0);
  const gestureDirection = useRef<GestureDirection>('pending');

  const closeRef    = useRef<() => void>(() => {});
  const openRef     = useRef<() => void>(() => {});
  const onHorizontalSwipeLockChangeRef = useRef(onHorizontalSwipeLockChange);
  const onGestureStartRef = useRef(onGestureStart);
  const onVerticalGestureLockRef = useRef(onVerticalGestureLock);
  const isVerticalGestureLockedRef = useRef(isVerticalGestureLocked);
  onHorizontalSwipeLockChangeRef.current = onHorizontalSwipeLockChange;
  onGestureStartRef.current = onGestureStart;
  onVerticalGestureLockRef.current = onVerticalGestureLock;
  isVerticalGestureLockedRef.current = isVerticalGestureLocked;
  const close = useCallback(() => {
    isOpen.current = false;
    openCardRef.current = null;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      stiffness: 250,
      damping: 28,
      mass: 0.8,
    }).start();
  }, [translateX, openCardRef]);

  const open = useCallback(() => {
    isOpen.current = true;
    onOpen(close);
    Animated.spring(translateX, {
      toValue: -REVEAL_WIDTH,
      useNativeDriver: true,
      stiffness: 250,
      damping: 28,
      mass: 0.8,
    }).start();
  }, [translateX, close, onOpen]);

  closeRef.current = close;
  openRef.current  = open;

  const shouldClaimGesture = (dx: number, dy: number) => {
    if (isVerticalGestureLockedRef.current?.()) {
      gestureDirection.current = 'vertical';
      return false;
    }
    const previousDirection = gestureDirection.current;
    gestureDirection.current = lockGestureDirection(previousDirection, dx, dy);
    if (previousDirection === 'pending' && gestureDirection.current === 'vertical') {
      onVerticalGestureLockRef.current?.();
    }
    if (previousDirection !== 'horizontal' && gestureDirection.current === 'horizontal') {
      onHorizontalSwipeLockChangeRef.current?.(true);
    }
    return gestureDirection.current === 'horizontal';
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        gestureDirection.current = 'pending';
        onGestureStartRef.current?.();
        onHorizontalSwipeLockChangeRef.current?.(false);
        return false;
      },
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) => shouldClaimGesture(dx, dy),
      onMoveShouldSetPanResponder:        (_, { dx, dy }) => shouldClaimGesture(dx, dy),
      onPanResponderGrant: () => {
        onHorizontalSwipeLockChangeRef.current?.(true);
        startX.current = isOpen.current ? -REVEAL_WIDTH : 0;
        translateX.stopAnimation(value => { startX.current = value; });
      },
      onPanResponderReject: () => {
        gestureDirection.current = 'pending';
        onHorizontalSwipeLockChangeRef.current?.(false);
      },
      onPanResponderMove: (_, { dx }) => {
        const next = Math.min(0, Math.max(-REVEAL_WIDTH, startX.current + dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        gestureDirection.current = 'pending';
        onHorizontalSwipeLockChangeRef.current?.(false);
        const finalX = Math.min(0, Math.max(-REVEAL_WIDTH, startX.current + dx));
        if (vx < -0.35 || (vx < 0.35 && finalX <= -REVEAL_WIDTH * 0.5)) {
          openRef.current();
        } else {
          closeRef.current();
        }
      },
      onPanResponderTerminate: () => {
        gestureDirection.current = 'pending';
        onHorizontalSwipeLockChangeRef.current?.(false);
        closeRef.current();
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    })
  ).current;

  const handleTap = () => {
    // This card is swiped open — close it, don't flip.
    if (isOpen.current) { close(); return; }
    // Another card is swiped open — close that one, don't flip this card.
    if (openCardRef.current) { openCardRef.current(); return; }
    onFlip();
  };

  // ── Long-press lift ──────────────────────────────────────────────────────────
  const cardRef = useRef<View>(null);
  const [lifted, setLifted] = useState<LiftedLayout | null>(null);
  const liftScale = useRef(new Animated.Value(1)).current;

  const handleLongPress = () => {
    if (isOpen.current) return;
    cardRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      liftScale.setValue(0.97);
      setLifted({ pageX, pageY, width, height });
      Animated.spring(liftScale, {
        toValue: 1.03,
        useNativeDriver: true,
        tension: 180,
        friction: 7,
      }).start();
    });
  };

  const dismissLifted = () => {
    setLifted(null);
    liftScale.setValue(1);
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(isFlipped ? item.meaning : item.word);
    dismissLifted();
  };

  const handleNotifToggle = () => {
    dismissLifted();
    onToggleNotif();
  };

  const handleEditLifted = () => {
    dismissLifted();
    onEdit();
  };

  const handleDeleteLifted = () => {
    dismissLifted();
    onDelete();
  };

  // Place action menu below the card; flip above if near the bottom edge
  const actionsBelow = lifted
    ? lifted.pageY + lifted.height + ACTION_MENU_H + 16 < SCREEN_H
    : true;
  const actionsTop = lifted
    ? actionsBelow
      ? lifted.pageY + lifted.height + 10
      : lifted.pageY - ACTION_MENU_H - 10
    : 0;

  // ── Voice ────────────────────────────────────────────────────────────────────
  const [loadingVoice, setLoadingVoice] = useState<'word' | 'meaning' | null>(null);
  // Ref mirrors state so async handlers always read the current value, not a stale closure.
  const loadingVoiceRef = useRef<'word' | 'meaning' | null>(null);
  // Incremented on every speak call so the finishing handler of a superseded call
  // does not clear the loading indicator that the new call just set.
  const speakSeqRef = useRef(0);

  const setVoiceState = useCallback((v: 'word' | 'meaning' | null) => {
    loadingVoiceRef.current = v;
    setLoadingVoice(v);
  }, []);

  useEffect(() => { preloadAI(item.word, isSubscribed).catch(() => {}); }, [item.word, isSubscribed]);
  useEffect(() => { if (isFlipped) preloadAI(item.meaning, isSubscribed).catch(() => {}); }, [isFlipped, item.meaning, isSubscribed]);

  // Stop playback and reset state when the card is unmounted (e.g. folder switch).
  useEffect(() => () => {
    if (loadingVoiceRef.current) {
      stopPlayback();
      loadingVoiceRef.current = null;
    }
  }, []);

  const handleTTSError = useCallback((e: unknown) => {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'cancelled') return; // Normal: a newer play request superseded this one.
    console.error('[TTS] error:', e);
    if (msg === 'quota_exceeded') {
      Alert.alert(t('ai_voice_unavailable'), t('quota_exceeded_msg'));
    }
  }, [t]);

  const speakWord = useCallback(async () => {
    if (item.audioUri && !isPremium) { onCustomVoiceLocked?.(); return; }
    if (loadingVoiceRef.current === 'word') {
      ++speakSeqRef.current; // invalidate the in-flight call's seq check
      stopPlayback();
      setVoiceState(null);
      return;
    }
    const seq = ++speakSeqRef.current;
    setVoiceState('word');
    try {
      await speakWordCard(item, isSubscribed);
    } catch (e) { handleTTSError(e); }
    if (speakSeqRef.current === seq) setVoiceState(null);
  }, [item.word, item.wordLang, item.audioUri, item.audioSpeed, item.audioVolume, isSubscribed, isPremium, onCustomVoiceLocked, setVoiceState, handleTTSError]);

  const speakMeaning = useCallback(async () => {
    if (loadingVoiceRef.current === 'meaning') {
      ++speakSeqRef.current;
      stopPlayback();
      setVoiceState(null);
      return;
    }
    const seq = ++speakSeqRef.current;
    setVoiceState('meaning');
    try { await speak(item.meaning, isSubscribed, item.meaningLang); } catch (e) { handleTTSError(e); }
    if (speakSeqRef.current === seq) setVoiceState(null);
  }, [item.meaning, item.meaningLang, isSubscribed, setVoiceState, handleTTSError]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View ref={cardRef} style={[styles.cardRow, selectionMode && styles.cardRowSelect]}>

      {/* Selection circle — shown only in selection mode */}
      {selectionMode && (
        <TouchableOpacity
          style={styles.selCircleWrap}
          onPress={onToggleSelect}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={[
            styles.selCircle,
            { borderColor: themeColor },
            selected && { backgroundColor: themeColor },
          ]}>
            {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        </TouchableOpacity>
      )}

      {/* Swipe reveal — hidden in selection mode */}
      {!selectionMode && !reorderMode && (
        <View style={styles.actionBg}>
          <TouchableOpacity
            style={[styles.circleBtn, { backgroundColor: item.notifOff ? '#C0C0C0' : themeColor }]}
            onPress={() => { close(); setTimeout(onToggleNotif, 220); }}
          >
            <Ionicons name={item.notifOff ? 'notifications-off-outline' : 'notifications-outline'} size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtn, { backgroundColor: '#C0C0C0' }]}
            onPress={() => { close(); setTimeout(onMove, 220); }}
          >
            <Ionicons name="folder-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtn, { backgroundColor: '#C0C0C0' }]}
            onPress={() => { close(); setTimeout(onEdit, 220); }}
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtn, { backgroundColor: '#E05C5C' }]}
            onPress={() => { close(); setTimeout(onDelete, 220); }}
          >
            <Ionicons name="trash-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <Animated.View
        style={[
          styles.cardOuter,
          { shadowColor: '#000' },
          selectionMode
            ? { flex: 1, transform: [{ translateX: 0 }] }
            : { transform: [{ translateX }] },
        ]}
        {...(selectionMode || reorderMode ? {} : panResponder.panHandlers)}
      >
        <View style={[styles.cardInner, { backgroundColor: isFlipped && !showFullCard ? themeColor : selected ? themeColor + '20' : pal.card, flexDirection: 'row', alignItems: 'stretch' }]}>
          <TouchableOpacity
            style={[styles.cardFlipArea, { flex: 1 }]}
            onPress={reorderMode ? undefined : selectionMode ? onToggleSelect : handleTap}
            onLongPress={selectionMode || reorderMode ? undefined : handleLongPress}
            delayLongPress={380}
            activeOpacity={selectionMode && !reorderMode ? 0.7 : 1}
            disabled={reorderMode}
          >
            {/* Test level stripe — diagonal ribbon in bottom-right corner, front side only */}
            {showLevelLabel && !isFlipped && !!item.testLevel && (() => {
              const STRIPE_COLORS: Record<string, string> = {
                perfect: '#22c55e', good: '#3B82F6', slightly: '#f59e0b', unknown: '#ef4444',
              };
              const color = STRIPE_COLORS[item.testLevel!];
              return color ? (
                <View
                  style={[styles.cornerStripe, { backgroundColor: color }]}
                  pointerEvents="none"
                />
              ) : null;
            })()}

            {showFullCard && isFlipped ? (
              <>
                <Text style={[styles.cardText, { color: pal.text }]}>{item.word}</Text>
                <View style={[styles.expandDivider, { backgroundColor: pal.border }]} />
                <View style={styles.expandMeaningRow}>
                  <Text style={[styles.expandMeaningText, { color: pal.text }]}>{item.meaning}</Text>
                  <TouchableOpacity
                    onPress={voiceLocked ? onVoiceLocked : speakMeaning}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[styles.expandMeaningVoice, reorderMode && styles.reorderHiddenControl]}
                    disabled={reorderMode}
                  >
                    {voiceLocked ? (
                      <Ionicons name="lock-closed-outline" size={15} color={pal.sub} style={{ opacity: 0.6 }} />
                    ) : (
                      <Ionicons
                        name={loadingVoice === 'meaning' ? 'volume-high' : 'volume-medium-outline'}
                        size={17}
                        color={loadingVoice === 'meaning' ? themeColor : pal.sub}
                      />
                    )}
                  </TouchableOpacity>
                </View>
                {!!item.note?.trim() && (
                  <Text style={[styles.expandNoteText, { color: pal.sub }]}>{item.note}</Text>
                )}
              </>
            ) : isFlipped ? (
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

            {/* Corner buttons — hidden in selection mode */}
            {!selectionMode && (
              <View
                style={[styles.cornerBtns, reorderMode && styles.reorderHiddenControl]}
                pointerEvents={reorderMode ? 'none' : 'box-none'}
              >
                <TouchableOpacity
                  onPress={voiceLocked ? onVoiceLocked : (isFlipped && !showFullCard ? speakMeaning : speakWord)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={voiceLocked}
                >
                  {voiceLocked ? (
                    <Ionicons
                      name="lock-closed-outline"
                      size={15}
                      color={isFlipped && !showFullCard ? 'rgba(255,255,255,0.5)' : pal.sub}
                      style={{ opacity: 0.6 }}
                    />
                  ) : (
                    <Ionicons
                      name={loadingVoice === (isFlipped && !showFullCard ? 'meaning' : 'word') ? 'volume-high' : 'volume-medium-outline'}
                      size={17}
                      color={isFlipped && !showFullCard
                        ? (loadingVoice === 'meaning' ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.7)')
                        : (loadingVoice === 'word' ? themeColor : pal.sub)
                      }
                    />
                  )}
                </TouchableOpacity>
                {!!item.notifOff && (
                  <View style={{ opacity: 0.45 }} pointerEvents="none">
                    <Ionicons
                      name="notifications-off-outline"
                      size={13}
                      color={isFlipped ? '#fff' : pal.sub}
                    />
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
          {reorderMode && reorderHandle && (
            <View style={styles.reorderHandleSlot}>
              {reorderHandle}
            </View>
          )}
        </View>{/* cardInner row */}
      </Animated.View>

      {/* Long-press overlay — disabled in selection mode */}
      {!selectionMode && lifted && (
        <Modal visible transparent animationType="fade" onRequestClose={dismissLifted}>
          <View style={StyleSheet.absoluteFill}>
            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />

            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              onPress={dismissLifted}
              activeOpacity={1}
            />

            {/* Lifted card clone */}
            <Animated.View
              style={[
                styles.liftedCard,
                {
                  left: lifted.pageX,
                  top: lifted.pageY,
                  width: lifted.width,
                  backgroundColor: isFlipped ? themeColor : pal.card,
                  transform: [{ scale: liftScale }],
                },
              ]}
            >
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
            </Animated.View>

            {/* Action menu */}
            <View
              style={[
                styles.actionMenu,
                { backgroundColor: pal.dialog, left: lifted.pageX, top: actionsTop, width: lifted.width },
              ]}
            >
              <TouchableOpacity style={styles.actionRow} onPress={handleCopy}>
                <Ionicons name="copy-outline" size={18} color={pal.text} />
                <Text style={[styles.actionLabel, { color: pal.text }]}>{t('copy')}</Text>
              </TouchableOpacity>
              <View style={[styles.actionDivider, { backgroundColor: pal.border }]} />
              <TouchableOpacity style={styles.actionRow} onPress={handleNotifToggle}>
                <Ionicons
                  name={item.notifOff ? 'notifications-off-outline' : 'notifications-outline'}
                  size={18}
                  color={item.notifOff ? pal.text : themeColor}
                />
                <Text style={[styles.actionLabel, { color: item.notifOff ? pal.text : themeColor }]}>
                  {t(item.notifOff ? 'notif_off_action' : 'notif_on')}
                </Text>
              </TouchableOpacity>
              <View style={[styles.actionDivider, { backgroundColor: pal.border }]} />
              <TouchableOpacity style={styles.actionRow} onPress={handleEditLifted}>
                <Ionicons name="create-outline" size={18} color={pal.text} />
                <Text style={[styles.actionLabel, { color: pal.text }]}>{t('edit')}</Text>
              </TouchableOpacity>
              <View style={[styles.actionDivider, { backgroundColor: pal.border }]} />
              <TouchableOpacity style={styles.actionRow} onPress={handleDeleteLifted}>
                <Ionicons name="trash-outline" size={18} color="#E05C5C" />
                <Text style={[styles.actionLabel, { color: '#E05C5C' }]}>{t('delete')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardRow:       { marginBottom: 10, overflow: 'visible' },
  cardRowSelect: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Selection circle
  selCircleWrap: { paddingHorizontal: 4 },
  selCircle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },

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
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 0,
  },
  circleBtn: {
    width: 44, height: 44, borderRadius: 100,
    alignItems: 'center', justifyContent: 'center',
  },

  cardFlipArea: { paddingVertical: 16, paddingLeft: 18, paddingRight: 28 },
  cardText: { fontSize: 18, fontWeight: '600' },
  cardTextMeaning: { fontSize: 15, fontWeight: '400', marginTop: 4 },
  cardNote: { fontSize: 14, fontWeight: '400', marginTop: 8 },
  expandDivider: { height: StyleSheet.hairlineWidth, marginVertical: 10, alignSelf: 'stretch' },
  expandMeaningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expandMeaningText: { flex: 1, fontSize: 15, fontWeight: '400' },
  expandMeaningVoice: { marginRight: -18 },
  expandNoteText:    { fontSize: 13, fontWeight: '400', marginTop: 10 },
  cornerBtns: { position: 'absolute', top: 10, right: 10, alignItems: 'center', gap: 5 },
  reorderHiddenControl: { opacity: 0 },
  // The slot is absolutely stretched to the card's full height, so showing the
  // handle never participates in measurement or changes the card's layout.
  reorderHandleSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  cornerStripe: {
    position: 'absolute',
    bottom: 4,
    right: -15,
    width: 40,
    height: 5,
    opacity: 0.7,
    transform: [{ rotate: '-45deg' }],
  },

  // Long-press overlay
  liftedCard: {
    position: 'absolute',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  actionMenu: {
    position: 'absolute',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  actionLabel: { fontSize: 15 },
  actionDivider: { height: StyleSheet.hairlineWidth },
});
