import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useState } from 'react';

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

interface Props {
  visible: boolean;
  onClose: () => void;
  themeColor: string;
  appearance: Appearance;
  onPickAppearance: (mode: Appearance) => void;
  skinId: string | null;
  onPickSkin: (id: string | null) => void;
  isSubscribed: boolean;
  onUpgrade: () => void;
  onSubscribe: () => Promise<void>;
  onRestore: () => Promise<void>;
  /** DEV ONLY: forwarded to ProSheet to override the Manage Subscription button. */
  onManageSubscription?: () => void;
  pal: Palette;
  language: string;
  onPickLanguage: (code: string) => void;
}

export function SettingsModal({
  visible, onClose, themeColor, appearance, onPickAppearance,
  skinId, onPickSkin, isSubscribed, onUpgrade: _onUpgrade,
  onSubscribe, onRestore, onManageSubscription, pal, language, onPickLanguage,
}: Props) {
  void _onUpgrade; // kept in Props API for caller convenience; shop uses proSheetVisible directly
  const insets = useSafeAreaInsets();
  const t = useLang();
  const [proSheetVisible, setProSheetVisible]     = useState(false);
  const [shopVisible,     setShopVisible]         = useState(false);
  const [langModalVisible, setLangModalVisible]   = useState(false);
  const [tutorialVisible, setTutorialVisible]     = useState(false);

  const activeLang = SUPPORTED_LANGUAGES.find(l => l.code === language) ?? SUPPORTED_LANGUAGES[0];

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
          {/* Disabled only for premium (non-solid) skins; solid colors allow appearance picks. */}
          {(() => {
            const appearanceDisabled = !!skinId && !skinId.startsWith('solid_');
            return (
              <>
                <View style={{ marginBottom: 12, marginTop: 24 }}>
                  <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('appearance')}</Text>
                </View>
                <View style={[s.appearanceRow, appearanceDisabled ? { opacity: 0.38 } : null]} pointerEvents={appearanceDisabled ? 'none' : 'auto'}>
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
                  onPress={() => onPickAppearance(mode)}
                >
                  <Ionicons name={icon as any} size={18} color={active ? '#fff' : pal.sub} />
                  <Text style={[s.appearanceBtnText, { color: active ? '#fff' : pal.sub }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
                </View>
              </>
            );
          })()}

          {/* ── Pro ──────────────────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          <TouchableOpacity style={styles.removeAdsRow} onPress={() => setProSheetVisible(true)} activeOpacity={0.7}>
            <Ionicons name="star-outline" size={18} color={pal.sub} />
            <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('basic')}</Text>
            {isSubscribed && (
              <View style={[styles.proBadge, { backgroundColor: '#22c55e18', borderColor: '#22c55e44' }]}>
                <Text style={[styles.proBadgeText, { color: '#22c55e' }]}>✓ Active</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={15} color={pal.sub} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.removeAdsRow} onPress={() => setShopVisible(true)} activeOpacity={0.7}>
            <Ionicons name="pricetag-outline" size={18} color={pal.sub} />
            <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('kisekae_shop')}</Text>
            <Ionicons name="chevron-forward" size={15} color={pal.sub} />
          </TouchableOpacity>

          {/* ── Language ─────────────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          <SettingRow icon="help-circle-outline" label={t('how_to_use')} pal={pal}
            onPress={() => setTutorialVisible(true)} />

          <TouchableOpacity style={styles.removeAdsRow} onPress={() => setLangModalVisible(true)} activeOpacity={0.7}>
            <Ionicons name="language-outline" size={18} color={pal.sub} />
            <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('language')}</Text>
            <Text style={[styles.rowValue, { color: pal.sub }]}>{activeLang.flag}  {activeLang.name}</Text>
            <Ionicons name="chevron-forward" size={15} color={pal.sub} />
          </TouchableOpacity>

          {/* ── Links ────────────────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

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
        {!isSubscribed && <AdBannerPlaceholder pal={pal} />}

        <LanguageModal
          visible={langModalVisible}
          onClose={() => setLangModalVisible(false)}
          language={language}
          onPickLanguage={onPickLanguage}
          pal={pal}
          themeColor={themeColor}
        />

        <ProSheet
          visible={proSheetVisible}
          onClose={() => setProSheetVisible(false)}
          onSubscribe={onSubscribe}
          onRestore={onRestore}
          onManageSubscription={onManageSubscription}
          themeColor={themeColor}
          pal={pal}
          isSubscribed={isSubscribed}
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

        <TutorialModal
          visible={tutorialVisible}
          onClose={() => setTutorialVisible(false)}
          pal={pal}
          themeColor={themeColor}
        />

      </View>
    </Modal>
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
});
