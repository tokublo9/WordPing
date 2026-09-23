import { Animated, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { isSupportedOnboardingLanguage, SUPPORTED_LANGUAGES, useLang } from '../i18n';
import type { TranslationKey } from '../i18n';
import type { OnboardingChoices, Palette } from '../types';
import { WordCoreAlertHost } from './WordCoreAlert';

// ── Dev flag ──────────────────────────────────────────────────────────────────
// Set to true to show onboarding on every launch (only takes effect in __DEV__).
// Flip back to false before shipping.
export const FORCE_SHOW_ONBOARDING = false;

// ── Language picker ───────────────────────────────────────────────────────────

interface LangPickerProps {
  selected: string | null;
  onSelect: (code: string) => void;
  pal: Palette;
  themeColor: string;
}

function LangPicker({ selected, onSelect, pal, themeColor }: LangPickerProps) {
  const t = useLang();
  return (
    <View style={ob.langList}>
      {SUPPORTED_LANGUAGES.map(lang => {
        const active = lang.onboardingCode === selected;
        return (
          <TouchableOpacity
            key={lang.onboardingCode}
            onPress={() => onSelect(lang.onboardingCode)}
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
              style={[ob.langLabel, { color: active ? themeColor : pal.text }]}
              numberOfLines={1}
            >
              {t(lang.nameKey)}
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
  // step 3 = explanation-language picker (language path only)
  const [step,         setStep]         = useState<1 | 2 | 3>(1);
  const [purpose,      setPurpose]      = useState<'language' | 'words' | null>(null);
  const [learningLang, setLearningLang] = useState<string | null>(null);
  const [nativeLang,   setNativeLang]   = useState<string | null>(null);

  // Progress bar — step 1 is the Welcome screen, not a flow step. Language
  // Learning has two remaining screens; Vocabulary & Terms has one.
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (step === 1) return;
    const totalSteps = purpose === 'words' ? 1 : 2;
    Animated.timing(progressAnim, {
      toValue: (step - 1) / totalSteps,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [purpose, step]);

  const reset = () => {
    progressAnim.setValue(0);
    setStep(1);
    setPurpose(null);
    setLearningLang(null);
    setNativeLang(null);
  };

  // The reset runs once the flow is hidden, so the next open starts on the Welcome
  // screen. Rendering stops the moment `visible` turns false (see below), which is
  // what keeps `setStep(1)` here from repainting step 1 over the closing flow.
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
    if (step === 3) setStep(2);
    else setStep(1);
  };

  const handleComplete = () => {
    if (!purpose
      || !isSupportedOnboardingLanguage(nativeLang)
      || (purpose === 'language' && !isSupportedOnboardingLanguage(learningLang))) return;
    const choices: OnboardingChoices = {
      purpose,
      nativeLang,
      ...(purpose === 'language' ? { learningLang: learningLang! } : {}),
    };
    onComplete(choices);
  };

  const isLastStep = step === 3 || (purpose === 'words' && step === 2);

  // Language picker logic (steps 2 and 3 on the language path, step 2 on the
  // words path — the learning language is asked first, then the explanation
  // language, which is the only question the words path has.)
  const showingLearnLang  = step === 2 && purpose === 'language';
  const langTitleKey: TranslationKey = showingLearnLang ? 'ob_learn_lang'      : 'ob_native_lang';
  const langDescKey:  TranslationKey = showingLearnLang ? 'ob_learn_lang_desc' : 'ob_native_lang_desc';
  const langSelected  = showingLearnLang ? learningLang : nativeLang;
  const langOnSelect  = showingLearnLang ? setLearningLang : setNativeLang;

  const canProceed = showingLearnLang
    ? isSupportedOnboardingLanguage(learningLang)
    : isSupportedOnboardingLanguage(nativeLang);

  const handleProceed = () => {
    if (!canProceed) return;
    if (isLastStep) handleComplete();
    else setStep(3);
  };

  // Completing the flow flips `visible` to false while the modal is still on screen.
  // Rendering nothing from that first render on means the reset above lands with no
  // step content mounted, so the Welcome screen can never flash on the way out.
  if (!visible) return null;

  return (
    <Modal visible animationType="none" transparent={false} statusBarTranslucent>
      <View style={[ob.root, { backgroundColor: pal.bg, paddingTop: insets.top }]}>

        {/* ── Progress bar (hidden on Welcome screen, shown for steps 2–3) ── */}
        {step > 1 && (
          <View style={[ob.progressTrack, { backgroundColor: pal.border }]}>
            <Animated.View
              style={[
                ob.progressFill,
                {
                  backgroundColor: themeColor,
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
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
                source={require('../../assets/icon/icon.png')}
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
          /* ── Steps 2–3 ───────────────────────────────────────────────────── */
          <View style={{ flex: 1 }}>

            {/* Back button */}
            <TouchableOpacity onPress={handleBack} style={ob.backBtn}>
              <Ionicons name="chevron-back" size={20} color={pal.text} />
              <Text style={[ob.backText, { color: pal.text }]}>{t('ob_back')}</Text>
            </TouchableOpacity>

            {/* ── Language picker (step 2 both paths, step 3 language path) ── */}
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

        <WordCoreAlertHost active priority={10} pal={pal} themeColor={themeColor} />
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

  // Steps 2–3 — language pickers
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
