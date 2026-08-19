import { ActivityIndicator, Alert, Animated, Dimensions, Linking, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

import type { Appearance, Palette } from '../types';
import { getToggleOffTrackColor } from '../constants';
import { SUPPORTED_LANGUAGES, useLang } from '../i18n';
import { appStyles as s } from '../styles';
import { AdBannerPlaceholder } from './AdBannerPlaceholder';
import { BackupSection } from './BackupSection';
import { AI_TEXT_FEATURES_ENABLED } from '../features/flags';
import { canUseBackup } from '../features/backup/backupAccess';
import { KisekaeShopSheet } from './KisekaeShopSheet';
import { LanguageModal } from './LanguageModal';
import { ProSheet } from './ProSheet';
import { AnnouncementsSheet } from './AnnouncementsSheet';
import { CompactSwitch } from './CompactSwitch';
import { SettingsInfoPopup, type SettingsInfoContent } from './SettingsInfoPopup';
import {
  AI_VOICE_GROUPS,
  getAIVoiceDescription,
  getAIVoiceLabel,
  type AIVoice,
} from '../lib/aiVoices';
import { previewAIVoice, stopPlayback, type TTSPlaybackPhase } from '../lib/tts';

// TODO: replace with real URLs before release
const PRIVACY_URL  = 'https://wordping.app/privacy';
const TERMS_URL    = 'https://wordping.app/terms';
const CONTACT_MAIL = 'mailto:tokumoto.daiki.0219@gmail.com';
const LICENSE_URL  = 'https://wordping.app/license';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const SW = Dimensions.get('window').width;

/**
 * Vertical space above and below every Settings divider. Reduced from 20 so the
 * screen scrolls less, while still reading as separate groups.
 */
export const SETTINGS_DIVIDER_MARGIN = 17;

/** Minimum touch target for the information buttons, per Apple HIG. */
const INFO_BUTTON_TARGET = 44;
type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface Props {
  visible: boolean;
  onClose: () => void;
  themeColor: string;
  appearance: Appearance;
  onPickAppearance: (mode: Appearance) => void;
  skinId: string | null;
  onPickSkin: (id: string | null) => void;
  isSubscribed: boolean;
  isPremium: boolean;
  /** False until RevenueCat has answered. Paid features stay locked until then. */
  isSubscriptionLoaded: boolean;
  onUpgrade: () => void;
  onSubscribe: () => Promise<void>;
  onSubscribePremium: () => Promise<void>;
  onRestore: () => Promise<void>;
  /** DEV ONLY: forwarded to ProSheet to override the Manage Subscription button. */
  onManageSubscription?: () => void;
  pal: Palette;
  language: string;
  onPickLanguage: (code: string) => void;
  aiVoice: AIVoice;
  onPickAIVoice: (voice: AIVoice) => void;
  showFullCard: boolean;
  onToggleShowFullCard: (v: boolean) => void;
  verticalFlip: boolean;
  onToggleVerticalFlip: (v: boolean) => void;
  hideAiTools: boolean;
  onToggleHideAiTools: (v: boolean) => void;
  syncTestResults: boolean;
  onToggleSyncTestResults: (v: boolean) => void;
  /** Re-read cards and folders after a backup import replaced them. */
  onDataReplaced: () => void;
}

export function SettingsModal({
  visible, onClose, themeColor, appearance, onPickAppearance,
  skinId, onPickSkin, isSubscribed, isPremium, isSubscriptionLoaded,
  onUpgrade: _onUpgrade,
  onSubscribe, onSubscribePremium, onRestore, onManageSubscription, pal, language, onPickLanguage,
  aiVoice, onPickAIVoice,
  showFullCard, onToggleShowFullCard,
  verticalFlip, onToggleVerticalFlip,
  hideAiTools, onToggleHideAiTools,
  syncTestResults, onToggleSyncTestResults,
  onDataReplaced,
}: Props) {
  void _onUpgrade; // kept in Props API for caller convenience; shop uses proSheetVisible directly
  const insets = useSafeAreaInsets();
  const t = useLang();
  const [proSheetVisible,  setProSheetVisible]  = useState(false);
  const [shopVisible,      setShopVisible]      = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [announcementsVisible, setAnnouncementsVisible] = useState(false);
  const [appInfoVisible,   setAppInfoVisible]   = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  // One slot for every information button in Settings. A second tap replaces
  // the content rather than stacking a second modal, so only one can be open.
  const [infoContent, setInfoContent] = useState<SettingsInfoContent | null>(null);

  const activeLang = SUPPORTED_LANGUAGES.find(l => l.code === language) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (visible && isSubscribed) return;
    stopPlayback();
    setVoicePickerVisible(false);
  }, [visible, isSubscribed]);

  // ── Appearance-disabled toast ─────────────────────────────────────────────
  const [hintShowing, setHintShowing] = useState(false);
  const hintAnim  = useRef(new Animated.Value(0)).current;  // 0=hidden, 1=visible
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissHint = useCallback(() => {
    if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; }
    Animated.timing(hintAnim, { toValue: 0, duration: 220, useNativeDriver: false })
      .start(({ finished }) => { if (finished) setHintShowing(false); });
  }, [hintAnim]);

  const showHint = useCallback(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHintShowing(true);
    Animated.spring(hintAnim, { toValue: 1, tension: 90, friction: 9, useNativeDriver: false }).start();
    hintTimer.current = setTimeout(dismissHint, 2500);
  }, [hintAnim, dismissHint]);

  // PanResponder on the toast: swipe up ≥ 28 px to dismiss immediately
  const hintPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
    onPanResponderMove: (_, g) => {
      if (g.dy < 0) {
        const progress = Math.max(0, 1 - (-g.dy) / 80);
        hintAnim.setValue(progress);
      }
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy < -28) {
        dismissHint();
      } else {
        Animated.spring(hintAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: false }).start();
        if (hintTimer.current) clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(dismissHint, 2500);
      }
    },
  })).current;

  const appearanceDisabled = !!skinId && !skinId.startsWith('solid_');

  return (
    <Modal visible={visible} animationType="none" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: pal.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: pal.border }]}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={24} color={pal.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: pal.text }]}>{t('settings')}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* ── Appearance ───────────────────────────────────────────────── */}
          {/* Disabled only for premium (non-solid) skins; solid colors allow appearance picks.
              When disabled, the row is still tappable and shows a hint toast. */}
          <View style={{ marginBottom: 12 }}>
            <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('appearance')}</Text>
          </View>
          <View style={[s.appearanceRow, appearanceDisabled ? { opacity: 0.38 } : null]}>
            {(['light', 'dark', 'system'] as Appearance[]).map(mode => {
              const active = appearance === mode;
              const label = t(mode === 'light' ? 'mode_light' : mode === 'dark' ? 'mode_dark' : 'mode_system');
              const icon: IoniconName =
                mode === 'light' ? 'sunny-outline' :
                mode === 'dark'  ? 'moon-outline'  :
                                   'phone-portrait-outline';
              return (
                <TouchableOpacity
                  key={mode}
                  style={[s.appearanceBtn, { backgroundColor: active ? themeColor : pal.chip }]}
                  onPress={() => appearanceDisabled ? showHint() : onPickAppearance(mode)}
                >
                  <Ionicons name={icon} size={18} color={active ? '#fff' : pal.sub} />
                  <Text style={[s.appearanceBtnText, { color: active ? '#fff' : pal.sub }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Pro ──────────────────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          <TouchableOpacity style={styles.removeAdsRow} onPress={() => setProSheetVisible(true)} activeOpacity={0.7}>
            <Ionicons name="star-outline" size={18} color={pal.sub} />
            <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('upgrade_plan')}</Text>
            {isSubscribed && !isPremium && (
              <View style={[styles.proBadge, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                <Text style={[styles.proBadgeText, { color: '#3B82F6' }]}>✓ Basic</Text>
              </View>
            )}
            {isPremium && (
              <View style={[styles.proBadge, { backgroundColor: '#F5C84218', borderColor: '#F5C84244' }]}>
                <Text style={[styles.proBadgeText, { color: '#D97706' }]}>✓ Premium</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={15} color={pal.sub} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.removeAdsRow} onPress={() => setShopVisible(true)} activeOpacity={0.7}>
            <Ionicons name="pricetag-outline" size={18} color={pal.sub} />
            <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('kisekae_shop')}</Text>
            <Ionicons name="chevron-forward" size={15} color={pal.sub} />
          </TouchableOpacity>

          {/* ── Backup ────────────────────────────────────────────────────── */}
          {/* ── Announcements / Language ───────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          <SettingRow icon="megaphone-outline" label={t('announcements')} pal={pal}
            onPress={() => setAnnouncementsVisible(true)} />

          <TouchableOpacity style={styles.removeAdsRow} onPress={() => setLangModalVisible(true)} activeOpacity={0.7}>
            <Ionicons name="language-outline" size={18} color={pal.sub} />
            <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('language')}</Text>
            <Text style={[styles.rowValue, { color: pal.sub }]}>{activeLang.flag}  {activeLang.name}</Text>
            <Ionicons name="chevron-forward" size={15} color={pal.sub} />
          </TouchableOpacity>

          {/* ── Card Behavior ─────────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          <View style={{ marginBottom: 12 }}>
            <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('card_behavior')}</Text>
          </View>
          {isSubscribed && (
            <TouchableOpacity
              style={styles.removeAdsRow}
              onPress={() => setVoicePickerVisible(true)}
              activeOpacity={0.7}
              accessibilityLabel={`${t('feature_ai_voice')}: ${getAIVoiceLabel(aiVoice)}`}
            >
              <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('feature_ai_voice')}</Text>
              <Text style={[styles.rowValue, { color: pal.sub }]}>{getAIVoiceLabel(aiVoice)}</Text>
              <Ionicons name="chevron-forward" size={15} color={pal.sub} />
            </TouchableOpacity>
          )}
          <ToggleRow
            label={t('show_full_card')}
            info={t('show_full_card_info')}
            onShowInfo={setInfoContent}
            value={showFullCard}
            onToggle={onToggleShowFullCard}
            themeColor={themeColor}
            pal={pal}
          />
          <ToggleRow
            label={t('vertical_flip')}
            info={t('vertical_flip_info')}
            onShowInfo={setInfoContent}
            value={verticalFlip}
            onToggle={onToggleVerticalFlip}
            themeColor={themeColor}
            pal={pal}
          />
          <ToggleRow
            label={t('sync_test_results')}
            info={t('sync_test_results_desc')}
            onShowInfo={setInfoContent}
            value={syncTestResults}
            onToggle={onToggleSyncTestResults}
            themeColor={themeColor}
            pal={pal}
          />
          {/* "Hide AI" controls the AI text tools, which are temporarily hidden,
              so the row would have nothing to act on. Rendering nothing at all
              leaves no gap: ToggleRow owns its own spacing. The saved preference
              is deliberately left untouched and applies again when the flag
              returns. */}
          {AI_TEXT_FEATURES_ENABLED && isPremium && (
            <ToggleRow
              label={t('hide_ai_tools')}
              value={hideAiTools}
              onToggle={onToggleHideAiTools}
              themeColor={themeColor}
              pal={pal}
            />
          )}

          {/* ── App Info ─────────────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          <SettingRow icon="information-circle-outline" label={t('app_info')} pal={pal}
            onPress={() => setAppInfoVisible(true)} />

        </ScrollView>
        {!isSubscribed && <AdBannerPlaceholder pal={pal} />}

        <LanguageModal
          visible={langModalVisible}
          onClose={() => setLangModalVisible(false)}
          language={language}
          onPickLanguage={onPickLanguage}
          pal={pal}
          themeColor={themeColor}
        />

        <KisekaeShopSheet
          visible={shopVisible}
          onClose={() => setShopVisible(false)}
          skinId={skinId}
          onPickSkin={onPickSkin}
          isSubscribed={isSubscribed}
          isSubscriptionLoaded={isSubscriptionLoaded}
          pal={pal}
          themeColor={themeColor}
          onUpgrade={() => setProSheetVisible(true)}
        />

        <SettingsInfoPopup
          content={infoContent}
          onClose={() => setInfoContent(null)}
          pal={pal}
          themeColor={themeColor}
        />

        {/* Rendered after the shop so Upgrade overlays Theme Details while the
            selected theme remains mounted underneath. */}
        <ProSheet
          visible={proSheetVisible}
          onClose={() => setProSheetVisible(false)}
          onSubscribe={onSubscribe}
          onSubscribePremium={onSubscribePremium}
          onManageSubscription={onManageSubscription}
          language={language}
          themeColor={themeColor}
          pal={pal}
          isSubscribed={isSubscribed}
          isPremium={isPremium}
          skinId={skinId}
          onPickSkin={onPickSkin}
        />

        <AnnouncementsSheet
          visible={announcementsVisible}
          onClose={() => setAnnouncementsVisible(false)}
          pal={pal}
          language={language}
        />

        <AppInfoSheet
          visible={appInfoVisible}
          onClose={() => setAppInfoVisible(false)}
          pal={pal}
          themeColor={themeColor}
          onRestore={onRestore}
          isSubscribed={isSubscribed}
          isSubscriptionLoaded={isSubscriptionLoaded}
          onDataReplaced={onDataReplaced}
        />

        <VoiceSelectionScreen
          visible={voicePickerVisible}
          onClose={() => setVoicePickerVisible(false)}
          selectedVoice={aiVoice}
          onSelect={onPickAIVoice}
          pal={pal}
          themeColor={themeColor}
        />

        {/* Appearance-disabled hint toast — slides in below the header */}
        {hintShowing && (
          <Animated.View
            style={[
              styles.hintBanner,
              {
                top: insets.top + 56,
                backgroundColor: pal.dialog,
                borderColor: pal.border,
                opacity: hintAnim,
                transform: [{
                  translateY: hintAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-56, 0],
                  }),
                }],
              },
            ]}
            {...hintPan.panHandlers}
          >
            <TouchableOpacity activeOpacity={0.85} onPress={dismissHint} style={styles.hintTouch}>
              <Ionicons name="color-palette-outline" size={16} color={pal.sub} style={{ marginRight: 8 }} />
              <Text style={[styles.hintText, { color: pal.text }]}>{t('appearance_solid_only')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

      </View>
    </Modal>
  );
}

// ── AI voice selection screen ────────────────────────────────────────────────
function VoiceSelectionScreen({
  visible, onClose, selectedVoice, onSelect, pal, themeColor,
}: {
  visible: boolean;
  onClose(): void;
  selectedVoice: AIVoice;
  onSelect(voice: AIVoice): void;
  pal: Palette;
  themeColor: string;
}) {
  const insets = useSafeAreaInsets();
  const t = useLang();
  const [previewingVoice, setPreviewingVoice] = useState<AIVoice | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<AIVoice | null>(null);
  const [activePreviewVoice, setActivePreviewVoice] = useState<AIVoice | null>(null);
  const previewSequence = useRef(0);

  const close = useCallback(() => {
    previewSequence.current++;
    stopPlayback();
    setPreviewingVoice(null);
    setLoadingVoice(null);
    setActivePreviewVoice(null);
    onClose();
  }, [onClose]);

  const preview = useCallback(async (voice: AIVoice) => {
    if (activePreviewVoice === voice) {
      previewSequence.current++;
      stopPlayback();
      setPreviewingVoice(null);
      setLoadingVoice(null);
      setActivePreviewVoice(null);
      return;
    }

    const sequence = ++previewSequence.current;
    setActivePreviewVoice(voice);
    setPreviewingVoice(null);
    setLoadingVoice(null);
    const onPhaseChange = (phase: TTSPlaybackPhase) => {
      if (previewSequence.current !== sequence) return;
      setLoadingVoice(phase === 'generating-or-downloading' ? voice : null);
      setPreviewingVoice(phase === 'playing' ? voice : null);
    };
    try {
      await previewAIVoice(voice, { buttonPressedAtMs: performance.now(), onPhaseChange });
    } catch (error) {
      if (error instanceof Error && error.message === 'cancelled') return;
      const msg = error instanceof Error && error.message === 'plan_required'
        ? t('err_plan_required_speech')
        : t('quota_exceeded_msg');
      Alert.alert(t('ai_voice_unavailable'), msg);
    } finally {
      if (previewSequence.current === sequence) {
        setPreviewingVoice(null);
        setLoadingVoice(null);
        setActivePreviewVoice(null);
      }
    }
  }, [activePreviewVoice, t]);

  useEffect(() => () => {
    previewSequence.current++;
    stopPlayback();
  }, []);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.voiceScreen, { backgroundColor: pal.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { borderBottomColor: pal.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={pal.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: pal.text }]}>{t('feature_ai_voice')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.voiceList}>
        {AI_VOICE_GROUPS.map(group => (
          <View key={group.title} style={styles.voiceCategory}>
            <Text style={[styles.voiceCategoryTitle, { color: pal.sub }]}>{group.title}</Text>
            <View style={styles.voiceCategoryRows}>
              {group.voices.map(voice => {
                const selected = voice === selectedVoice;
                const previewing = voice === previewingVoice;
                const loading = voice === loadingVoice;
                const label = getAIVoiceLabel(voice);
                const description = getAIVoiceDescription(voice);
                return (
                  <TouchableOpacity
                    key={voice}
                    style={[
                      styles.voiceRow,
                      {
                        backgroundColor: selected ? themeColor + '0D' : pal.card,
                        borderColor: selected ? themeColor : pal.border,
                      },
                    ]}
                    onPress={() => {
                      previewSequence.current++;
                      stopPlayback();
                      setPreviewingVoice(null);
                      setLoadingVoice(null);
                      setActivePreviewVoice(null);
                      onSelect(voice);
                    }}
                    activeOpacity={0.75}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${group.title}. ${label}. ${description}`}
                  >
                    <View style={styles.voiceText}>
                      <Text style={[styles.voiceName, { color: selected ? themeColor : pal.text }]}>{label}</Text>
                      <Text style={[styles.voiceDescription, { color: pal.sub }]}>{description}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.previewButton, { backgroundColor: previewing ? themeColor : pal.chip }]}
                      onPress={() => preview(voice)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityLabel={loading ? 'Loading audio' : `Preview ${label}`}
                      accessibilityState={{ busy: loading }}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color={pal.sub} />
                      ) : (
                        <Ionicons
                          name={previewing ? 'stop' : 'play'}
                          size={14}
                          color={previewing ? '#fff' : pal.sub}
                        />
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── App Info sheet ─────────────────────────────────────────────────────────────
function AppInfoSheet({
  visible, onClose, pal, themeColor, onRestore,
  isSubscribed, isSubscriptionLoaded, onDataReplaced,
}: {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
  /** The shared RevenueCat restore handler from useSubscription. */
  onRestore: () => Promise<void>;
  isSubscribed: boolean;
  isSubscriptionLoaded: boolean;
  onDataReplaced: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useLang();
  // Restore lives here rather than on the paywall so it stays reachable for
  // Free, Basic and Premium alike — including a user whose entitlement was
  // misdetected, who is exactly the person who needs it. It is deliberately
  // outside the Backup section and its subscription gate.
  const [restoring, setRestoring] = useState(false);
  // Same entitlement rule the section itself applies, so the heading and its
  // divider can never appear above an empty body.
  const backupVisible = canUseBackup({ isSubscribed, isSubscriptionLoaded });
  const handleRestore = useCallback(async () => {
    // Guard against a second tap while a restore is already in flight.
    if (restoring) return;
    setRestoring(true);
    try {
      // Reuses the existing handler: loading, success, no-purchases-found and
      // error feedback all remain owned by useSubscription.
      await onRestore();
    } finally {
      setRestoring(false);
    }
  }, [onRestore, restoring]);
  const slideX = useRef(new Animated.Value(SW)).current;
  const openExternal = useCallback(async (url: string) => {
    try {
      if (!(await Linking.canOpenURL(url))) throw new Error('unsupported_url');
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('err_title_error'));
    }
  }, [t]);

  useEffect(() => {
    if (visible) {
      slideX.setValue(SW);
      Animated.spring(slideX, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    }
  }, [visible]);

  const dismiss = () => {
    Animated.timing(slideX, { toValue: SW, duration: 220, useNativeDriver: true })
      .start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: pal.bg, paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateX: slideX }] },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: pal.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={pal.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: pal.text }]}>{t('app_info')}</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={{ marginBottom: 12 }}>
          <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('purchases_section')}</Text>
        </View>
        <TouchableOpacity
          style={styles.row}
          onPress={() => { void handleRestore(); }}
          disabled={restoring}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={t('restore_purchases')}
          accessibilityState={{ disabled: restoring, busy: restoring }}
        >
          <Ionicons name="refresh-outline" size={18} color={pal.sub} />
          <Text style={[styles.rowLabel, { color: pal.text }]}>{t('restore_purchases')}</Text>
          {restoring
            ? <ActivityIndicator size="small" color={themeColor} />
            : <Ionicons name="chevron-forward" size={15} color={pal.sub} />}
        </TouchableOpacity>

        {/* Backup & Restore — rendered only for an active Basic or Premium
            entitlement. BackupSection returns null otherwise, so the heading and
            divider are gated on the same check to avoid an empty section. */}
        {backupVisible && (
          <>
            <View style={[styles.divider, { backgroundColor: pal.border }]} />
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('backup')}</Text>
            </View>
            <BackupSection
              pal={pal}
              themeColor={themeColor}
              onDataReplaced={onDataReplaced}
              isSubscribed={isSubscribed}
              isSubscriptionLoaded={isSubscriptionLoaded}
            />
          </>
        )}

        <View style={[styles.divider, { backgroundColor: pal.border }]} />

        <SettingRow icon="document-text-outline" label={t('privacy_policy')} pal={pal}
          onPress={() => void openExternal(PRIVACY_URL)} />
        <SettingRow icon="reader-outline" label={t('terms_of_service')} pal={pal}
          onPress={() => void openExternal(TERMS_URL)} />
        <SettingRow icon="mail-outline" label={t('contact')} pal={pal}
          onPress={() => void openExternal(CONTACT_MAIL)} />
        <SettingRow icon="library-outline" label={t('license')} pal={pal}
          onPress={() => void openExternal(LICENSE_URL)} />
        <SettingRow icon="information-circle-outline" label={t('app_version')}
          value={APP_VERSION} pal={pal} />
      </ScrollView>
    </Animated.View>
  );
}

// ── Settings row ───────────────────────────────────────────────────────────────
function SettingRow({ icon, label, value, onPress, pal }: {
  icon: IoniconName; label: string; value?: string; onPress?: () => void; pal: Palette;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}>
      <Ionicons name={icon} size={18} color={pal.sub} />
      <Text style={[styles.rowLabel, { color: pal.text }]}>{label}</Text>
      {value
        ? <Text style={[styles.rowValue, { color: pal.sub }]}>{value}</Text>
        : <Ionicons name="chevron-forward" size={15} color={pal.sub} />
      }
    </TouchableOpacity>
  );
}

// ── Toggle row ─────────────────────────────────────────────────────────────────
function ToggleRow({ label, info, value, onToggle, onShowInfo, themeColor, pal }: {
  label: string;
  /** Full explanation for the popup. Supplying it renders the information button. */
  info?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  onShowInfo?: (content: { title: string; body: string }) => void;
  themeColor: string;
  pal: Palette;
}) {
  const t = useLang();
  const offTrackColor = getToggleOffTrackColor(pal.bg, pal.border);
  const showInfoButton = info !== undefined && onShowInfo !== undefined;
  return (
    <View style={styles.toggleRow}>
      {/* Title and its information button travel together as one group, so the
          icon reads as belonging to the setting rather than to the switch. The
          group takes the free space; the switch is the only thing on the right,
          which is what keeps all three switches on the same right edge. */}
      <View style={styles.titleAndInfo}>
        <Text style={[styles.toggleLabel, { color: pal.text }]}>{label}</Text>
        {/* Its own 44x44 target, and a separate touchable from the switch: a tap
            on one can never reach the other. VoiceOver order stays label, then
            Info, then the switch. */}
        {showInfoButton && (
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => onShowInfo(({ title: label, body: info }))}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${t('info_button_label')}`}
          >
            <Ionicons name="information-circle-outline" size={20} color={pal.sub} />
          </TouchableOpacity>
        )}
      </View>
      {/* Only the control is compact — the title keeps styles.toggleLabel. */}
      <CompactSwitch
        value={value}
        onValueChange={onToggle}
        accessibilityLabel={label}
        {...(info ? { accessibilityHint: info } : {})}
        themeColor={themeColor}
        offTrackColor={offTrackColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingVertical: 24, paddingBottom: 48 },

  removeAdsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  removeAdsLabel: { flex: 1, fontSize: 15 },
  proBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  proBadgeText: { fontSize: 12, fontWeight: '700' },

  // Settings-only divider spacing. Scoped to this screen and its sub-sheets;
  // Word List, Test Mode and everything else keep their own.
  divider: { height: StyleSheet.hairlineWidth, marginVertical: SETTINGS_DIVIDER_MARGIN },
  infoButton: {
    width: INFO_BUTTON_TARGET,
    height: INFO_BUTTON_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 15 },
  rowValue: { fontSize: 14 },

  voiceScreen: { zIndex: 150 },
  voiceList: { paddingHorizontal: 20, paddingVertical: 20, paddingBottom: 48, gap: 22 },
  voiceCategory: { gap: 9 },
  voiceCategoryTitle: { paddingHorizontal: 2, fontSize: 14, fontWeight: '700' },
  voiceCategoryRows: { gap: 10 },
  voiceRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  voiceText: { flex: 1 },
  voiceName: { fontSize: 16, fontWeight: '600' },
  voiceDescription: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  previewButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  // One shared layout for all three Card Behavior rows. `alignItems: 'center'`
  // puts the title, the information icon and the switch on the same horizontal
  // centre line; the 44pt controls set the row height, so every row is the same
  // height with the same vertical padding and no per-row offsets.
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  titleAndInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  // Deliberately NOT styles.rowLabel: that carries `flex: 1` for the plain
  // Settings rows, where the label is a direct child of a row. Here it used to
  // sit in a column wrapper, where `flex: 1` stretched the Text to the full
  // 44pt row height and rendered the title against its top edge — the upward
  // offset. `flexShrink` keeps a long title from pushing the icon off the row.
  toggleLabel: { fontSize: 15, flexShrink: 1 },

  // Appearance-disabled toast
  hintBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  hintTouch: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  hintText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
