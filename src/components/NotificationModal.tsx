import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { getToggleOffTrackColor, INTERVAL_OPTIONS } from '../constants';
import { useLang } from '../i18n';
import { appStyles as s } from '../styles';
import { CompactSwitch } from './CompactSwitch';
import { SettingsInfoPopup, type SettingsInfoContent } from './SettingsInfoPopup';

const INFO_BUTTON_TARGET = 44;
const INFO_ICON_OPACITY = 0.62;

interface Props {
  visible: boolean;
  onClose: () => void;
  intervalSeconds: number;
  onPickInterval: (seconds: number) => void;
  displayOnlyWord: boolean;
  onToggleDisplayOnlyWord: (value: boolean) => void;
  /** "Notify All Words" for this folder — off means the candidate list applies. */
  notifyAllWords: boolean;
  onToggleNotifyAllWords: (value: boolean) => void;
  /**
   * The folder is scheduled to notify, draws from its list, and the list is
   * empty. Nothing will fire until the user acts, so the sheet says so.
   */
  noNotifiableWords: boolean;
  pal: Palette;
  themeColor: string;
  onTest: () => void;
}

export function NotificationModal({
  visible, onClose, intervalSeconds, onPickInterval,
  displayOnlyWord, onToggleDisplayOnlyWord,
  notifyAllWords, onToggleNotifyAllWords, noNotifiableWords,
  pal, themeColor, onTest,
}: Props) {
  const t = useLang();
  const offTrackColor = getToggleOffTrackColor(pal.bg, pal.border);
  const [testSent, setTestSent] = useState(false);
  const [infoContent, setInfoContent] = useState<SettingsInfoContent | null>(null);
  const [infoPopupVisible, setInfoPopupVisible] = useState(false);
  const infoPopupClosing = useRef(false);
  const slideY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideY.setValue(600);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 600, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const showInfoPopup = useCallback((content: SettingsInfoContent) => {
    infoPopupClosing.current = false;
    setInfoContent(content);
    setInfoPopupVisible(true);
  }, []);

  const closeInfoPopup = useCallback(() => {
    if (infoPopupClosing.current) return;
    infoPopupClosing.current = true;
    setInfoPopupVisible(false);
  }, []);

  const dismissInfoPopup = useCallback(() => {
    setInfoContent(null);
    infoPopupClosing.current = false;
  }, []);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      {/* Backdrop — fades in place, does not slide */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropOpacity }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {/* Sheet — slides up independently */}
      <Animated.View style={[styles.sheetWrapper, { transform: [{ translateY: slideY }] }]}>
        <TouchableOpacity
          activeOpacity={1}
          style={[s.bottomSheet, styles.sheet, { backgroundColor: pal.dialog, borderColor: pal.border }]}
        >

          {/* Header row: title + Send Test button + close */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              <Text style={[s.dialogTitle, styles.headerTitle, { color: pal.text }]} numberOfLines={1}>
                {t('notifications')}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[s.compactHeaderButton, { backgroundColor: themeColor + '0F', borderColor: themeColor + '45' }]}
                onPress={() => {
                  onTest();
                  setTestSent(true);
                  setTimeout(() => setTestSent(false), 4000);
                }}
              >
                <Text style={[s.compactHeaderButtonText, { color: themeColor }]} numberOfLines={1}>
                  {testSent ? t('test_sending') : t('test_send')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: pal.input }]}
                onPress={handleClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={19} color={pal.sub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Interval options */}
          <View style={styles.list}>
            <View style={styles.intervalGrid}>
              {INTERVAL_OPTIONS.map(option => {
                const selected = option.seconds === intervalSeconds;
                const isOff = option.seconds === 0;
                return (
                  <TouchableOpacity
                    key={option.seconds}
                    style={[
                      styles.intervalOption,
                      {
                        backgroundColor: selected ? themeColor + '12' : pal.input,
                        borderColor: selected ? themeColor : pal.border,
                        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                    onPress={() => onPickInterval(option.seconds)}
                    activeOpacity={0.76}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.intervalText,
                        { color: selected ? themeColor : isOff ? '#E05C5C' : pal.text },
                        selected && styles.intervalTextSelected,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Content and scope preferences — deliberately separate from the
                schedule choices above. */}
            <View style={styles.contentSeparator}>
              <View style={[styles.separatorLine, { backgroundColor: pal.border }]} />
            </View>

            {/* Two independent stored booleans, each with one control and one
                explanation behind its Info button. "Notify All Words" off is
                the default: the folder draws from its candidate list. */}
            <View>
              <NotificationToggleRow
                label={t('display_only_word')}
                info={t('display_only_word_desc')}
                value={displayOnlyWord}
                onValueChange={onToggleDisplayOnlyWord}
                onShowInfo={showInfoPopup}
                pal={pal}
                themeColor={themeColor}
                offTrackColor={offTrackColor}
              />
              <NotificationToggleRow
                label={t('notif_all_words')}
                info={t('notif_all_words_desc')}
                value={notifyAllWords}
                onValueChange={onToggleNotifyAllWords}
                onShowInfo={showInfoPopup}
                pal={pal}
                themeColor={themeColor}
                offTrackColor={offTrackColor}
              />
            </View>

            {/* Nothing will arrive, and the two ways out of that. Shown only
                when the folder is actually trying to notify, so it never
                appears as a complaint about a folder set to Off. */}
            {noNotifiableWords && (
              <View style={[styles.warning, { backgroundColor: pal.chip, borderColor: '#F2B445' }]}>
                <Ionicons name="alert-circle-outline" size={17} color="#F2B445" />
                <Text style={[styles.warningText, { color: pal.text }]}>
                  {t('notif_no_candidates')}
                </Text>
              </View>
            )}
          </View>

        </TouchableOpacity>
      </Animated.View>

      {/* Rendered inside this Modal, and last, so it stacks above the sheet on
          iOS. As a sibling of the Modal it would never present at all. */}
      <SettingsInfoPopup
        visible={infoPopupVisible}
        content={infoContent}
        onClose={closeInfoPopup}
        onDismiss={dismissInfoPopup}
        pal={pal}
        themeColor={themeColor}
      />
    </Modal>
  );
}

/**
 * One notification preference: its title, an Info button carrying the whole
 * explanation, and its switch on the right. The same row design the Settings
 * screen uses, so no preference here is described by text under the row.
 */
function NotificationToggleRow({
  label, info, value, onValueChange, onShowInfo, pal, themeColor, offTrackColor,
}: {
  label: string;
  info: string;
  value: boolean;
  onValueChange(value: boolean): void;
  onShowInfo(content: SettingsInfoContent): void;
  pal: Palette;
  themeColor: string;
  offTrackColor: string;
}) {
  const t = useLang();
  const handleInfoPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onShowInfo({ title: label, body: info });
  };

  const handleToggle = () => onValueChange(!value);
  return (
    <TouchableOpacity
      style={styles.toggleRow}
      onPress={handleToggle}
      activeOpacity={0.7}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={info}
    >
      <View style={styles.titleAndInfo}>
        <Text style={[styles.toggleLabel, { color: pal.text }]}>{label}</Text>
        <TouchableOpacity
          style={styles.infoButton}
          onPress={handleInfoPress}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${t('info_button_label')}`}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={pal.sub}
            style={styles.subtleInfoIcon}
          />
        </TouchableOpacity>
      </View>
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CompactSwitch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={label}
          accessibilityHint={info}
          themeColor={themeColor}
          offTrackColor={offTrackColor}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop:    { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { flexShrink: 1, marginBottom: 0, fontSize: 20 },
  list: { marginBottom: 4 },
  headerRight: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  intervalGrid: { gap: 6 },
  intervalOption: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  intervalText: { width: '100%', fontSize: 14.5, fontWeight: '500' },
  intervalTextSelected: { fontWeight: '700' },
  // The gap under the line is owned here alone — the row group adds none of its
  // own, so this one number is the whole distance to the first row.
  contentSeparator: {
    height: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  separatorLine: { height: StyleSheet.hairlineWidth },
  toggleRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  titleAndInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: { fontSize: 15, lineHeight: 20, flexShrink: 1, flexWrap: 'wrap' },
  infoButton: {
    width: INFO_BUTTON_TARGET,
    height: INFO_BUTTON_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtleInfoIcon: { opacity: INFO_ICON_OPACITY },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  warningText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
