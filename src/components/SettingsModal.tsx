import { Animated, Dimensions, Linking, Modal, PanResponder, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Appearance, Palette } from '../types';
import { SUPPORTED_LANGUAGES, useLang } from '../i18n';
import { appStyles as s } from '../styles';
import { AdBannerPlaceholder } from './AdBannerPlaceholder';
import { KisekaeShopSheet } from './KisekaeShopSheet';
import { LanguageModal } from './LanguageModal';
import { ProSheet } from './ProSheet';
import { TutorialModal } from './TutorialModal';

// TODO: replace with real URLs before release
const PRIVACY_URL  = 'https://wordping.app/privacy';
const TERMS_URL    = 'https://wordping.app/terms';
const CONTACT_MAIL = 'mailto:tokumoto.daiki.0219@gmail.com';
const LICENSE_URL  = 'https://wordping.app/license';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const SW = Dimensions.get('window').width;

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
  onUpgrade: () => void;
  onSubscribe: () => Promise<void>;
  onSubscribePremium: () => Promise<void>;
  onRestore: () => Promise<void>;
  /** DEV ONLY: forwarded to ProSheet to override the Manage Subscription button. */
  onManageSubscription?: () => void;
  pal: Palette;
  language: string;
  onPickLanguage: (code: string) => void;
  showFullCard: boolean;
  onToggleShowFullCard: (v: boolean) => void;
  verticalFlip: boolean;
  onToggleVerticalFlip: (v: boolean) => void;
  hideAiTools: boolean;
  onToggleHideAiTools: (v: boolean) => void;
}

