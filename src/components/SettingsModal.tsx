import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useState } from 'react';

import type { Appearance, Palette/*, ThemeSkin*/ } from '../types';
import { /*SKINS,*/ THEME_COLORS } from '../constants';
import { SUPPORTED_LANGUAGES, useLang } from '../i18n';
import { appStyles as s } from '../styles';
import { AdBannerPlaceholder } from './AdBannerPlaceholder';
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
  onPickTheme: (color: string) => void;
  appearance: Appearance;
  onPickAppearance: (mode: Appearance) => void;
  skinId: string | null;
  onPickSkin: (id: string | null) => void;
  isSubscribed: boolean;
  onUpgrade: () => void;
  onSubscribe: () => Promise<void>;
  onRestore: () => Promise<void>;
  pal: Palette;
  language: string;
  onPickLanguage: (code: string) => void;
}

export function SettingsModal({
  visible, onClose, themeColor, onPickTheme, appearance, onPickAppearance,
  skinId: _skinId, onPickSkin: _onPickSkin, isSubscribed, onUpgrade: _onUpgrade,
  onSubscribe, onRestore, pal, language, onPickLanguage,
}: Props) {
  const insets = useSafeAreaInsets();
  const t = useLang();
  const [proSheetVisible, setProSheetVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);

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

          {/* ── Skins (Pro) — temporarily hidden; re-enable when ready ──────
          <View style={styles.sectionHeader}>
            <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>Skins</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.skinRow}>
            <SkinCard skin={null} isSelected={!skinActive} accentColor={themeColor} pal={pal} locked={false} onPress={() => onPickSkin(null)} />
            {SKINS.map(skin => (
              <SkinCard key={skin.id} skin={skin} isSelected={skinId === skin.id} accentColor={skin.themeColor}
                pal={pal} locked={!isSubscribed} onPress={() => isSubscribed ? onPickSkin(skin.id) : onUpgrade()} />
            ))}
          </ScrollView>
          ── end skins ── */}

          {/* ── Theme Color ──────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('theme_color')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
            {THEME_COLORS.filter(color => !!color?.value).map(color => {
              const isActive = themeColor === color.value;
              return (
                <TouchableOpacity
                  key={color.value}
                  style={s.colorItem}
                  onPress={() => onPickTheme(color.value)}
                >
                  <View style={[
                    s.colorSwatch,
                    { backgroundColor: color.value ?? '#7C6BF8', opacity: isActive ? 1 : 0.45 },
                    isActive ? s.colorSwatchSelected : undefined,
                  ]}>
                    {isActive && <Ionicons name="checkmark" size={24} color="#fff" />}
                  </View>
                  <Text style={[s.colorName, { color: pal.sub }]}>{color.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── Appearance ───────────────────────────────────────────────── */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <Text style={[s.sectionLabel, { color: pal.sub, marginBottom: 0 }]}>{t('appearance')}</Text>
          </View>
          <View style={s.appearanceRow}>
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

          {/* ── Upgrade to Pro (re-enable with skins) ────────────────────────
          <View style={[styles.divider, { backgroundColor: pal.border }]} />
          {!isSubscribed && (
            <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: themeColor }]} onPress={onUpgrade}>
              <Ionicons name="star" size={16} color="#fff" />
              <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          )}
          ── end upgrade ── */}

          {/* ── Pro ──────────────────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: pal.border }]} />

          {!isSubscribed && (
            <TouchableOpacity style={styles.removeAdsRow} onPress={() => setProSheetVisible(true)} activeOpacity={0.7}>
              <Ionicons name="close-circle-outline" size={18} color={pal.sub} />
              <Text style={[styles.removeAdsLabel, { color: pal.text }]}>{t('remove_ads')}</Text>
              <Ionicons name="chevron-forward" size={15} color={pal.sub} />
            </TouchableOpacity>
          )}

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
        <AdBannerPlaceholder pal={pal} />

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
          themeColor={themeColor}
          pal={pal}
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

// ── Skin card (kept for when skins are re-enabled) ────────────────────────────
// function SkinCard({ skin, isSelected, accentColor, pal, locked, onPress }: {
//   skin: ThemeSkin | null; isSelected: boolean; accentColor: string;
//   pal: Palette; locked: boolean; onPress: () => void;
// }) {
//   const bg      = skin ? skin.palette.card : pal.chip;
//   const outerBg = skin ? skin.palette.bg   : pal.bg;
//   return (
//     <TouchableOpacity style={styles.skinItem} onPress={onPress} activeOpacity={0.75}>
//       <View style={[styles.skinPreview, { backgroundColor: outerBg, borderColor: isSelected ? accentColor : 'transparent', borderWidth: 2 }]}>
//         <View style={[styles.skinMiniCard, { backgroundColor: bg }]}>
//           <Text style={styles.skinEmoji}>{skin ? skin.emoji : '🎨'}</Text>
//         </View>
//         {locked && (
//           <View style={styles.skinLock}><Ionicons name="lock-closed" size={11} color="#fff" /></View>
//         )}
//       </View>
//       <Text style={[styles.skinName, { color: isSelected ? accentColor : pal.sub }]} numberOfLines={1}>
//         {skin ? skin.name : 'Default'}
//       </Text>
//     </TouchableOpacity>
//   );
// }

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

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },

  // skinRow: { gap: 10, paddingBottom: 4 },
  colorRow: { gap: 14, paddingBottom: 4 },

  // skinItem: { alignItems: 'center', width: 68 },
  // skinPreview: { width: 64, height: 72, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // skinMiniCard: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  // skinEmoji: { fontSize: 22 },
  // skinLock: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // skinName: { fontSize: 11, fontWeight: '500', marginTop: 5, textAlign: 'center' },

  removeAdsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  removeAdsLabel: { flex: 1, fontSize: 15 },

  divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
  // upgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 4 },
  // upgradeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 15 },
  rowValue: { fontSize: 14 },
});
