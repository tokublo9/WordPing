import { Animated, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '../i18n';
import type { TranslationKey } from '../i18n';
import type { OnboardingChoices, Palette } from '../types';

// ── Dev flag ──────────────────────────────────────────────────────────────────
// Set to true to show onboarding on every launch (only takes effect in __DEV__).
// Flip back to false before shipping.
export const FORCE_SHOW_ONBOARDING = true;

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
  // step 2 = lang picker (language path: learn lang / words path: explanation lang)
  // step 3 = lang picker (language path: explanation lang) OR category picker (words path)
  const [step,         setStep]         = useState<1 | 2 | 3>(1);
  const [purpose,      setPurpose]      = useState<'language' | 'words' | null>(null);
  const [learningLang, setLearningLang] = useState<string | null>(null);
  const [nativeLang,   setNativeLang]   = useState<string | null>(null);
  const [wordCategory, setWordCategory] = useState<string | null>(null);

  // Progress bar — only counts steps 2 and 3 (step 1 is the Welcome screen, not a flow step).
  // progressAnim value: 0 (hidden) → 1 (50%) → 2 (100%).
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
    setLearningLang(null);
    setNativeLang(null);
    setWordCategory(null);
  };

  const handlePurpose = (p: 'language' | 'words') => {
    setPurpose(p);
    setStep(2);
  };

  const handleBack = () => {
    if (step === 3) setStep(2);
    else setStep(1);
  };

  const handleComplete = () => {
    if (!nativeLang || !purpose) return;
    const choices: OnboardingChoices = {
      purpose,
      nativeLang,
      ...(purpose === 'language' && learningLang ? { learningLang } : {}),
      ...(purpose === 'words' && wordCategory    ? { wordCategory } : {}),
    };
    reset();
    onComplete(choices);
  };

  // Both paths now end at step 3.
  const isLastStep = step === 3;

  // Category picker is shown at step 3 for the words path.
  const showingCategoryPicker = step === 3 && purpose === 'words';

  // Language picker logic (steps 2 and 3 on language path, step 2 on words path).
  const showingLearnLang  = step === 2 && purpose === 'language';
  const langTitleKey: TranslationKey = showingLearnLang ? 'ob_learn_lang'      : 'ob_native_lang';
  const langDescKey:  TranslationKey = showingLearnLang ? 'ob_learn_lang_desc' : 'ob_native_lang_desc';
  const langSelected  = showingLearnLang ? learningLang : nativeLang;
  const langOnSelect  = showingLearnLang ? setLearningLang : setNativeLang;

  const canProceed = showingCategoryPicker
    ? wordCategory !== null
    : (showingLearnLang ? learningLang !== null : nativeLang !== null);

  const handleProceed = () => {
    if (!canProceed) return;
    if (isLastStep) handleComplete();
    else setStep(3);
  };

  return (
    <Modal visible={visible} animationType="none" transparent={false} statusBarTranslucent>
      <View style={[ob.root, { backgroundColor: pal.bg, paddingTop: insets.top }]}>

        {/* ── Progress bar (hidden on Welcome screen, shown for steps 2 & 3) ── */}
        {step > 1 && (
          <View style={[ob.progressTrack, { backgroundColor: pal.border }]}>
            <Animated.View
              style={[
                ob.progressFill,
                {
                  backgroundColor: themeColor,
                  width: progressAnim.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: ['0%', '50%', '100%'],
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
          /* ── Steps 2 & 3 ─────────────────────────────────────────────────── */
          <View style={{ flex: 1 }}>

            {/* Back button */}
            <TouchableOpacity onPress={handleBack} style={ob.backBtn}>
              <Ionicons name="chevron-back" size={20} color={pal.text} />
              <Text style={[ob.backText, { color: pal.text }]}>{t('ob_back')}</Text>
            </TouchableOpacity>

            {showingCategoryPicker ? (
              /* ── Category picker (words path, step 3) ── */
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
              /* ── Language picker (step 2 both paths, step 3 language path) ── */
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

  // Steps 2 & 3 — language picker
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
