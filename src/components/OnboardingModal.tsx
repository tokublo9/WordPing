import { Animated, Image, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLang } from '../i18n';
import type { TranslationKey } from '../i18n';
import type { OnboardingChoices, Palette } from '../types';

// ── Dev flag ──────────────────────────────────────────────────────────────────
// Set to true to show onboarding on every launch (only takes effect in __DEV__).
// Flip back to false before shipping.
export const FORCE_SHOW_ONBOARDING = false;

// ── Category list ─────────────────────────────────────────────────────────────

const OB_CATEGORIES = [
  { id: 'school',   icon: '📚', titleKey: 'ob_cat_school',   descKey: 'ob_cat_school_desc'   },
  { id: 'work',     icon: '💼', titleKey: 'ob_cat_work',     descKey: 'ob_cat_work_desc'     },
  { id: 'general',  icon: '🧠', titleKey: 'ob_cat_general',  descKey: 'ob_cat_general_desc'  },
  { id: 'law',      icon: '⚖️', titleKey: 'ob_cat_law',      descKey: 'ob_cat_law_desc'      },
  { id: 'personal', icon: '📝', titleKey: 'ob_cat_personal', descKey: 'ob_cat_personal_desc' },
  { id: 'other',    icon: '📦', titleKey: 'ob_cat_other',    descKey: null                   },
] as const satisfies ReadonlyArray<{
  id: string;
  icon: string;
  titleKey: TranslationKey;
  descKey: TranslationKey | null;
}>;

const OB_GENDERS = [
  { id: 'woman',             icon: 'female-outline', labelKey: 'ob_gender_woman' },
  { id: 'man',               icon: 'male-outline', labelKey: 'ob_gender_man' },
  { id: 'non_binary',        icon: 'male-female-outline', labelKey: 'ob_gender_non_binary' },
  { id: 'prefer_not_to_say', icon: 'remove-outline', labelKey: 'ob_gender_no_answer' },
] as const satisfies ReadonlyArray<{
  id: OnboardingChoices['gender'];
  icon: ComponentProps<typeof Ionicons>['name'];
  labelKey: TranslationKey;
}>;

const OB_DISCOVERY_SOURCES = [
  { id: 'app_store',     icon: 'storefront-outline', labelKey: 'ob_source_app_store' },
  { id: 'social_media',  icon: 'share-social-outline', labelKey: 'ob_source_social' },
  { id: 'friend_family', icon: 'people-outline', labelKey: 'ob_source_friend' },
  { id: 'web_search',    icon: 'search-outline', labelKey: 'ob_source_search' },
  { id: 'advertisement', icon: 'megaphone-outline', labelKey: 'ob_source_ad' },
  { id: 'other',         icon: 'ellipsis-horizontal', labelKey: 'ob_cat_other' },
] as const satisfies ReadonlyArray<{
  id: OnboardingChoices['discoverySource'];
  icon: ComponentProps<typeof Ionicons>['name'];
  labelKey: TranslationKey;
}>;

const MIN_BIRTH_DATE = new Date(1900, 0, 1);
const MAX_BIRTH_DATE = new Date();
const DEFAULT_BIRTH_DATE = (() => {
  const value = new Date();
  value.setFullYear(value.getFullYear() - 18);
  return value;
})();

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Language list ─────────────────────────────────────────────────────────────

const OB_LANGUAGES = [
  { code: 'en-US', flag: '🇺🇸', label: 'English' },
  { code: 'es-ES', flag: '🇪🇸', label: 'Español' },
  { code: 'fr-FR', flag: '🇫🇷', label: 'Français' },
  { code: 'ja-JP', flag: '🇯🇵', label: '日本語' },
  { code: 'ko-KR', flag: '🇰🇷', label: '한국어' },
  { code: 'zh-CN', flag: '🇨🇳', label: '中文 (简体)' },
  { code: 'de-DE', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'it-IT', flag: '🇮🇹', label: 'Italiano' },
  { code: 'pt-BR', flag: '🇧🇷', label: 'Português (BR)' },
  { code: 'ru-RU', flag: '🇷🇺', label: 'Русский' },
  { code: 'ar',    flag: '🇸🇦', label: 'العربية' },
  { code: 'hi-IN', flag: '🇮🇳', label: 'हिन्दी' },
  { code: 'tr-TR', flag: '🇹🇷', label: 'Türkçe' },
  { code: 'nl-NL', flag: '🇳🇱', label: 'Nederlands' },
  { code: 'vi-VN', flag: '🇻🇳', label: 'Tiếng Việt' },
  { code: 'th-TH', flag: '🇹🇭', label: 'ภาษาไทย' },
  { code: 'id-ID', flag: '🇮🇩', label: 'Bahasa Indonesia' },
  { code: 'pl-PL', flag: '🇵🇱', label: 'Polski' },
  { code: 'el-GR', flag: '🇬🇷', label: 'Ελληνικά' },
  { code: 'sv-SE', flag: '🇸🇪', label: 'Svenska' },
  { code: 'other', flag: '🌐', label: 'Other' },
];

