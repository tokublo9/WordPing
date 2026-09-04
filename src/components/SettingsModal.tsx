import { ActivityIndicator, Alert, Animated, Dimensions, Linking, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

import type { Appearance, Palette } from '../types';
import { getToggleOffTrackColor } from '../constants';
import { SUPPORTED_LANGUAGES, useLang, type TranslationKey } from '../i18n';
import { appStyles as s } from '../styles';
import { LEGAL_URLS } from '../config/legalUrls';
import { AdBannerPlaceholder } from './AdBannerPlaceholder';
import { BackupSection } from './BackupSection';
import {
  AI_TEXT_FEATURES_ENABLED,
  FLIP_MODE_ENABLED,
} from '../features/flags';
import { canUseBackup } from '../features/backup/backupAccess';
import { KisekaeShopSheet } from './KisekaeShopSheet';
import type { ThemePurchasesState } from '../hooks/useThemePurchases';
import type { PlanStoreProducts } from '../lib/planPricing';
import { LanguageModal } from './LanguageModal';
import { ProSheet } from './ProSheet';
import { AnnouncementsSheet } from './AnnouncementsSheet';
import { CompactSwitch } from './CompactSwitch';
import { SettingsInfoPopup, type SettingsInfoContent } from './SettingsInfoPopup';
import {
  AI_VOICES,
  getAIVoiceDescription,
  getAIVoiceLabel,
  type AIVoice,
} from '../lib/aiVoices';
import { previewAIVoice, stopPlayback, type TTSPlaybackPhase } from '../lib/tts';
import { isAIRequestError } from '../lib/api/errors';
import { AIConsentDialog } from './AIConsentDialog';
import { AboutAIVoiceDialog } from './AboutAIVoiceDialog';
// Still used by the voice picker's own previews, which are ordinary
// user-content AI requests and stay gated exactly as before.
import { ensureAIConsentForUserAction } from '../lib/aiConsentPrompt';
import { NewFeatureBadge } from './NewFeatureBadge';
import { FEATURE_MARKERS } from '../features/onboarding/featureDiscovery';
import type { FeatureDiscovery } from '../hooks/useFeatureDiscovery';
import {
  buildAiVoiceLimitMessage,
  fillTemplate,
  resolveAiVoiceLimit,
} from '../lib/api/voiceLimitMessage';
import { showTopBanner } from '../lib/topBanner';

const CONTACT_MAIL = 'mailto:daiki.studio9@gmail.com';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const SW = Dimensions.get('window').width;

/**
 * Vertical space above and below every Settings divider. Reduced from 20 so the
 * screen scrolls less, while still reading as separate groups.
 */
export const SETTINGS_DIVIDER_MARGIN = 17;

/** Minimum touch target for the information buttons, per Apple HIG. */
const INFO_BUTTON_TARGET = 44;
/** Shared geometry for the remaining rows in Card Behavior only. */
export const CARD_BEHAVIOR_ROW_HEIGHT = 52;
export const CARD_BEHAVIOR_ROW_VERTICAL_PADDING = 4;
export const CARD_BEHAVIOR_ICON_SIZE = 18;
export const CARD_BEHAVIOR_ICON_WIDTH = 24;
/** Keeps the info glyph secondary without weakening its 44pt touch target. */
export const INFO_ICON_OPACITY = 0.62;
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
  cardViewMode: 'list' | 'flip';
  onChangeCardViewMode: (mode: 'list' | 'flip') => void;
  showFullCard: boolean;
  onToggleShowFullCard: (v: boolean) => void;
  verticalFlip: boolean;
  onToggleVerticalFlip: (v: boolean) => void;
  hideAiTools: boolean;
  onToggleHideAiTools: (v: boolean) => void;
  /**
   * Whether this plan may use the AI features at all.
   *
   * Computed by App from the one entitlement rule (lib/aiEntitlement.ts) rather
   * than re-derived here, and false while RevenueCat is still answering.
   */
  canUseAI: boolean;
  /** Per-feature "!" markers for a newly unlocked plan. */
  discovery: FeatureDiscovery;
  /** Re-read cards and folders after a backup import replaced them. */
  onDataReplaced: () => void;
  /** Theme prices, ownership and the buy action. Resolved once, by App. */
  themePurchases: ThemePurchasesState;
  /** The two subscription products as the store returned them. */
  planProducts: PlanStoreProducts;
}