export function SettingsModal({
  visible, onClose, themeColor, appearance, onPickAppearance,
  skinId, onPickSkin, isSubscribed, isPremium, onUpgrade: _onUpgrade,
  onSubscribe, onSubscribePremium, onRestore, onManageSubscription, pal, language, onPickLanguage,
  showFullCard, onToggleShowFullCard,
  verticalFlip, onToggleVerticalFlip,
  hideAiTools, onToggleHideAiTools,
}: Props) {
  void _onUpgrade; // kept in Props API for caller convenience; shop uses proSheetVisible directly
  const insets = useSafeAreaInsets();
  const t = useLang();
  const [proSheetVisible,  setProSheetVisible]  = useState(false);
  const [shopVisible,      setShopVisible]      = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [tutorialVisible,  setTutorialVisible]  = useState(false);
  const [appInfoVisible,   setAppInfoVisible]   = useState(false);

  const activeLang = SUPPORTED_LANGUAGES.find(l => l.code === language) ?? SUPPORTED_LANGUAGES[0];

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
          <View style={{ marginBottom: 12, marginTop: 24 }}>
            <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('appearance')}</Text>
          </View>
          <View style={[s.appearanceRow, appearanceDisabled ? { opacity: 0.38 } : null]}>
            {(['light', 'dark', 'system'] as Appearance[]).map(mode => {
              const active = appearance === mode;
              const label = t(mode === 'light' ? 'mode_light' : mode === 'dark' ? 'mode_dark' : 'mode_system');
              const icon =
                mode === 'light' ? 'sunny-outline' :
                mode === 'dark'  ? 'moon-outline'  :
                                   'phone-portrait-outline';
              return (
                <TouchableOpacity
                  key={mode}
                  style={[s.appearanceBtn, { backgroundColor: active ? themeColor : pal.chip }]}
                  onPress={() => appearanceDisabled ? showHint() : onPickAppearance(mode)}
                >
                  <Ionicons name={icon as any} size={18} color={active ? '#fff' : pal.sub} />
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

          {/* ── Announcements / How to use / Language ──────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          <SettingRow icon="megaphone-outline" label={t('announcements')} pal={pal} />

          <SettingRow icon="help-circle-outline" label={t('how_to_use')} pal={pal}
            onPress={() => setTutorialVisible(true)} />

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
          <ToggleRow
            label={t('show_full_card')}
            description={t('show_full_card_desc')}
            value={showFullCard}
            onToggle={onToggleShowFullCard}
            themeColor={themeColor}
            pal={pal}
          />
          <ToggleRow
            label={t('vertical_flip')}
            description={t('vertical_flip_desc')}
            value={verticalFlip}
            onToggle={onToggleVerticalFlip}
            themeColor={themeColor}
            pal={pal}
          />
          {isPremium && (
            <ToggleRow
              label={t('hide_ai_tools')}
              description={t('hide_ai_tools_desc')}
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
          pal={pal}
          themeColor={themeColor}
          onUpgrade={() => setProSheetVisible(true)}
        />

        {/* Rendered after the shop so Upgrade overlays Theme Details while the
            selected theme remains mounted underneath. */}
        <ProSheet
          visible={proSheetVisible}
          onClose={() => setProSheetVisible(false)}
          onSubscribe={onSubscribe}
          onSubscribePremium={onSubscribePremium}
          onRestore={onRestore}
          onManageSubscription={onManageSubscription}
          themeColor={themeColor}
          pal={pal}
          isSubscribed={isSubscribed}
          isPremium={isPremium}
          skinId={skinId}
          onPickSkin={onPickSkin}
        />

        <TutorialModal
          visible={tutorialVisible}
          onClose={() => setTutorialVisible(false)}
          pal={pal}
          themeColor={themeColor}
        />

        <AppInfoSheet visible={appInfoVisible} onClose={() => setAppInfoVisible(false)} pal={pal} />

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

// ── App Info sheet ─────────────────────────────────────────────────────────────
function AppInfoSheet({ visible, onClose, pal }: { visible: boolean; onClose: () => void; pal: Palette }) {
  const insets = useSafeAreaInsets();
  const t = useLang();
  const slideX = useRef(new Animated.Value(SW)).current;

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
        <SettingRow icon="document-text-outline" label={t('privacy_policy')} pal={pal}
          onPress={() => Linking.openURL(PRIVACY_URL)} />
        <SettingRow icon="reader-outline" label={t('terms_of_service')} pal={pal}
          onPress={() => Linking.openURL(TERMS_URL)} />
        <SettingRow icon="mail-outline" label={t('contact')} pal={pal}
          onPress={() => Linking.openURL(CONTACT_MAIL)} />
        <SettingRow icon="library-outline" label={t('license')} pal={pal}
          onPress={() => Linking.openURL(LICENSE_URL)} />
        <SettingRow icon="information-circle-outline" label={t('app_version')}
          value={APP_VERSION} pal={pal} />
      </ScrollView>
    </Animated.View>
  );
}

// ── Settings row ───────────────────────────────────────────────────────────────
function SettingRow({ icon, label, value, onPress, pal }: {
  icon: string; label: string; value?: string; onPress?: () => void; pal: Palette;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}>
      <Ionicons name={icon as any} size={18} color={pal.sub} />
      <Text style={[styles.rowLabel, { color: pal.text }]}>{label}</Text>
      {value
        ? <Text style={[styles.rowValue, { color: pal.sub }]}>{value}</Text>
        : <Ionicons name="chevron-forward" size={15} color={pal.sub} />
      }
    </TouchableOpacity>
  );
}

// ── Toggle row ─────────────────────────────────────────────────────────────────
function ToggleRow({ label, description, value, onToggle, themeColor, pal }: {
  label: string; description: string; value: boolean;
  onToggle: (v: boolean) => void; themeColor: string; pal: Palette;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.rowLabel, { color: pal.text }]}>{label}</Text>
        <Text style={[styles.toggleDesc, { color: pal.sub }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: pal.chip, true: themeColor + '88' }}
        thumbColor={value ? themeColor : pal.sub}
        ios_backgroundColor={pal.chip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingVertical: 24, paddingBottom: 48 },

  removeAdsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  removeAdsLabel: { flex: 1, fontSize: 15 },
  proBadge: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  proBadgeText: { fontSize: 12, fontWeight: '700' },

  divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 15 },
  rowValue: { fontSize: 14 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  toggleText: { flex: 1 },
  toggleDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },

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
