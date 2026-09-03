import React, { useCallback, useRef, useState } from 'react';
import {
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
import { useWordCardVoicePlayback } from '../hooks/useWordCardVoicePlayback';
import { WordCardVoiceButton } from './WordCardVoiceButton';

import type { Palette, WordCard } from '../types';
import { REVEAL_WIDTH } from '../constants';
import { useLang } from '../i18n';
import { type GestureDirection, lockGestureDirection } from '../lib/gestureDirection';
import { CardResultAccessibilityLabel } from './CardResultAccessibilityLabel';
import { HiddenWordIcon } from './HiddenWordIcon';
import { isWordTextHidden } from '../features/cards/hideWordAccess';

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
  /** The plan includes High-Quality AI Voice — Premium only. */
  canUseAIVoice: boolean;
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
  onHorizontalSwipeLockChange?: (locked: boolean) => void;
  onGestureStart?: () => void;
  onVerticalGestureLock?: () => void;
  isVerticalGestureLocked?: () => boolean;
  /** Suppresses the card long-press/tap after the overlapping fast-scroll zone activates. */
  isFastScrollGesture?: () => boolean;
  showFullCard?: boolean;
  /** The plan includes Custom Voice for Words — Basic and Premium. */
  canUseCustomVoice?: boolean;
  /** The plan includes Hide Word — Basic only. */
  canHideWord?: boolean;
  onCustomVoiceLocked?: () => void;
  reorderMode?: boolean;
  reorderHandle?: React.ReactNode;
}