export function SettingsModal({
  visible, onClose, themeColor, appearance, onPickAppearance,
  skinId, onPickSkin, isSubscribed, isPremium, isSubscriptionLoaded,
  onUpgrade: _onUpgrade,
  onSubscribe, onSubscribePremium, onRestore, onManageSubscription,
  pal, language, onPickLanguage,
  aiVoice, onPickAIVoice,
  cardViewMode, onChangeCardViewMode,
  showFullCard, onToggleShowFullCard,
  verticalFlip, onToggleVerticalFlip,
  hideAiTools, onToggleHideAiTools,
  canUseAI,
  discovery,
  onDataReplaced,
  themePurchases,
  planProducts,
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
  const [aboutAIVoiceVisible, setAboutAIVoiceVisible] = useState(false);
  // Mounted content and native Modal visibility are deliberately separate.
  // The content stays mounted throughout the fade-out and is cleared only once
  // the native dismissal has completed.
  const [infoContent, setInfoContent] = useState<SettingsInfoContent | null>(null);
  const [infoPopupVisible, setInfoPopupVisible] = useState(false);
  const infoPopupClosing = useRef(false);

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

  const activeLang = SUPPORTED_LANGUAGES.find(l => l.code === language) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (visible && canUseAI) return;
    stopPlayback();
    setVoicePickerVisible(false);
  }, [visible, canUseAI]);

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

          <TouchableOpacity
            style={styles.removeAdsRow}
            onPress={() => { discovery.dismiss(FEATURE_MARKERS.themeShop); setShopVisible(true); }}
            activeOpacity={0.7}
          >
            <Ionicons name="pricetag-outline" size={18} color={pal.sub} />
            <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('kisekae_shop')}</Text>
            {/* The row itself is on every plan — the premium skins inside are
                what a subscription unlocks — so the marker is plan-gated even
                though the row is not. */}
            <NewFeatureBadge
              visible={discovery.isNew(FEATURE_MARKERS.themeShop)}
              themeColor={themeColor}
              label={t('new_feature_badge')}
            />
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
          {/* The AI voice picker belongs to High-Quality AI Voice, which is
              Premium. `canUseAI` is that rule; a plan check here could drift
              from it, and a picker for a voice the plan cannot play is only a
              locked feature with a preview button. */}
          {canUseAI && (
            <TouchableOpacity
              style={styles.cardBehaviorRow}
              onPress={() => {
                discovery.dismiss(FEATURE_MARKERS.naturalAIVoice);
                setVoicePickerVisible(true);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('feature_ai_voice')}: ${getAIVoiceLabel(aiVoice)}`}
            >
              <CardBehaviorIcon name="mic-outline" color={pal.sub} />
              <View style={styles.titleAndInfo}>
                <Text style={[styles.toggleLabel, { color: pal.text }]}>{t('feature_ai_voice')}</Text>
                {/* Belongs to the label, not to the row's right edge: its own
                    44x44 target, and a separate touchable, so a tap on it can
                    never open the picker underneath it. */}
                <TouchableOpacity
                  style={styles.infoButton}
                  onPress={event => {
                    event.stopPropagation();
                    showInfoPopup({
                      title: t('voice_pick_info_title'),
                      body: t('voice_pick_info_body'),
                    });
                  }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('feature_ai_voice')}: ${t('info_button_label')}`}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={pal.sub}
                    style={styles.subtleInfoIcon}
                  />
                </TouchableOpacity>
                <NewFeatureBadge
                  visible={discovery.isNew(FEATURE_MARKERS.naturalAIVoice)}
                  themeColor={themeColor}
                  label={t('new_feature_badge')}
                />
              </View>
              <View style={styles.voiceRowControl}>
                <Text style={[styles.rowValue, { color: pal.sub }]}>{getAIVoiceLabel(aiVoice)}</Text>
                <Ionicons name="chevron-forward" size={15} color={pal.sub} />
              </View>
            </TouchableOpacity>
          )}
          {/* Withheld rather than disabled while Word Flip is off: a switch
              that cannot move is a worse answer than no switch. The preference
              itself is untouched, so this row returns as it was. */}
          {FLIP_MODE_ENABLED && (
            <ToggleRow
              icon="albums-outline"
              label={t('view_flip')}
              value={cardViewMode === 'flip'}
              onToggle={enabled => onChangeCardViewMode(enabled ? 'flip' : 'list')}
              themeColor={themeColor}
              pal={pal}
            />
          )}
          <ToggleRow
            icon="reader-outline"
            label={t('show_full_card')}
            info={t('show_full_card_info')}
            onShowInfo={showInfoPopup}
            value={showFullCard}
            onToggle={onToggleShowFullCard}
            themeColor={themeColor}
            pal={pal}
          />
          <ToggleRow
            icon="swap-vertical-outline"
            label={t('vertical_flip')}
            info={t('vertical_flip_info')}
            onShowInfo={showInfoPopup}
            value={verticalFlip}
            onToggle={onToggleVerticalFlip}
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

          {/* ── Help ─────────────────────────────────────────────────────── */}
          {/* About AI Voice is the only entry, and it belongs to a plan that has
              AI Voice, so the heading and its divider are drawn with it rather
              than left standing above nothing. */}
          {canUseAI && (
          <>
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          <View style={{ marginBottom: 12 }}>
            <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('help_section')}</Text>
          </View>
          {/* About AI Voice. `canUseAI` comes from the one entitlement rule and
              is false until RevenueCat has answered, so the row cannot appear
              for a moment and then vanish.

              Opening it dismisses its own marker and nothing else, and grants
              no permission — it is where permission is *withdrawn*, not given. */}
          <SettingRow icon="mic-outline" label={t('ai_voice_info_menu')} pal={pal}
            badge={discovery.isNew(FEATURE_MARKERS.aboutAIVoice)}
            themeColor={themeColor}
            onPress={() => {
              discovery.dismiss(FEATURE_MARKERS.aboutAIVoice);
              setAboutAIVoiceVisible(true);
            }} />
          </>
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
          themePurchases={themePurchases}
        />

        <SettingsInfoPopup
          visible={infoPopupVisible}
          content={infoContent}
          onClose={closeInfoPopup}
          onDismiss={dismissInfoPopup}
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
          planProducts={planProducts}
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
          isPremium={isPremium}
          isSubscriptionLoaded={isSubscriptionLoaded}
          onDataReplaced={onDataReplaced}
        />

        {/* Settings and everything it opens (the voice picker, the Upgrade
            sheet) live inside this modal's own native controller, so the
            consent dialog has to be presented from in here to appear above
            them. Registered only while Settings is actually on screen. */}
        <AboutAIVoiceDialog
          visible={aboutAIVoiceVisible}
          onClose={() => setAboutAIVoiceVisible(false)}
          pal={pal}
          themeColor={themeColor}
        />

        <AIConsentDialog active={visible} pal={pal} themeColor={themeColor} />

        <VoiceSelectionScreen
          visible={voicePickerVisible}
          onClose={() => setVoicePickerVisible(false)}
          selectedVoice={aiVoice}
          onSelect={onPickAIVoice}
          pal={pal}
          themeColor={themeColor}
          language={language}
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


/**
 * Which line a failed voice preview shows.
 *
 * Branches on `AIRequestError.kind`, the precise classification, rather than on
 * the legacy `Error.message`. The old code compared `message === 'plan_required'`
 * and fell back to "quota exceeded" for everything else, which had two
 * consequences: any `subscription_required` — including one from the *server*,
 * for a plan that is now entitled — read as "requires a Premium plan", and every
 * genuine failure (offline, timeout, a service outage) was reported to the user
 * as a quota they had not actually hit.
 *
 * A preview is a fixed, server-authored sentence on the sample route. It spends
 * no lifetime voice credit, so no credit message belongs here.
 */
function previewFailureMessageKey(error: unknown): TranslationKey {
  if (!isAIRequestError(error)) return 'err_generation_failed';
  switch (error.kind) {
    case 'offline':               return 'err_offline';
    case 'timeout':               return 'err_timeout';
    case 'cancelled':             return 'err_cancelled';
    case 'rate_limited':          return 'err_rate_limited';
    case 'usage_limited':         return 'err_usage_limited';
    case 'not_configured':        return 'err_service_not_configured';
    case 'entitlement_unverified': return 'err_entitlement_unverified';
    case 'consent_required':      return 'ai_consent_required_msg';
    // Reachable only from a plan that genuinely has no AI Voice at all. Basic
    // and Premium both do, so for them this now means the *server* refused —
    // which is a service problem, not something the user can fix by upgrading.
    case 'subscription_required': return 'ai_service_unavailable_msg';
    case 'generation_failed':     return 'err_generation_failed';
    default:                      return 'ai_service_unavailable_msg';
  }
}

// ── AI voice selection screen ────────────────────────────────────────────────
function VoiceSelectionScreen({
  visible, onClose, selectedVoice, onSelect, pal, themeColor, language,
}: {
  visible: boolean;
  onClose(): void;
  selectedVoice: AIVoice;
  onSelect(voice: AIVoice): void;
  pal: Palette;
  themeColor: string;
  /** BCP-47 tag, for the usage-limit banner's date and time formatting. */
  language: string;
}) {
  const insets = useSafeAreaInsets();
  const t = useLang();
  const [previewingVoice, setPreviewingVoice] = useState<AIVoice | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<AIVoice | null>(null);
  const [activePreviewVoice, setActivePreviewVoice] = useState<AIVoice | null>(null);
  const previewSequence = useRef(0);

  /**
   * The choice being browsed, committed only on the way out.
   *
   * Saving on every row tap looked free but was not: the TTS cache is keyed by
   * voice, so App's preload effect re-generates the whole word library each time
   * `aiVoice` changes. Every comparison the user made cost a full sweep for a
   * voice they did not keep. Holding the choice locally means the sweep runs
   * once, for the voice actually chosen — and not at all if they land back on
   * the one they arrived with.
   */
  const [draftVoice, setDraftVoice] = useState<AIVoice>(selectedVoice);

  // Re-sync on open rather than in an effect: an effect would paint the previous
  // session's highlight for a frame first. Same idiom as BulkImportModal.
  const [renderedVisible, setRenderedVisible] = useState(visible);
  if (visible !== renderedVisible) {
    setRenderedVisible(visible);
    if (visible) setDraftVoice(selectedVoice);
  }

  const close = useCallback(() => {
    previewSequence.current++;
    stopPlayback();
    setPreviewingVoice(null);
    setLoadingVoice(null);
    setActivePreviewVoice(null);
    // Leaving the screen is the confirmation. Only a real change is published,
    // so backing out without picking anything cannot trigger a library sweep.
    if (draftVoice !== selectedVoice) onSelect(draftVoice);
    onClose();
  }, [draftVoice, onClose, onSelect, selectedVoice]);

  const preview = useCallback(async (voice: AIVoice) => {
    if (activePreviewVoice === voice) {
      previewSequence.current++;
      stopPlayback();
      setPreviewingVoice(null);
      setLoadingVoice(null);
      setActivePreviewVoice(null);
      return;
    }

    // Previews are generated by OpenAI like any other AI voice, so the same
    // permission applies here as on a word card.
    if (!await ensureAIConsentForUserAction()) return;

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
      // A usage limit hit from the voice picker gets the same non-blocking banner
      // as one hit from a card, so the two entry points do not disagree.
      const limit = isAIRequestError(error) ? resolveAiVoiceLimit(error, Date.now()) : null;
      if (limit) {
        const { key, values } = buildAiVoiceLimitMessage(limit, language);
        showTopBanner({ id: `voice-limit:${key}`, message: fillTemplate(t(key), values) });
        return;
      }
      Alert.alert(t('ai_voice_unavailable'), t(previewFailureMessageKey(error)));
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // The backdrop, the Done button and Android back all land on close(), so
      // no way out of the popup can skip publishing the draft.
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.voiceBackdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <View
          style={[
            styles.voiceDialog,
            {
              backgroundColor: pal.dialog,
              borderColor: pal.border,
              // Centred, but it can still grow with Dynamic Type, so it keeps
              // clear of a notch and a home bar.
              marginTop: insets.top + 24,
              marginBottom: insets.bottom + 24,
            },
          ]}
          accessibilityViewIsModal
        >
          <Text
            style={[styles.voiceDialogTitle, { color: pal.text }]}
            accessibilityRole="header"
          >
            {t('feature_ai_voice')}
          </Text>

          {/* Two voices, listed flat. The old category headings described a set
              of eight; over two they only named each row twice. */}
          <ScrollView
            style={styles.voiceDialogScroll}
            contentContainerStyle={styles.voiceCategoryRows}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {AI_VOICES.map(voice => {
              // The highlight follows the draft, so the popup reflects what
              // the user is considering rather than what is saved.
              const selected = voice === draftVoice;
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
                  // Selection only — never onSelect, and never a generation.
                  // The choice is published once, by close().
                  onPress={() => {
                    previewSequence.current++;
                    stopPlayback();
                    setPreviewingVoice(null);
                    setLoadingVoice(null);
                    setActivePreviewVoice(null);
                    setDraftVoice(voice);
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${label}. ${description}`}
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
          </ScrollView>

          <TouchableOpacity
            style={[styles.voiceDoneButton, { backgroundColor: themeColor }]}
            onPress={close}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Text style={styles.voiceDoneLabel}>{t('close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── App Info sheet ─────────────────────────────────────────────────────────────
function AppInfoSheet({
  visible, onClose, pal, themeColor, onRestore,
  isPremium, isSubscriptionLoaded, onDataReplaced,
}: {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
  /** The shared RevenueCat restore handler from useSubscription. */
  onRestore: () => Promise<void>;
  isPremium: boolean;
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
  const backupVisible = canUseBackup({ isPremium, isSubscriptionLoaded });
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

        {/* Backup & Restore — rendered only for an active Premium
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
              isPremium={isPremium}
              isSubscriptionLoaded={isSubscriptionLoaded}
            />
          </>
        )}

        <View style={[styles.divider, { backgroundColor: pal.border }]} />

        <SettingRow icon="document-text-outline" label={t('privacy_policy')} pal={pal}
          onPress={() => void openExternal(LEGAL_URLS.privacy)} />
        <SettingRow icon="reader-outline" label={t('terms_of_service')} pal={pal}
          onPress={() => void openExternal(LEGAL_URLS.terms)} />
        <SettingRow icon="mail-outline" label={t('contact')} pal={pal}
          onPress={() => void openExternal(CONTACT_MAIL)} />
        <SettingRow icon="library-outline" label={t('license')} pal={pal}
          onPress={() => void openExternal(LEGAL_URLS.licenses)} />
        <SettingRow icon="information-circle-outline" label={t('app_version')}
          value={APP_VERSION} pal={pal} />
      </ScrollView>
    </Animated.View>
  );
}

// ── Settings row ───────────────────────────────────────────────────────────────
function SettingRow({ icon, label, value, onPress, badge, themeColor, pal }: {
  icon: IoniconName; label: string; value?: string;
  onPress?: () => void;
  /** Draws the "New feature" marker beside the label. */
  badge?: boolean;
  themeColor?: string;
  pal: Palette;
}) {
  const t = useLang();
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}>
      <Ionicons name={icon} size={18} color={pal.sub} />
      <Text style={[styles.rowLabel, { color: pal.text }]}>{label}</Text>
      <NewFeatureBadge
        visible={badge === true}
        themeColor={themeColor ?? pal.text}
        label={t('new_feature_badge')}
      />
      {value
        ? <Text style={[styles.rowValue, { color: pal.sub }]}>{value}</Text>
        : <Ionicons name="chevron-forward" size={15} color={pal.sub} />
      }
    </TouchableOpacity>
  );
}

// ── Toggle row ─────────────────────────────────────────────────────────────────
function CardBehaviorIcon({ name, color }: { name: IoniconName; color: string }) {
  return (
    <View style={styles.cardBehaviorIconColumn}>
      <Ionicons name={name} size={CARD_BEHAVIOR_ICON_SIZE} color={color} />
    </View>
  );
}

function ToggleRow({ icon, label, info, value, onToggle, onShowInfo, themeColor, pal }: {
  icon?: IoniconName;
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
    <View style={icon ? styles.cardBehaviorRow : styles.toggleRow}>
      {icon && <CardBehaviorIcon name={icon} color={pal.sub} />}
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
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={pal.sub}
              style={styles.subtleInfoIcon}
            />
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
  subtleInfoIcon: { opacity: INFO_ICON_OPACITY },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 15 },
  rowValue: { fontSize: 14 },

  voiceBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  voiceDialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  voiceDialogTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  // Scrolls rather than clips if the largest Dynamic Type sizes make two rows
  // taller than the dialog.
  voiceDialogScroll: { flexGrow: 0 },
  voiceDoneButton: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  voiceDoneLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
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

  // Shared only by the four Card Behavior rows. The 44pt controls fit inside a
  // 52pt row, reducing inter-row whitespace without shrinking any touch target.
  cardBehaviorRow: {
    minHeight: CARD_BEHAVIOR_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: CARD_BEHAVIOR_ROW_VERTICAL_PADDING,
    gap: 8,
  },
  // Retained for the currently hidden Hide AI Tools row, so this task changes
  // only the four named Card Behavior rows.
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  cardBehaviorIconColumn: {
    width: CARD_BEHAVIOR_ICON_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleAndInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  voiceRowControl: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  // Deliberately NOT styles.rowLabel: that carries `flex: 1` for the plain
  // Settings rows, where the label is a direct child of a row. Here it used to
  // sit in a column wrapper, where `flex: 1` stretched the Text to the full
  // 44pt row height and rendered the title against its top edge — the upward
  // offset. `flexShrink` keeps a long title from pushing the icon off the row.
  toggleLabel: { fontSize: 15, lineHeight: 20, flexShrink: 1, flexWrap: 'wrap' },

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
