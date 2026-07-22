import {
  Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import type { Palette } from '../types';
import { useLang, type TranslationKey } from '../i18n';

const SW = Dimensions.get('window').width;
const PLAN_BLUE = '#2563EB';
const PLAN_BLUE_DARK = '#174A9C';
const INK = '#17345F';
const SOFT_BLUE = '#EAF1FF';
const LINE_BLUE = '#C7D7F5';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type IllustrationKind = 'folders' | 'editor' | 'flip' | 'test' | 'notifications' | 'audio' | 'ai';

interface Props {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
}

const STEPS: ReadonlyArray<{
  kind: IllustrationKind;
  icon: IoniconName;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  accent: string;
}> = [
  { kind: 'folders',       icon: 'folder-outline',        titleKey: 'tut1_title', descKey: 'tut1_desc', accent: '#3278E8' },
  { kind: 'editor',        icon: 'add-circle-outline',    titleKey: 'tut2_title', descKey: 'tut2_desc', accent: '#4A67D6' },
  { kind: 'flip',          icon: 'albums-outline',        titleKey: 'tut3_title', descKey: 'tut3_desc', accent: '#5966D9' },
  { kind: 'test',          icon: 'school-outline',        titleKey: 'tut4_title', descKey: 'tut4_desc', accent: '#6A5DD2' },
  { kind: 'notifications', icon: 'notifications-outline', titleKey: 'tut5_title', descKey: 'tut5_desc', accent: '#3D75D6' },
  { kind: 'audio',         icon: 'volume-high-outline',   titleKey: 'tut6_title', descKey: 'tut6_desc', accent: '#337BC5' },
  { kind: 'ai',            icon: 'sparkles-outline',      titleKey: 'tut7_title', descKey: 'tut7_desc', accent: '#6659C8' },
];

function IllustrationStage({ kind, accent }: { kind: IllustrationKind; accent: string }) {
  const scene = (() => {
    if (kind === 'folders') {
      return (
        <View style={art.folderScene}>
          <View style={[art.folderBack, { backgroundColor: accent }]}>
            <View style={[art.folderTab, { backgroundColor: accent }]} />
          </View>
          <View style={art.folderPaper}>
            <View style={[art.paperLine, { width: '70%' }]} />
            <View style={[art.paperLine, { width: '48%' }]} />
          </View>
          <View style={[art.folderFront, { backgroundColor: accent + 'E8' }]}>
            <Ionicons name="library-outline" size={25} color="#fff" />
          </View>
          <View style={[art.floatingBadge, art.folderBadge, { backgroundColor: '#fff' }]}>
            <Ionicons name="add" size={18} color={accent} />
          </View>
          <View style={[art.miniPill, art.folderPill]}>
            <View style={[art.statusDot, { backgroundColor: '#5AC58B' }]} />
            <View style={[art.miniLine, { width: 35 }]} />
          </View>
        </View>
      );
    }

    if (kind === 'editor') {
      return (
        <View style={art.editorScene}>
          <View style={art.phoneCard}>
            <View style={art.phoneNotch} />
            <View style={art.fieldLabel} />
            <View style={[art.inputField, { borderColor: accent + '55' }]}>
              <View style={[art.inputValue, { width: '55%', backgroundColor: accent + '55' }]} />
            </View>
            <View style={art.fieldLabel} />
            <View style={[art.inputField, { borderColor: LINE_BLUE }]}>
              <View style={[art.inputValue, { width: '72%' }]} />
            </View>
          </View>
          <View style={[art.floatingBadge, art.editorAdd, { backgroundColor: accent }]}>
            <Ionicons name="add" size={22} color="#fff" />
          </View>
          <View style={[art.toolChip, art.editorTool]}>
            <Ionicons name="create-outline" size={14} color={accent} />
            <View style={[art.miniLine, { width: 30 }]} />
          </View>
        </View>
      );
    }

    if (kind === 'flip') {
      return (
        <View style={art.flipScene}>
          <View style={[art.studyCard, art.studyCardBack, { borderColor: accent + '55' }]}>
            <Ionicons name="language-outline" size={21} color={accent} />
            <View style={[art.cardLine, { width: 44 }]} />
          </View>
          <View style={[art.studyCard, art.studyCardFront, { borderColor: accent + '70' }]}>
            <View style={[art.wordChip, { backgroundColor: accent + '16' }]}>
              <View style={[art.wordChipLine, { backgroundColor: accent }]} />
            </View>
            <View style={[art.cardLine, { width: 66 }]} />
            <View style={[art.cardLine, { width: 42 }]} />
          </View>
          <View style={[art.roundAction, art.flipAction, { backgroundColor: accent }]}>
            <Ionicons name="sync" size={18} color="#fff" />
          </View>
          <Ionicons name="chevron-forward" size={18} color={accent} style={art.flipChevron} />
        </View>
      );
    }

    if (kind === 'test') {
      return (
        <View style={art.quizCard}>
          <View style={art.quizTopRow}>
            <View style={[art.quizNumber, { backgroundColor: accent }]}>
              <Text style={art.quizNumberText}>3</Text>
            </View>
            <View style={art.quizProgress}>
              <View style={[art.quizProgressFill, { backgroundColor: accent }]} />
            </View>
            <Text style={[art.quizScore, { color: accent }]}>3/4</Text>
          </View>
          <View style={[art.questionLine, { width: '68%' }]} />
          <View style={art.answerGrid}>
            {[0, 1, 2, 3].map(index => (
              <View
                key={index}
                style={[
                  art.answerCell,
                  { borderColor: index === 1 ? '#65C792' : LINE_BLUE },
                  index === 1 && { backgroundColor: '#EBFAF2' },
                ]}
              >
                {index === 1
                  ? <Ionicons name="checkmark" size={14} color="#35A66B" />
                  : <View style={art.answerLine} />}
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (kind === 'notifications') {
      return (
        <View style={art.notificationScene}>
          <View style={[art.notificationRing, { borderColor: accent + '35' }]}>
            <View style={[art.notificationCore, { backgroundColor: accent }]}>
              <Ionicons name="notifications" size={30} color="#fff" />
            </View>
          </View>
          <View style={[art.scheduleChip, art.scheduleOne]}>
            <Ionicons name="sunny-outline" size={15} color="#F59E0B" />
            <View style={[art.miniLine, { width: 38 }]} />
          </View>
          <View style={[art.scheduleChip, art.scheduleTwo]}>
            <Ionicons name="time-outline" size={15} color={accent} />
            <View style={[art.miniLine, { width: 30 }]} />
          </View>
          <View style={[art.notificationDot, { backgroundColor: '#F26B6B' }]} />
        </View>
      );
    }

    if (kind === 'audio') {
      const heights = [16, 30, 22, 42, 27, 36, 18, 29, 14];
      return (
        <View style={art.audioScene}>
          <View style={art.wavePanel}>
            <View style={art.waveBars}>
              {heights.map((height, index) => (
                <View
                  key={index}
                  style={[art.waveBar, { height, backgroundColor: index === 4 ? accent : accent + '72' }]}
                />
              ))}
            </View>
            <View style={art.audioTimeline}>
              <View style={[art.audioTimelineFill, { backgroundColor: accent }]} />
              <View style={[art.audioKnob, { borderColor: accent }]} />
            </View>
          </View>
          <View style={[art.roundAction, art.playAction, { backgroundColor: accent }]}>
            <Ionicons name="play" size={19} color="#fff" style={{ marginLeft: 2 }} />
          </View>
          <View style={[art.toolChip, art.voiceChip]}>
            <Ionicons name="mic-outline" size={14} color={accent} />
            <View style={[art.miniLine, { width: 27 }]} />
          </View>
        </View>
      );
    }

    return (
      <View style={art.aiScene}>
        <View style={[art.aiOrb, { backgroundColor: accent }]}>
          <Ionicons name="sparkles" size={31} color="#fff" />
        </View>
        <View style={[art.aiChip, art.aiChipLeft]}>
          <Ionicons name="language-outline" size={14} color={accent} />
          <View style={[art.miniLine, { width: 31 }]} />
        </View>
        <View style={[art.aiChip, art.aiChipRight]}>
          <Ionicons name="color-palette-outline" size={14} color="#A855F7" />
          <View style={art.paletteDots}>
            <View style={[art.paletteDot, { backgroundColor: '#4387EF' }]} />
            <View style={[art.paletteDot, { backgroundColor: '#A86BE5' }]} />
            <View style={[art.paletteDot, { backgroundColor: '#F28AB2' }]} />
          </View>
        </View>
        <View style={[art.sparkleDot, art.sparkleDotOne, { backgroundColor: '#F5B94C' }]} />
        <View style={[art.sparkleDot, art.sparkleDotTwo, { backgroundColor: '#64C9A2' }]} />
        <Ionicons name="sparkles-outline" size={17} color={accent} style={art.aiSparkle} />
      </View>
    );
  })();

  return (
    <LinearGradient
      colors={['#F9FBFF', '#E8F0FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={art.stage}
    >
      <View style={[art.decorOrb, art.orbOne, { backgroundColor: accent + '17' }]} />
      <View style={[art.decorOrb, art.orbTwo, { backgroundColor: accent + '12' }]} />
      <View style={[art.decorDash, art.dashOne, { backgroundColor: accent + '40' }]} />
      <View style={[art.decorDash, art.dashTwo, { backgroundColor: accent + '2E' }]} />
      {scene}
    </LinearGradient>
  );
}

function HeroIllustration() {
  return (
    <View style={styles.heroFlow}>
      <View style={[styles.heroNode, { backgroundColor: '#fff' }]}>
        <Ionicons name="folder-open-outline" size={24} color={PLAN_BLUE} />
      </View>
      <View style={styles.heroConnector}>
        <View style={styles.heroConnectorLine} />
        <Ionicons name="chevron-forward" size={14} color={PLAN_BLUE} />
      </View>
      <View style={[styles.heroNode, styles.heroNodePrimary]}>
        <Ionicons name="albums-outline" size={25} color="#fff" />
      </View>
      <View style={styles.heroConnector}>
        <View style={styles.heroConnectorLine} />
        <Ionicons name="chevron-forward" size={14} color={PLAN_BLUE} />
      </View>
      <View style={[styles.heroNode, { backgroundColor: '#fff' }]}>
        <Ionicons name="sparkles-outline" size={24} color="#6A5DD2" />
      </View>
    </View>
  );
}

export function TutorialModal({ visible, onClose, pal }: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
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
        { backgroundColor: pal.bg, transform: [{ translateX: slideX }] },
      ]}
    >
      <View style={[styles.navBar, {
        paddingTop: insets.top + 8,
        backgroundColor: pal.dialog,
        borderBottomColor: pal.border,
      }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={dismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        >
          <Ionicons name="chevron-back" size={24} color={pal.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: pal.text }]}>{t('how_to_use')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <LinearGradient
          colors={['#EFF5FF', '#DBE8FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <View style={styles.heroBadge}>
            <Ionicons name="compass-outline" size={14} color={PLAN_BLUE} />
            <Text style={styles.heroBadgeText}>{t('app_name')}</Text>
          </View>
          <HeroIllustration />
        </LinearGradient>

        <View style={styles.sectionHeading}>
          <View style={styles.sectionLine} />
          <View style={styles.sectionMark}>
            <Ionicons name="sparkles" size={14} color="#fff" />
          </View>
          <View style={styles.sectionLine} />
        </View>

        {STEPS.map((step, index) => (
          <View
            key={step.kind}
            style={[styles.stepCard, { backgroundColor: pal.card, borderColor: pal.border }]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, { backgroundColor: step.accent + '16' }]}>
                <Ionicons name={step.icon} size={20} color={step.accent} />
              </View>
              <View style={styles.stepHeadingText}>
                <Text style={[styles.stepEyebrow, { color: step.accent }]}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <Text style={[styles.stepTitle, { color: pal.text }]}>{t(step.titleKey)}</Text>
              </View>
            </View>

            <IllustrationStage kind={step.kind} accent={step.accent} />

            <Text style={[styles.stepDesc, { color: pal.sub }]}>{t(step.descKey)}</Text>
          </View>
        ))}

        <TouchableOpacity
          style={styles.doneButton}
          onPress={dismiss}
          activeOpacity={0.86}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={[PLAN_BLUE, PLAN_BLUE_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.doneGradient}
          >
            <Text style={styles.doneText}>{t('got_it')}</Text>
            <Ionicons name="checkmark-circle" size={19} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0.2 },

  content: { paddingHorizontal: 16, paddingTop: 18 },
  hero: {
    minHeight: 180,
    borderRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: '#C8D9F8',
  },
  heroGlowOne: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    right: -42, top: -68, backgroundColor: '#fff', opacity: 0.48,
  },
  heroGlowTwo: {
    position: 'absolute', width: 92, height: 92, borderRadius: 46,
    left: -28, bottom: -42, backgroundColor: '#AFC9F8', opacity: 0.3,
  },
  heroBadge: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: '#C9D9F6',
  },
  heroBadgeText: { color: INK, fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  heroFlow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 17,
  },
  heroNode: {
    width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#C5D6F4',
  },
  heroNodePrimary: {
    width: 66, height: 66, borderRadius: 20, backgroundColor: PLAN_BLUE,
    borderColor: '#73A2EF',
  },
  heroConnector: { width: 42, flexDirection: 'row', alignItems: 'center', marginHorizontal: 2 },
  heroConnectorLine: { flex: 1, height: 1.5, backgroundColor: '#AFC4E9' },

  sectionHeading: {
    flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 18,
    paddingHorizontal: 12, gap: 9,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#C6D6F2' },
  sectionMark: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PLAN_BLUE,
  },

  stepCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#183B72',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  stepIcon: {
    width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  stepHeadingText: { flex: 1 },
  stepEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 2 },
  stepTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.25 },
  stepDesc: { fontSize: 14, lineHeight: 21, marginTop: 15 },

  doneButton: {
    borderRadius: 17, overflow: 'hidden', marginTop: 4,
    shadowColor: PLAN_BLUE_DARK, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 8, elevation: 4,
  },
  doneGradient: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    paddingHorizontal: 20,
  },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const art = StyleSheet.create({
  stage: {
    height: 156,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#D2DFF5',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  decorOrb: { position: 'absolute', borderRadius: 999 },
  orbOne: { width: 110, height: 110, left: -38, top: -48 },
  orbTwo: { width: 86, height: 86, right: -22, bottom: -34 },
  decorDash: { position: 'absolute', height: 4, borderRadius: 2 },
  dashOne: { width: 26, right: 25, top: 24, transform: [{ rotate: '-20deg' }] },
  dashTwo: { width: 17, left: 26, bottom: 28, transform: [{ rotate: '22deg' }] },

  folderScene: { width: 210, height: 120, alignItems: 'center', justifyContent: 'center' },
  folderBack: { position: 'absolute', width: 130, height: 82, borderRadius: 14, top: 23 },
  folderTab: { position: 'absolute', width: 55, height: 18, borderTopLeftRadius: 9, borderTopRightRadius: 9, top: -10 },
  folderPaper: {
    position: 'absolute', width: 102, height: 62, borderRadius: 9, top: 27,
    backgroundColor: '#fff', paddingHorizontal: 15, paddingTop: 17, gap: 8,
    borderWidth: 1, borderColor: '#D6E2F6',
  },
  paperLine: { height: 5, borderRadius: 3, backgroundColor: '#C7D6ED' },
  folderFront: {
    position: 'absolute', width: 144, height: 70, borderRadius: 15, bottom: 4,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  floatingBadge: {
    position: 'absolute', width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D0DDF2',
  },
  folderBadge: { right: 16, top: 8 },
  miniPill: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 7,
    height: 28, borderRadius: 14, backgroundColor: '#fff', paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#D3E0F4',
  },
  folderPill: { left: 4, bottom: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  miniLine: { height: 5, borderRadius: 3, backgroundColor: '#C8D5E9' },

  editorScene: { width: 210, height: 130, alignItems: 'center', justifyContent: 'center' },
  phoneCard: {
    width: 104, height: 124, borderRadius: 17, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#C9D8F0', paddingHorizontal: 11, paddingTop: 20,
  },
  phoneNotch: {
    position: 'absolute', top: 7, alignSelf: 'center', width: 28, height: 4,
    borderRadius: 2, backgroundColor: '#B9C8DE',
  },
  fieldLabel: { width: 30, height: 4, borderRadius: 2, backgroundColor: '#B8C7DD', marginBottom: 5 },
  inputField: {
    height: 27, borderRadius: 7, borderWidth: 1, justifyContent: 'center',
    paddingHorizontal: 7, marginBottom: 9, backgroundColor: '#FBFDFF',
  },
  inputValue: { height: 5, borderRadius: 3, backgroundColor: '#CAD7E9' },
  editorAdd: { right: 25, top: 15, borderColor: '#fff' },
  toolChip: {
    position: 'absolute', height: 30, borderRadius: 15, flexDirection: 'row',
    alignItems: 'center', gap: 7, paddingHorizontal: 10, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#D1DDF0',
  },
  editorTool: { left: 14, bottom: 14 },

  flipScene: { width: 220, height: 126, alignItems: 'center', justifyContent: 'center' },
  studyCard: {
    position: 'absolute', width: 100, height: 112, borderRadius: 15, backgroundColor: '#fff',
    borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  studyCardBack: { left: 47, transform: [{ rotate: '-7deg' }], opacity: 0.92 },
  studyCardFront: { right: 45, transform: [{ rotate: '5deg' }] },
  wordChip: { width: 52, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  wordChipLine: { width: 25, height: 5, borderRadius: 3 },
  cardLine: { height: 5, borderRadius: 3, backgroundColor: '#C4D2E7' },
  roundAction: {
    position: 'absolute', width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  flipAction: { bottom: 0, alignSelf: 'center' },
  flipChevron: { position: 'absolute', right: 10 },

  quizCard: {
    width: 210, height: 120, borderRadius: 16, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#CBD9F0', padding: 13,
  },
  quizTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quizNumber: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  quizNumberText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  quizProgress: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#E5ECF7', overflow: 'hidden' },
  quizProgressFill: { width: '75%', height: '100%', borderRadius: 3 },
  quizScore: { fontSize: 10, fontWeight: '700' },
  questionLine: { height: 7, borderRadius: 4, backgroundColor: '#B8C9E2', marginTop: 12, marginBottom: 10 },
  answerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  answerCell: {
    width: 85, height: 26, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBFDFF',
  },
  answerLine: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#CFD9E8' },

  notificationScene: { width: 220, height: 130, alignItems: 'center', justifyContent: 'center' },
  notificationRing: {
    width: 98, height: 98, borderRadius: 49, borderWidth: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)',
  },
  notificationCore: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scheduleChip: {
    position: 'absolute', height: 34, borderRadius: 17, flexDirection: 'row',
    alignItems: 'center', gap: 7, paddingHorizontal: 11, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#D1DEF1',
  },
  scheduleOne: { left: 0, top: 11 },
  scheduleTwo: { right: 0, bottom: 10 },
  notificationDot: {
    position: 'absolute', width: 14, height: 14, borderRadius: 7,
    right: 70, top: 24, borderWidth: 2, borderColor: '#fff',
  },

  audioScene: { width: 230, height: 130, alignItems: 'center', justifyContent: 'center' },
  wavePanel: {
    width: 190, height: 94, borderRadius: 16, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#CEDCF1', paddingHorizontal: 17, paddingTop: 16,
  },
  waveBars: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  waveBar: { width: 5, borderRadius: 3 },
  audioTimeline: { height: 4, backgroundColor: '#DFE7F3', borderRadius: 2, marginTop: 14 },
  audioTimelineFill: { width: '58%', height: '100%', borderRadius: 2 },
  audioKnob: {
    position: 'absolute', left: '54%', top: -4, width: 12, height: 12,
    borderRadius: 6, backgroundColor: '#fff', borderWidth: 2,
  },
  playAction: { left: 1, bottom: 3 },
  voiceChip: { right: 1, top: 3 },

  aiScene: { width: 230, height: 130, alignItems: 'center', justifyContent: 'center' },
  aiOrb: {
    width: 78, height: 78, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)',
  },
  aiChip: {
    position: 'absolute', height: 35, borderRadius: 17, flexDirection: 'row',
    alignItems: 'center', gap: 7, paddingHorizontal: 11, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#D0DDF1',
  },
  aiChipLeft: { left: 0, bottom: 13 },
  aiChipRight: { right: 0, top: 13 },
  paletteDots: { flexDirection: 'row', gap: 3 },
  paletteDot: { width: 8, height: 8, borderRadius: 4 },
  sparkleDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  sparkleDotOne: { left: 34, top: 18 },
  sparkleDotTwo: { right: 38, bottom: 18 },
  aiSparkle: { position: 'absolute', right: 62, bottom: 1 },
});