export function SwipeableCard({
  item, isFlipped, themeColor, pal, voiceLocked, canUseAIVoice,
  onFlip, onEdit, onDelete, onMove, onToggleNotif, onVoiceLocked, onOpen, openCardRef,
  selectionMode = false, selected = false, onToggleSelect,
  onHorizontalSwipeLockChange,
  onGestureStart, onVerticalGestureLock, isVerticalGestureLocked,
  isFastScrollGesture,
  showFullCard = false,
  canUseCustomVoice = false, canHideWord = false, onCustomVoiceLocked,
  reorderMode = false, reorderHandle,
}: Props) {
  const t = useLang();
  // Both the per-word flag and the capability, so a plan without Hide Word shows
  // the word again rather than inheriting a row it cannot reveal.
  const wordHidden = isWordTextHidden(item, canHideWord);
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
  const isFastScrollGestureRef = useRef(isFastScrollGesture);
  onHorizontalSwipeLockChangeRef.current = onHorizontalSwipeLockChange;
  onGestureStartRef.current = onGestureStart;
  onVerticalGestureLockRef.current = onVerticalGestureLock;
  isVerticalGestureLockedRef.current = isVerticalGestureLocked;
  isFastScrollGestureRef.current = isFastScrollGesture;
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
    if (isFastScrollGestureRef.current?.()) return;
    // This card is swiped open — close it, don't flip.
    if (isOpen.current) { close(); return; }
    // Another card is swiped open — close that one, don't flip this card.
    if (openCardRef.current) { openCardRef.current(); return; }
    onFlip();
  };

  const handleCardPress = () => {
    if (isFastScrollGestureRef.current?.()) return;
    if (selectionMode) {
      onToggleSelect?.();
      return;
    }
    handleTap();
  };

  // ── Long-press lift ──────────────────────────────────────────────────────────
  const cardRef = useRef<View>(null);
  const [lifted, setLifted] = useState<LiftedLayout | null>(null);
  const liftScale = useRef(new Animated.Value(1)).current;

  const handleLongPress = () => {
    if (isFastScrollGestureRef.current?.()) return;
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

  // What Copy would put on the clipboard, or null when there is nothing the user
  // can see to copy. A hidden word is not offered: the whole point is that it has
  // not been revealed yet, and the clipboard is as much an exposure as the screen.
  const copyableText = isFlipped ? item.meaning : (wordHidden ? null : item.word);

  const handleCopy = async () => {
    if (copyableText === null) return;
    await Clipboard.setStringAsync(copyableText);
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
  const { voiceState, playWord: speakWord, playMeaning: speakMeaning, wordVoiceSource } =
    useWordCardVoicePlayback({
      item,
      canUseAIVoice,
      canUseCustomVoice,
      onCustomVoiceLocked,
    });

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
          <CardResultAccessibilityLabel testLevel={item.testLevel} />
          <TouchableOpacity
            style={[styles.cardFlipArea, { flex: 1 }]}
            onPress={reorderMode ? undefined : handleCardPress}
            onLongPress={selectionMode || reorderMode ? undefined : handleLongPress}
            delayLongPress={380}
            activeOpacity={selectionMode && !reorderMode ? 0.7 : 1}
            disabled={reorderMode}
          >
            {/* No result label is drawn on a card. The result itself is still
                stored and still announced by CardResultAccessibilityLabel
                above — only the corner ribbon is gone. */}
            {showFullCard && isFlipped ? (
              <>
                {wordHidden
                  ? <HiddenWordIcon color={pal.text} variant="row" />
                  : <Text style={[styles.cardText, { color: pal.text }]}>{item.word}</Text>}
                <View style={[styles.expandDivider, { backgroundColor: pal.border }]} />
                <View style={styles.expandMeaningRow}>
                  <Text style={[styles.expandMeaningText, { color: pal.text }]}>{item.meaning}</Text>
                  <WordCardVoiceButton
                    onPress={voiceLocked ? onVoiceLocked : speakMeaning}
                    phase={voiceState?.target === 'meaning' ? voiceState.phase : undefined}
                    themeColor={themeColor}
                    inactiveColor={pal.sub}
                    locked={voiceLocked}
                    disabled={reorderMode}
                    style={[styles.expandMeaningVoice, reorderMode && styles.reorderHiddenControl]}
                  />
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
            ) : wordHidden ? (
              // The eye-off mark and no word, so there is no word to read aloud,
              // select or copy. It carries the line height the word would have
              // had, so the list does not become a ladder of different-sized rows
              // and every row stays as easy to hit.
              <HiddenWordIcon color={pal.text} variant="row" />
            ) : (
              <Text style={[styles.cardText, { color: pal.text }]}>{item.word}</Text>
            )}

            {/* Corner buttons — hidden in selection mode */}
            {!selectionMode && (
              <View
                style={[styles.cornerBtns, reorderMode && styles.reorderHiddenControl]}
                pointerEvents={reorderMode ? 'none' : 'box-none'}
              >
                <WordCardVoiceButton
                  onPress={voiceLocked ? onVoiceLocked : (isFlipped && !showFullCard ? speakMeaning : speakWord)}
                  phase={voiceState?.target === (isFlipped && !showFullCard ? 'meaning' : 'word')
                    ? voiceState.phase
                    : undefined}
                  // Dual-target: the meaning side never has a file, so only the
                  // word side can show the custom glyph.
                  source={isFlipped && !showFullCard ? 'tts' : wordVoiceSource}
                  themeColor={themeColor}
                  inactiveColor={pal.sub}
                  onDarkBackground={isFlipped && !showFullCard}
                  locked={voiceLocked}
                  disabled={reorderMode}
                />
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
              ) : wordHidden ? (
                // The long-press preview is a copy of the row, so it shows the
                // mark too — lifting a card must not reveal the word.
                <HiddenWordIcon color={pal.text} variant="row" />
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
              {copyableText !== null && (
                <>
                  <TouchableOpacity style={styles.actionRow} onPress={handleCopy}>
                    <Ionicons name="copy-outline" size={18} color={pal.text} />
                    <Text style={[styles.actionLabel, { color: pal.text }]}>{t('copy')}</Text>
                  </TouchableOpacity>
                  <View style={[styles.actionDivider, { backgroundColor: pal.border }]} />
                </>
              )}
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