// ── Language picker ───────────────────────────────────────────────────────────

interface LangPickerProps {
  selected: string | null;
  onSelect: (code: string) => void;
  pal: Palette;
  themeColor: string;
}

function LangPicker({ selected, onSelect, pal, themeColor }: LangPickerProps) {
  return (
    <View style={ob.langList}>
      {OB_LANGUAGES.map(lang => {
        const active = lang.code === selected;
        const isOther = lang.code === 'other';
        return (
          <TouchableOpacity
            key={lang.code}
            onPress={() => onSelect(lang.code)}
            style={[
              ob.langChip,
              {
                borderColor:     active ? themeColor : pal.border,
                backgroundColor: active ? themeColor + '18' : pal.chip,
              },
            ]}
          >
            <Text style={ob.langFlag}>{lang.flag}</Text>
            <Text
              style={[ob.langLabel, { color: active ? themeColor : isOther ? pal.sub : pal.text }]}
              numberOfLines={1}
            >
              {lang.label}
            </Text>
            {active && <Ionicons name="checkmark-circle" size={16} color={themeColor} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  pal: Palette;
  themeColor: string;
  onComplete: (choices: OnboardingChoices) => void;
}

export function OnboardingModal({ visible, pal, themeColor, onComplete }: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();

  // step 1 = purpose
  // step 2 = profile details
  // step 3 = lang picker (language path: learn lang / words path: explanation lang)
  // step 4 = lang picker (language path: explanation lang) OR category picker (words path)
  const [step,         setStep]         = useState<1 | 2 | 3 | 4>(1);
  const [purpose,      setPurpose]      = useState<'language' | 'words' | null>(null);
  const [gender,       setGender]       = useState<OnboardingChoices['gender'] | null>(null);
  const [birthDate,    setBirthDate]    = useState<Date | null>(null);
  const [draftBirthDate, setDraftBirthDate] = useState(() => new Date(DEFAULT_BIRTH_DATE));
  const [birthPickerVisible, setBirthPickerVisible] = useState(false);
  const [discovery,    setDiscovery]    = useState<OnboardingChoices['discoverySource'] | null>(null);
  const [learningLang, setLearningLang] = useState<string | null>(null);
  const [nativeLang,   setNativeLang]   = useState<string | null>(null);
  const [wordCategory, setWordCategory] = useState<string | null>(null);

  // Progress bar — counts steps 2–4 (step 1 is the Welcome screen, not a flow step).
  // progressAnim value: 0 (hidden) → 1 (33%) → 2 (67%) → 3 (100%).
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (step === 1) return;
    Animated.timing(progressAnim, {
      toValue: step - 1,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const reset = () => {
    progressAnim.setValue(0);
    setStep(1);
    setPurpose(null);
    setGender(null);
    setBirthDate(null);
    setDraftBirthDate(new Date(DEFAULT_BIRTH_DATE));
    setBirthPickerVisible(false);
    setDiscovery(null);
    setLearningLang(null);
    setNativeLang(null);
    setWordCategory(null);
  };

  const wasVisible = useRef(visible);
  useEffect(() => {
    if (wasVisible.current && !visible) reset();
    wasVisible.current = visible;
  }, [visible]);

  const handlePurpose = (p: 'language' | 'words') => {
    setPurpose(p);
    setStep(2);
  };

  const handleBack = () => {
    setBirthPickerVisible(false);
    if (step === 4) setStep(3);
    else if (step === 3) setStep(2);
    else setStep(1);
  };

  const handleComplete = () => {
    const dateOfBirth = birthDate ? toIsoDate(birthDate) : null;
    if (!nativeLang || !purpose || !gender || !dateOfBirth || !discovery) return;
    const choices: OnboardingChoices = {
      purpose,
      gender,
      dateOfBirth,
      discoverySource: discovery,
      nativeLang,
      ...(purpose === 'language' && learningLang ? { learningLang } : {}),
      ...(purpose === 'words' && wordCategory    ? { wordCategory } : {}),
    };
    onComplete(choices);
  };

  // Both paths now end at step 4.
  const isLastStep = step === 4;

  const showingProfile = step === 2;

  // Category picker is shown at step 4 for the words path.
  const showingCategoryPicker = step === 4 && purpose === 'words';

  // Language picker logic (steps 3 and 4 on language path, step 3 on words path).
  const showingLearnLang  = step === 3 && purpose === 'language';
  const langTitleKey: TranslationKey = showingLearnLang ? 'ob_learn_lang'      : 'ob_native_lang';
  const langDescKey:  TranslationKey = showingLearnLang ? 'ob_learn_lang_desc' : 'ob_native_lang_desc';
  const langSelected  = showingLearnLang ? learningLang : nativeLang;
  const langOnSelect  = showingLearnLang ? setLearningLang : setNativeLang;

  const canProceed = showingProfile
    ? gender !== null && birthDate !== null && discovery !== null
    : showingCategoryPicker
      ? wordCategory !== null
      : (showingLearnLang ? learningLang !== null : nativeLang !== null);

  const handleProceed = () => {
    if (!canProceed) return;
    if (isLastStep) handleComplete();
    else if (step === 2) setStep(3);
    else setStep(4);
  };

  const openBirthPicker = () => {
    setDraftBirthDate(new Date(birthDate ?? DEFAULT_BIRTH_DATE));
    setBirthPickerVisible(true);
  };

  const handleBirthDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setBirthPickerVisible(false);
      if (event.type === 'set' && selectedDate) {
        setDraftBirthDate(selectedDate);
        setBirthDate(selectedDate);
      }
      return;
    }

    if (event.type !== 'dismissed' && selectedDate) setDraftBirthDate(selectedDate);
  };

  const confirmBirthDate = () => {
    setBirthDate(new Date(draftBirthDate));
    setBirthPickerVisible(false);
  };

  const cancelBirthDate = () => {
    setDraftBirthDate(new Date(birthDate ?? DEFAULT_BIRTH_DATE));
    setBirthPickerVisible(false);
  };

  return (
    <Modal visible={visible} animationType="none" transparent={false} statusBarTranslucent>
      <View style={[ob.root, { backgroundColor: pal.bg, paddingTop: insets.top }]}>

        {/* ── Progress bar (hidden on Welcome screen, shown for steps 2–4) ── */}
        {step > 1 && (
          <View style={[ob.progressTrack, { backgroundColor: pal.border }]}>
            <Animated.View
              style={[
                ob.progressFill,
                {
                  backgroundColor: themeColor,
                  width: progressAnim.interpolate({
                    inputRange: [0, 1, 2, 3],
                    outputRange: ['0%', '33%', '67%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        )}

        {step === 1 ? (
          /* ── Step 1: purpose ─────────────────────────────────────────────── */
          <View style={[ob.stepWrap, { paddingBottom: insets.bottom + 32 }]}>
            <View style={ob.logoArea}>
              <Image
                source={require('../../assets/icon.png')}
                style={ob.appIcon}
              />
              <Text style={[ob.welcomeTitle, { color: pal.text }]}>{t('ob_welcome_title')}</Text>
              <Text style={[ob.purposeQ, { color: pal.sub }]}>{t('ob_purpose_title')}</Text>
            </View>

            <View style={ob.purposeCards}>
              <TouchableOpacity
                style={[ob.purposeCard, { backgroundColor: pal.card, borderColor: pal.border }]}
                onPress={() => handlePurpose('language')}
                activeOpacity={0.75}
              >
                <Text style={ob.purposeIcon}>🌏</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[ob.purposeTitle, { color: pal.text }]}>{t('ob_purpose_language')}</Text>
                  <Text style={[ob.purposeDesc,  { color: pal.sub  }]}>{t('ob_purpose_language_desc')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={pal.sub} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[ob.purposeCard, { backgroundColor: pal.card, borderColor: pal.border }]}
                onPress={() => handlePurpose('words')}
                activeOpacity={0.75}
              >
                <Text style={ob.purposeIcon}>📚</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[ob.purposeTitle, { color: pal.text }]}>{t('ob_purpose_words')}</Text>
                  <Text style={[ob.purposeDesc,  { color: pal.sub  }]}>{t('ob_purpose_words_desc')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={pal.sub} />
              </TouchableOpacity>
            </View>
          </View>

        ) : (
          /* ── Steps 2–4 ───────────────────────────────────────────────────── */
          <View style={{ flex: 1 }}>

            {/* Back button */}
            <TouchableOpacity onPress={handleBack} style={ob.backBtn}>
              <Ionicons name="chevron-back" size={20} color={pal.text} />
              <Text style={[ob.backText, { color: pal.text }]}>{t('ob_back')}</Text>
            </TouchableOpacity>

            {showingProfile ? (
              /* ── Profile details (step 2) ── */
              <>
                <View style={ob.stepHeader}>
                  <Text style={[ob.stepTitle, { color: pal.text }]}>{t('ob_profile_title')}</Text>
                  <Text style={[ob.stepDesc, { color: pal.sub }]}>{t('ob_profile_desc')}</Text>
                </View>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={ob.profileScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={ob.profileSection}>
                    <Text style={[ob.profileLabel, { color: pal.text }]}>{t('ob_gender')}</Text>
                    <View style={ob.optionGrid}>
                      {OB_GENDERS.map(option => {
                        const active = gender === option.id;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            onPress={() => setGender(option.id)}
                            activeOpacity={0.75}
                            style={[
                              ob.optionChip,
                              {
                                backgroundColor: active ? themeColor + '18' : pal.card,
                                borderColor: active ? themeColor : pal.border,
                              },
                            ]}
                          >
                            <Ionicons name={option.icon} size={17} color={active ? themeColor : pal.sub} />
                            <Text style={[ob.optionText, { color: active ? themeColor : pal.text }]} numberOfLines={2}>
                              {t(option.labelKey)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={ob.profileSection}>
                    <Text style={[ob.profileLabel, { color: pal.text }]}>{t('ob_birth_date')}</Text>
                    <TouchableOpacity
                      style={[ob.datePickerButton, { backgroundColor: pal.card, borderColor: pal.border }]}
                      onPress={openBirthPicker}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={t('ob_birth_date')}
                    >
                      <Ionicons name="calendar-outline" size={19} color={birthDate ? themeColor : pal.sub} />
                      <Text style={[ob.datePickerText, { color: birthDate ? pal.text : pal.sub }]}>
                        {birthDate ? birthDate.toLocaleDateString() : t('ob_birth_select')}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={pal.sub} />
                    </TouchableOpacity>

                    {birthPickerVisible && Platform.OS === 'android' && (
                      <DateTimePicker
                        value={draftBirthDate}
                        mode="date"
                        display="default"
                        minimumDate={MIN_BIRTH_DATE}
                        maximumDate={MAX_BIRTH_DATE}
                        onChange={handleBirthDateChange}
                      />
                    )}
                  </View>

                  <View style={ob.profileSection}>
                    <Text style={[ob.profileLabel, { color: pal.text }]}>{t('ob_discovery')}</Text>
                    <View style={ob.optionGrid}>
                      {OB_DISCOVERY_SOURCES.map(option => {
                        const active = discovery === option.id;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            onPress={() => setDiscovery(option.id)}
                            activeOpacity={0.75}
                            style={[
                              ob.optionChip,
                              {
                                backgroundColor: active ? themeColor + '18' : pal.card,
                                borderColor: active ? themeColor : pal.border,
                              },
                            ]}
                          >
                            <Ionicons name={option.icon} size={17} color={active ? themeColor : pal.sub} />
                            <Text style={[ob.optionText, { color: active ? themeColor : pal.text }]} numberOfLines={2}>
                              {t(option.labelKey)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  <View style={{ height: 100 }} />
                </ScrollView>
              </>
            ) : showingCategoryPicker ? (
              /* ── Category picker (words path, step 4) ── */
              <>
                <View style={ob.stepHeader}>
                  <Text style={[ob.stepTitle, { color: pal.text }]}>{t('ob_category_title')}</Text>
                </View>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={ob.langScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={ob.categoryList}>
                    {OB_CATEGORIES.map(cat => {
                      const active = cat.id === wordCategory;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          onPress={() => setWordCategory(cat.id)}
                          activeOpacity={0.75}
                          style={[
                            ob.categoryCard,
                            {
                              backgroundColor: active ? themeColor + '18' : pal.card,
                              borderColor:     active ? themeColor : pal.border,
                            },
                          ]}
                        >
                          <Text style={ob.categoryIcon}>{cat.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[ob.categoryTitle, { color: active ? themeColor : pal.text }]}>
                              {t(cat.titleKey)}
                            </Text>
                            {cat.descKey && (
                              <Text style={[ob.categoryDesc, { color: pal.sub }]}>
                                {t(cat.descKey)}
                              </Text>
                            )}
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={20} color={themeColor} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ height: 100 }} />
                </ScrollView>
              </>
            ) : (
              /* ── Language picker (step 3 both paths, step 4 language path) ── */
              <>
                <View style={ob.stepHeader}>
                  <Text style={[ob.stepTitle, { color: pal.text }]}>{t(langTitleKey)}</Text>
                  <Text style={[ob.stepDesc, { color: pal.sub }]}>{t(langDescKey)}</Text>
                </View>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={ob.langScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <LangPicker
                    selected={langSelected}
                    onSelect={langOnSelect}
                    pal={pal}
                    themeColor={themeColor}
                  />
                  <View style={{ height: 100 }} />
                </ScrollView>
              </>
            )}

            {/* Action button */}
            <View style={[ob.startRow, {
              paddingBottom: insets.bottom + 16,
              backgroundColor: pal.bg,
              borderTopColor: pal.border,
            }]}>
              <TouchableOpacity
                style={[ob.startBtn, { backgroundColor: canProceed ? themeColor : pal.chip }]}
                onPress={handleProceed}
                disabled={!canProceed}
                activeOpacity={0.8}
              >
                <Text style={[ob.startText, { color: canProceed ? '#fff' : pal.sub }]}>
                  {t(isLastStep ? 'ob_start' : 'ob_next')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </View>

      {Platform.OS === 'ios' && (
        <Modal
          visible={birthPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={cancelBirthDate}
        >
          <View style={ob.datePickerOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={cancelBirthDate}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            />
            <View style={[
              ob.datePickerSheet,
              {
                backgroundColor: pal.dialog,
                borderColor: pal.border,
                paddingBottom: insets.bottom + 12,
              },
            ]}>
              <View style={[ob.datePickerHeader, { borderBottomColor: pal.border }]}>
                <TouchableOpacity
                  style={ob.datePickerHeaderButton}
                  onPress={cancelBirthDate}
                  activeOpacity={0.7}
                >
                  <Text style={[ob.datePickerHeaderText, { color: pal.sub }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <Text style={[ob.datePickerTitle, { color: pal.text }]}>{t('ob_birth_date')}</Text>
                <TouchableOpacity
                  style={[ob.datePickerHeaderButton, ob.datePickerConfirmButton]}
                  onPress={confirmBirthDate}
                  activeOpacity={0.7}
                >
                  <Text style={[ob.datePickerHeaderText, { color: themeColor, fontWeight: '700' }]}>{t('done')}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={draftBirthDate}
                mode="date"
                display="spinner"
                minimumDate={MIN_BIRTH_DATE}
                maximumDate={MAX_BIRTH_DATE}
                accentColor={themeColor}
                textColor={pal.text}
                onChange={handleBirthDateChange}
                style={ob.datePickerSpinner}
              />
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ob = StyleSheet.create({
  root: { flex: 1 },

  // Progress bar
  progressTrack: {
    height: 4,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // App icon (step 1)
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 18,
    marginBottom: 20,
  },

  // Step 1 — purpose
  stepWrap: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 28,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  purposeQ: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  purposeCards: {
    gap: 12,
  },
  purposeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  purposeIcon:  { fontSize: 30 },
  purposeTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  purposeDesc:  { fontSize: 13, lineHeight: 18 },

  // Steps 2–4 — profile and language/category pickers
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  backText: { fontSize: 16 },
  stepHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  stepDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  profileScrollContent: {
    paddingHorizontal: 20,
  },
  profileSection: {
    marginBottom: 24,
  },
  profileLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 48,
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  optionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  datePickerButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    gap: 10,
  },
  datePickerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  datePickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 28, 52, 0.42)',
  },
  datePickerSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  datePickerHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  datePickerHeaderButton: {
    minWidth: 82,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  datePickerConfirmButton: { alignItems: 'flex-end' },
  datePickerHeaderText: { fontSize: 16, fontWeight: '500' },
  datePickerTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  datePickerSpinner: { alignSelf: 'stretch' },
  langScrollContent: {
    paddingHorizontal: 20,
  },
  categoryList: { gap: 10 },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  categoryIcon:  { fontSize: 26 },
  categoryTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  categoryDesc:  { fontSize: 13, lineHeight: 18 },

  langList:  { gap: 7 },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  langFlag:  { fontSize: 22 },
  langLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  startRow: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  startBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startText: { fontSize: 17, fontWeight: '700' },
});
