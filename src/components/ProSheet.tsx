import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OnboardingChoices, Palette } from '../types';
import { FREE_THEME_COLOR, ONBOARDING_KEY, SKINS } from '../constants';
import { useLang } from '../i18n';
import { speak, stopPlayback } from '../lib/tts';
import { PremiumSkinPreview } from './ThemeSkinPreview';
import { SHOP_ITEMS } from './KisekaeShopSheet';

const { height: SH, width: SW } = Dimensions.get('window');

const PLAN_BLUE   = FREE_THEME_COLOR;         // #3B82F6
const HERO_DARK   = '#0F2A5E';                // dark navy for bear + headline
const BEAR_BODY   = '#1B3C73';                // main bear navy
const BEAR_INNER  = '#132C56';                // inner ear / pupil
const BEAR_CROWN  = '#F5C842';                // yellow crown
const BEAR_BELLY  = '#DDEEFF';               // light belly
const BEAR_WHITE  = '#FFFFFF';                // outlines + face details
const HERO_BG     = '#FFFFFF';               // hero background (white)

// ── Ghost background icons (very faint repeat pattern behind bear) ────────────
type GhostIcon = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  top: number;
  left?: number;
  right?: number;
};

const GHOST_ICONS: GhostIcon[] = [
  { icon: 'book-outline',           size: 34, top: 8,   left: SW * 0.03 },
  { icon: 'notifications-outline',  size: 30, top: 8,   left: SW * 0.36 },
  { icon: 'camera-outline',         size: 30, top: 8,   right: SW * 0.04 },
  { icon: 'chatbubble-outline',     size: 32, top: 82,  left: SW * 0.02 },
  { icon: 'happy-outline',          size: 30, top: 84,  left: SW * 0.32 },
  { icon: 'star-outline',           size: 26, top: 84,  right: SW * 0.02 },
  { icon: 'calendar-outline',       size: 30, top: 158, left: SW * 0.04 },
  { icon: 'layers-outline',         size: 28, top: 158, left: SW * 0.36 },
  { icon: 'bulb-outline',           size: 28, top: 158, right: SW * 0.04 },
];

// ── Colorful foreground decoration icons ─────────────────────────────────────
type DecoIcon = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  color: string;
  top: number;
  left?: number;
  right?: number;
};

const DECO_ICONS: DecoIcon[] = [
  // Left column
  { icon: 'chatbubble',        size: 28, color: '#4A9DFF',  top: 30,  left: 14 },
  { icon: 'happy',             size: 28, color: '#F5C842',  top: 118, left: 10 },
  { icon: 'star',              size: 9,  color: '#F5C842',  top: 74,  left: 22 },
  { icon: 'star',              size: 6,  color: '#F5C842',  top: 64,  left: 56 },
  { icon: 'star',              size: 7,  color: '#4A9DFF',  top: 160, left: 38 },
  // Right column
  { icon: 'book',              size: 28, color: '#4A9DFF',  top: 26,  right: 12 },
  { icon: 'notifications',     size: 26, color: '#4A9DFF',  top: 108, right: 10 },
  { icon: 'calendar',          size: 24, color: '#4A9DFF',  top: 164, right: 20 },
  { icon: 'star',              size: 9,  color: '#F5C842',  top: 62,  right: 26 },
  { icon: 'sparkles',          size: 14, color: '#F5C842',  top: 146, right: 58 },
  // Center area sparkles
  { icon: 'star',              size: 7,  color: '#F5C842',  top: 48,  left: SW / 2 - 50 },
  { icon: 'star',              size: 6,  color: '#FF9AC5',  top: 200, left: 58 },
  { icon: 'star',              size: 6,  color: '#FF9AC5',  top: 200, right: 58 },
];

// ── Confetti dots ─────────────────────────────────────────────────────────────
const CONFETTI = [
  { color: '#4A9DFF', w: 8,  h: 4,  top: 22,  left: SW * 0.28, rotate: '20deg'  },
  { color: '#F5C842', w: 6,  h: 6,  top: 18,  left: SW * 0.52, rotate: '0deg'   },
  { color: '#FF6B9D', w: 7,  h: 4,  top: 24,  right: SW * 0.3, rotate: '-15deg' },
  { color: '#4ADE80', w: 6,  h: 8,  top: 42,  left: SW * 0.15, rotate: '30deg'  },
  { color: '#FB923C', w: 8,  h: 4,  top: 36,  right: SW * 0.16,rotate: '10deg'  },
  { color: '#A78BFA', w: 5,  h: 8,  top: 38,  left: SW * 0.44, rotate: '-10deg' },
  { color: '#F87171', w: 7,  h: 4,  top: 14,  left: SW * 0.18, rotate: '-25deg' },
];

// ── Demo word + sentence ──────────────────────────────────────────────────────
interface DemoContent { word: string; sentence: string }

const DEMO_SAMPLES: Record<string, DemoContent> = {
  en: { word: 'Spontaneous',     sentence: 'The morning light filtered through the trees.' },
  ja: { word: '自発的',           sentence: '朝の光が木々の間から差し込んでいた。' },
  ko: { word: '자연스러운',       sentence: '아침 햇살이 나무 사이로 스며들었다.' },
  zh: { word: '自发的',           sentence: '清晨的阳光透过树木洒落下来。' },
  es: { word: 'Espontáneo',      sentence: 'La luz de la mañana se filtraba entre los árboles.' },
  fr: { word: 'Spontané',        sentence: 'La lumière du matin filtrait à travers les arbres.' },
  de: { word: 'Spontan',         sentence: 'Das Morgenlicht drang durch die Bäume.' },
  it: { word: 'Spontaneo',       sentence: 'La luce del mattino filtrava tra gli alberi.' },
  pt: { word: 'Espontâneo',      sentence: 'A luz da manhã filtrava-se pelas árvores.' },
  ru: { word: 'Спонтанный',      sentence: 'Утренний свет проникал сквозь деревья.' },
  ar: { word: 'عفوي',            sentence: 'تسرَّب ضوء الصباح عبر الأشجار.' },
  hi: { word: 'स्वतःस्फूर्त',  sentence: 'सुबह की रोशनी पेड़ों के बीच से छनकर आ रही थी।' },
  tr: { word: 'Kendiliğinden',   sentence: 'Sabah ışığı ağaçların arasından süzülüyordu.' },
  nl: { word: 'Spontaan',        sentence: 'Het ochtendlicht filterde door de bomen.' },
  vi: { word: 'Ngẫu hứng',       sentence: 'Ánh sáng ban mai lọc qua tán cây.' },
  th: { word: 'โดยธรรมชาติ',     sentence: 'แสงเช้ากรองผ่านต้นไม้อย่างงดงาม' },
  id: { word: 'Spontan',         sentence: 'Cahaya pagi menyaring melalui pepohonan.' },
  pl: { word: 'Spontaniczny',    sentence: 'Poranne światło przesączało się przez drzewa.' },
  el: { word: 'Αυθόρμητος',      sentence: 'Το πρωινό φως διαπερνούσε τα δέντρα.' },
  sv: { word: 'Spontan',         sentence: 'Morgonljuset filtrerades genom träden.' },
};

function normalizeLangCode(code: string | undefined): string {
  if (!code || code === 'other') return 'en';
  return code.split(/[-_]/)[0].toLowerCase();
}

type DemoKey = 'word_default' | 'word_ai' | 'sentence_default' | 'sentence_ai';

const FREE_IDS           = new Set(['solid_blue', 'solid_gray']);
const PREMIUM_SHOP_ITEMS = SHOP_ITEMS.filter(i => !FREE_IDS.has(i.id));
const SKIN_BY_ID         = new Map(SKINS.map(s => [s.id, s]));

const STRIP_W     = 84;
const STRIP_H     = Math.round(STRIP_W * 1.5);
const CARD_PADDING = 26;
const TOOL_BLOCK_W = (SW - 32 - CARD_PADDING * 2 - 12) / 2;

// Bear container dimensions
const BW = 150, BH = 190;

// ── Bear mascot (dark-navy code-native illustration) ──────────────────────────

const BearMascot = React.memo(() => (
  <View style={{ width: BW, height: BH }}>

    {/* === BACK LEG (right, slightly behind) === */}
    <View style={{ position:'absolute', width:28, height:46, borderRadius:14, backgroundColor:BEAR_WHITE, top:153, left:94, transform:[{rotate:'10deg'}] }} />
    <View style={{ position:'absolute', width:24, height:42, borderRadius:12, backgroundColor:BEAR_BODY,  top:155, left:96, transform:[{rotate:'10deg'}] }} />

    {/* === BACK ARM (right side, swinging back) === */}
    <View style={{ position:'absolute', width:22, height:50, borderRadius:11, backgroundColor:BEAR_WHITE, top:87, left:112, transform:[{rotate:'24deg'}] }} />
    <View style={{ position:'absolute', width:18, height:46, borderRadius:9,  backgroundColor:BEAR_BODY,  top:89, left:114, transform:[{rotate:'24deg'}] }} />

    {/* === BODY === */}
    <View style={{ position:'absolute', width:84, height:92, borderRadius:28, backgroundColor:BEAR_WHITE, top:80, left:33 }} />
    <View style={{ position:'absolute', width:78, height:86, borderRadius:26, backgroundColor:BEAR_BODY,  top:83, left:36 }}>
      {/* Belly */}
      <View style={{ position:'absolute', width:44, height:58, borderRadius:22, backgroundColor:BEAR_BELLY, top:14, left:17 }} />
    </View>

    {/* === TAIL === */}
    <View style={{ position:'absolute', width:20, height:20, borderRadius:10, backgroundColor:BEAR_WHITE, top:118, left:107 }} />
    <View style={{ position:'absolute', width:16, height:16, borderRadius:8,  backgroundColor:BEAR_BODY,  top:120, left:109 }} />

    {/* === BOOK (held against left side, on top of front arm) === */}
    <View style={{ position:'absolute', width:36, height:48, borderRadius:7, backgroundColor:BEAR_WHITE, top:100, left:6,  zIndex:4 }} />
    <View style={{ position:'absolute', width:32, height:44, borderRadius:6, backgroundColor:BEAR_INNER, top:102, left:8,  zIndex:4 }}>
      <View style={{ position:'absolute', width:3,  height:34, borderRadius:1.5, backgroundColor:'#ffffff25', top:5, left:8 }} />
      <View style={{ position:'absolute', width:16, height:34, borderRadius:3,   backgroundColor:BEAR_WHITE,  top:5, right:4 }}>
        <View style={{ position:'absolute', width:10, height:1.5, borderRadius:0.75, backgroundColor:'#bbb', top:5,  left:3 }} />
        <View style={{ position:'absolute', width:10, height:1.5, borderRadius:0.75, backgroundColor:'#bbb', top:9,  left:3 }} />
        <View style={{ position:'absolute', width:10, height:1.5, borderRadius:0.75, backgroundColor:'#bbb', top:13, left:3 }} />
        <View style={{ position:'absolute', width:8,  height:1.5, borderRadius:0.75, backgroundColor:'#bbb', top:17, left:3 }} />
      </View>
    </View>

    {/* === FRONT ARM (left side, extends forward to hold book) === */}
    <View style={{ position:'absolute', width:22, height:50, borderRadius:11, backgroundColor:BEAR_WHITE, top:86, left:14, transform:[{rotate:'-20deg'}] }} />
    <View style={{ position:'absolute', width:18, height:46, borderRadius:9,  backgroundColor:BEAR_BODY,  top:88, left:16, transform:[{rotate:'-20deg'}] }} />

    {/* === CROWN PEAKS (behind head/ears but above body) === */}
    {/* Left peak */}
    <View style={{ position:'absolute', width:15, height:20, borderRadius:7,  backgroundColor:BEAR_CROWN, top:9, left:49 }} />
    {/* Center peak (tallest) */}
    <View style={{ position:'absolute', width:19, height:26, borderRadius:9,  backgroundColor:BEAR_CROWN, top:4, left:65 }} />
    {/* Right peak */}
    <View style={{ position:'absolute', width:15, height:20, borderRadius:7,  backgroundColor:BEAR_CROWN, top:9, right:48 }} />

    {/* === EARS === */}
    {/* Left ear outline */}
    <View style={{ position:'absolute', width:28, height:28, borderRadius:14, backgroundColor:BEAR_WHITE, top:33, left:32 }} />
    <View style={{ position:'absolute', width:24, height:24, borderRadius:12, backgroundColor:BEAR_BODY,  top:35, left:34 }}>
      <View style={{ position:'absolute', width:11, height:11, borderRadius:5.5, backgroundColor:BEAR_INNER, top:6.5, left:6.5 }} />
    </View>
    {/* Right ear outline */}
    <View style={{ position:'absolute', width:28, height:28, borderRadius:14, backgroundColor:BEAR_WHITE, top:33, right:32 }} />
    <View style={{ position:'absolute', width:24, height:24, borderRadius:12, backgroundColor:BEAR_BODY,  top:35, right:34 }}>
      <View style={{ position:'absolute', width:11, height:11, borderRadius:5.5, backgroundColor:BEAR_INNER, top:6.5, left:6.5 }} />
    </View>

    {/* === HEAD === */}
    {/* White outline */}
    <View style={{ position:'absolute', width:78, height:68, borderRadius:39, backgroundColor:BEAR_WHITE, top:26, left:36 }} />
    {/* Head */}
    <View style={{ position:'absolute', width:72, height:62, borderRadius:36, backgroundColor:BEAR_BODY,  top:29, left:39 }}>
      {/* Left eye */}
      <View style={{ position:'absolute', width:11, height:13, borderRadius:5.5, backgroundColor:BEAR_WHITE, top:16, left:12 }} />
      <View style={{ position:'absolute', width:7,  height:9,  borderRadius:3.5, backgroundColor:BEAR_INNER, top:18, left:14 }} />
      <View style={{ position:'absolute', width:2.5, height:3, borderRadius:1.5, backgroundColor:'#ffffffdd', top:17.5, left:15 }} />
      {/* Right eye */}
      <View style={{ position:'absolute', width:11, height:13, borderRadius:5.5, backgroundColor:BEAR_WHITE, top:16, right:12 }} />
      <View style={{ position:'absolute', width:7,  height:9,  borderRadius:3.5, backgroundColor:BEAR_INNER, top:18, right:14 }} />
      <View style={{ position:'absolute', width:2.5, height:3, borderRadius:1.5, backgroundColor:'#ffffffdd', top:17.5, right:15 }} />
      {/* Nose */}
      <View style={{ position:'absolute', width:12, height:8, borderRadius:4, backgroundColor:BEAR_WHITE, top:34, left:30 }} />
      {/* Cheek blush */}
      <View style={{ position:'absolute', width:13, height:6, borderRadius:6, backgroundColor:'#FF9AC5', opacity:0.42, top:32, left:3 }} />
      <View style={{ position:'absolute', width:13, height:6, borderRadius:6, backgroundColor:'#FF9AC5', opacity:0.42, top:32, right:3 }} />
    </View>

    {/* === CROWN BAND (on top of head/ears) === */}
    <View style={{ position:'absolute', width:58, height:16, borderRadius:7, backgroundColor:BEAR_CROWN, top:22, left:46 }}>
      <View style={{ position:'absolute', width:6, height:6, borderRadius:3, backgroundColor:'#ffffff70', top:5, left:10 }} />
      <View style={{ position:'absolute', width:6, height:6, borderRadius:3, backgroundColor:'#ffffff70', top:5, left:26 }} />
      <View style={{ position:'absolute', width:6, height:6, borderRadius:3, backgroundColor:'#ffffff70', top:5, right:10 }} />
    </View>

    {/* === FRONT LEG (left, stepping forward) === */}
    <View style={{ position:'absolute', width:28, height:46, borderRadius:14, backgroundColor:BEAR_WHITE, top:147, left:38, transform:[{rotate:'-12deg'}] }} />
    <View style={{ position:'absolute', width:24, height:42, borderRadius:12, backgroundColor:BEAR_BODY,  top:149, left:40, transform:[{rotate:'-12deg'}] }} />

  </View>
));

// ── Mini bear face for coffee card ────────────────────────────────────────────

const MiniBear = React.memo(() => (
  <View style={{ width: 44, height: 40, position: 'relative' }}>
    {/* Ears */}
    <View style={{ position:'absolute', width:14, height:14, borderRadius:7, backgroundColor:BEAR_WHITE, top:2,  left:3 }} />
    <View style={{ position:'absolute', width:11, height:11, borderRadius:5.5, backgroundColor:BEAR_BODY, top:3.5, left:4.5 }}>
      <View style={{ position:'absolute', width:5, height:5, borderRadius:2.5, backgroundColor:BEAR_INNER, top:3, left:3 }} />
    </View>
    <View style={{ position:'absolute', width:14, height:14, borderRadius:7, backgroundColor:BEAR_WHITE, top:2,  right:3 }} />
    <View style={{ position:'absolute', width:11, height:11, borderRadius:5.5, backgroundColor:BEAR_BODY, top:3.5, right:4.5 }}>
      <View style={{ position:'absolute', width:5, height:5, borderRadius:2.5, backgroundColor:BEAR_INNER, top:3, left:3 }} />
    </View>
    {/* Head */}
    <View style={{ position:'absolute', width:40, height:34, borderRadius:20, backgroundColor:BEAR_WHITE, top:7,  left:2 }} />
    <View style={{ position:'absolute', width:36, height:30, borderRadius:18, backgroundColor:BEAR_BODY,  top:9,  left:4 }}>
      <View style={{ position:'absolute', width:6, height:7, borderRadius:3, backgroundColor:BEAR_WHITE, top:7, left:7 }} />
      <View style={{ position:'absolute', width:4, height:5, borderRadius:2, backgroundColor:BEAR_INNER, top:8, left:8 }} />
      <View style={{ position:'absolute', width:6, height:7, borderRadius:3, backgroundColor:BEAR_WHITE, top:7, right:7 }} />
      <View style={{ position:'absolute', width:4, height:5, borderRadius:2, backgroundColor:BEAR_INNER, top:8, right:8 }} />
      <View style={{ position:'absolute', width:7, height:5, borderRadius:2.5, backgroundColor:BEAR_WHITE, top:18, left:14.5 }} />
    </View>
  </View>
));

// ── Hero section ──────────────────────────────────────────────────────────────

const HeroSection = React.memo(({ pal, t }: { pal: Palette; t: (k: any) => string }) => (
  <View style={[hs.container, { backgroundColor: HERO_BG }]}>

    {/* Ghost background pattern */}
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {GHOST_ICONS.map((g, i) => (
        <Ionicons
          key={`g${i}`}
          name={g.icon}
          size={g.size}
          color={PLAN_BLUE}
          style={[
            { position:'absolute', opacity:0.07 },
            { top: g.top },
            g.left  !== undefined ? { left:  g.left  } : {},
            g.right !== undefined ? { right: g.right } : {},
          ]}
        />
      ))}
    </View>

    {/* Confetti dots */}
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {CONFETTI.map((c, i) => (
        <View key={`c${i}`} style={{
          position:'absolute', width:c.w, height:c.h, borderRadius:2,
          backgroundColor:c.color, top:c.top,
          ...(c.left !== undefined ? { left: c.left } : {}),
          ...(c.right !== undefined ? { right: c.right } : {}),
          transform:[{ rotate: c.rotate }], opacity:0.85,
        }} />
      ))}
    </View>

    {/* Foreground decorative icons */}
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {DECO_ICONS.map((d, i) => (
        <Ionicons
          key={`d${i}`}
          name={d.icon}
          size={d.size}
          color={d.color}
          style={[
            { position:'absolute', opacity:0.92 },
            { top: d.top },
            d.left  !== undefined ? { left:  d.left  } : {},
            d.right !== undefined ? { right: d.right } : {},
          ]}
        />
      ))}
    </View>

    {/* Badge pill — sparkles float outside */}
    <View style={hs.badgeRow}>
      <Ionicons name="sparkles" size={14} color={BEAR_CROWN} style={{ marginRight: 6 }} />
      <View style={hs.badge}>
        <Text style={hs.badgeText}>{t('plan_promo_label')}</Text>
      </View>
      <Ionicons name="sparkles" size={14} color={BEAR_CROWN} style={{ marginLeft: 6 }} />
    </View>

    {/* Main headline */}
    <Text style={hs.headline}>{t('plan_hero_headline')}</Text>

    {/* Bear mascot */}
    <View style={hs.bearWrap}>
      <BearMascot />
    </View>

    {/* Dotted bottom line */}
    <View style={hs.dotRow}>
      {Array.from({ length: 22 }).map((_, i) => (
        <View key={i} style={hs.dot} />
      ))}
    </View>

  </View>
));

// ── Ribbon banner ─────────────────────────────────────────────────────────────

const RibbonBanner = React.memo(({ label }: { label: string }) => (
  <View style={s.ribbonWrap}>
    <View style={s.ribbonInner}>
      <View style={s.ribbonLine} />
      <View style={s.ribbon}>
        <Text style={s.ribbonText}>{label}</Text>
      </View>
      <View style={s.ribbonLine} />
    </View>
  </View>
));

// ── Coffee value card ─────────────────────────────────────────────────────────

const CoffeeValueCard = React.memo(({ t }: { t: (k: any) => string }) => (
  <View style={cvs.card}>

    {/* Left: mini bear peeking over coffee cup */}
    <View style={cvs.leftZone}>
      <View style={cvs.bearPeek}>
        <MiniBear />
      </View>
      <Ionicons name="cafe" size={36} color="#7B5032" style={cvs.coffeeIcon} />
    </View>

    {/* Text block */}
    <View style={cvs.textBlock}>
      <View style={cvs.textRow1}>
        <Ionicons name="sparkles" size={11} color={BEAR_CROWN} />
        <Text style={cvs.line1} numberOfLines={2}>{t('plan_coffee_line1')}</Text>
      </View>
      <Text style={cvs.line2}>{t('plan_coffee_line2')}</Text>
      <Ionicons name="sparkles" size={11} color={BEAR_CROWN} style={{ marginTop: 4 }} />
    </View>

  </View>
));

// ── Plan chip ─────────────────────────────────────────────────────────────────

const PlanChip = React.memo(({ label }: { label: string }) => (
  <View style={s.planChip}>
    <Ionicons name="checkmark-circle" size={13} color="#fff" style={{ marginRight: 4 }} />
    <Text style={s.planChipText}>{label}</Text>
  </View>
));

// ── Voice row ─────────────────────────────────────────────────────────────────

interface VoiceRowProps { pal: Palette; text: string; demoKeyDefault: DemoKey; demoKeyAi: DemoKey; playingDemo: DemoKey | null; onPlay: (key: DemoKey) => void; defaultLabel: string }

const VoiceRow = React.memo(({ text, demoKeyDefault, demoKeyAi, playingDemo, onPlay, pal, defaultLabel }: VoiceRowProps) => (
  <View style={s.voiceRow}>
    <View style={s.voiceTextCol}>
      <Text style={[s.voiceText, { color: pal.text }]} numberOfLines={2}>{text}</Text>
    </View>
    <View style={s.voiceButtonCol}>
      <TouchableOpacity style={[s.voiceBtn, { borderColor: pal.border, backgroundColor: pal.chip }]} onPress={() => onPlay(demoKeyDefault)} activeOpacity={0.7}>
        <Ionicons name={playingDemo === demoKeyDefault ? 'pause-circle' : 'volume-medium-outline'} size={20} color={pal.sub} />
        <Text style={[s.voiceBtnLabel, { color: pal.sub }]} numberOfLines={1}>{defaultLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.voiceBtnAI} onPress={() => onPlay(demoKeyAi)} activeOpacity={0.7}>
        <Ionicons name={playingDemo === demoKeyAi ? 'pause-circle' : 'volume-medium'} size={20} color="#fff" />
        <Text style={s.voiceBtnAILabel}>AI</Text>
      </TouchableOpacity>
    </View>
  </View>
));

// ── AI Voice card ─────────────────────────────────────────────────────────────

interface AIVoiceCardProps { pal: Palette; demo: DemoContent; playingDemo: DemoKey | null; onPlay: (key: DemoKey) => void; t: (k: any) => string }

const AIVoiceCard = React.memo(({ demo, playingDemo, onPlay, t, pal }: AIVoiceCardProps) => (
  <View style={[s.featureCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
    <Text style={[s.cardTitle, { color: pal.text }]}>{t('feature_ai_voice')}</Text>
    <View style={s.voiceDemoBox}>
      <VoiceRow text={demo.word} demoKeyDefault="word_default" demoKeyAi="word_ai" playingDemo={playingDemo} onPlay={onPlay} pal={pal} defaultLabel={t('default_voice')} />
      <View style={[s.voiceDivider, { backgroundColor: pal.border }]} />
      <VoiceRow text={demo.sentence} demoKeyDefault="sentence_default" demoKeyAi="sentence_ai" playingDemo={playingDemo} onPlay={onPlay} pal={pal} defaultLabel={t('default_voice')} />
    </View>
    <PlanChip label={t('basic_plan_name')} />
    <Text style={[s.cardDesc, { color: pal.sub }]}>{t('ai_voice_promo_desc')}</Text>
  </View>
));

// ── AI Tools card ─────────────────────────────────────────────────────────────

const AI_TOOLS = [
  { icon: 'bulb-outline'          as const, key: 'feature_ai_meaning' as const },
  { icon: 'document-text-outline' as const, key: 'feature_ai_example' as const },
  { icon: 'layers-outline'        as const, key: 'feature_breakdown'   as const },
  { icon: 'language-outline'      as const, key: 'feature_translate'   as const },
];

const AiFeaturesCard = React.memo(({ t, pal }: { t: (k: any) => string; pal: Palette }) => (
  <View style={[s.featureCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
    <Text style={[s.cardTitle, { color: pal.text }]}>{t('ai_tools_title')}</Text>
    <View style={s.toolsGrid}>
      {AI_TOOLS.map(({ icon, key }) => (
        <View key={key} style={[s.toolBlock, { width: TOOL_BLOCK_W }]}>
          <View style={s.toolIconBubble}><Ionicons name={icon} size={22} color={PLAN_BLUE} /></View>
          <Text style={[s.toolLabel, { color: pal.text }]}>{t(key)}</Text>
        </View>
      ))}
    </View>
    <PlanChip label={t('basic_plan_name')} />
    <Text style={[s.cardDesc, { color: pal.sub }]}>{t('ai_tools_desc')}</Text>
  </View>
));

// ── Premium Themes card ───────────────────────────────────────────────────────

const PremiumThemesCard = React.memo(({ t, pal }: { t: (k: any) => string; pal: Palette }) => (
  <View style={[s.featureCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
    <Text style={[s.cardTitle, { color: pal.text }]}>{t('feature_all_themes')}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeStrip} bounces={false}>
      {PREMIUM_SHOP_ITEMS.map(item => (
        <View key={item.id} style={[s.themeStripCard, { borderColor: pal.border }]}>
          {item.category === 'premium' ? (
            <PremiumSkinPreview item={item} skinData={SKIN_BY_ID.get(item.id)} width={STRIP_W} height={STRIP_H} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: item.previewBg, borderRadius: 10 }]} />
          )}
        </View>
      ))}
    </ScrollView>
    <PlanChip label={t('basic_plan_name')} />
    <Text style={[s.cardDesc, { color: pal.sub }]}>{t('themes_switch_desc')}</Text>
  </View>
));

// ── Pricing section ───────────────────────────────────────────────────────────

interface PricingSectionProps {
  pal: Palette;
  t: (k: any) => string;
  isSubscribed: boolean;
  loading: boolean;
  onSubscribe: () => void;
  onRestore: () => void;
  onManageSubscription?: () => void;
}

const PricingSection = React.memo(({
  pal, t, isSubscribed, loading, onSubscribe, onRestore, onManageSubscription,
}: PricingSectionProps) => (
  <View style={[ps.container, { backgroundColor: pal.card, borderColor: pal.border }]}>

    {/* Plan heading */}
    <View style={ps.planLabelRow}>
      <View style={ps.planDot} />
      <Text style={ps.planLabel}>{t('basic_plan_name')}</Text>
      <View style={ps.planDot} />
    </View>

    {isSubscribed ? (
      <TouchableOpacity
        style={[ps.btn, { backgroundColor: `${PLAN_BLUE}14`, borderWidth: 1.5, borderColor: PLAN_BLUE }]}
        onPress={onManageSubscription}
        activeOpacity={0.8}
        accessibilityLabel="Manage subscription"
      >
        <Text style={[ps.btnText, { color: PLAN_BLUE }]}>Manage Subscription</Text>
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        style={[ps.btn, { backgroundColor: loading ? `${PLAN_BLUE}80` : PLAN_BLUE }]}
        onPress={onSubscribe}
        disabled={loading}
        activeOpacity={0.85}
        accessibilityLabel={t('subscribe_price')}
      >
        <Text style={[ps.btnText, { color: '#fff' }]}>
          {loading ? '···' : t('subscribe_price')}
        </Text>
      </TouchableOpacity>
    )}

    <TouchableOpacity style={ps.restoreBtn} onPress={onRestore} activeOpacity={0.7} accessibilityLabel={t('restore_purchases')}>
      <Text style={[ps.restoreText, { color: pal.sub }]}>{t('restore_purchases')}</Text>
    </TouchableOpacity>

  </View>
));

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => Promise<void>;
  onRestore: () => Promise<void>;
  themeColor: string;
  pal: Palette;
  isSubscribed?: boolean;
  learningLang?: string;
  nativeLang?: string;
  onManageSubscription?: () => void;
}

export function ProSheet({
  visible,
  onClose,
  onSubscribe,
  onRestore,
  themeColor,
  pal,
  isSubscribed = false,
  learningLang,
  nativeLang = 'en-US',
  onManageSubscription,
}: Props) {
  const t      = useLang();
  const insets = useSafeAreaInsets();
  const slideY    = useRef(new Animated.Value(SH)).current;
  const backdropO = useRef(new Animated.Value(0)).current;

  const [loading, setLoading]                       = useState(false);
  const [playingDemo, setPlayingDemo]               = useState<DemoKey | null>(null);
  const [resolvedSampleLang, setResolvedSampleLang] = useState('en-US');

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(ONBOARDING_KEY).then(raw => {
      if (!raw) { setResolvedSampleLang(learningLang ?? nativeLang ?? 'en-US'); return; }
      try {
        const ob: OnboardingChoices = JSON.parse(raw);
        const lang =
          ob.purpose === 'language' && ob.learningLang && ob.learningLang !== 'other'
            ? ob.learningLang
            : ob.nativeLang && ob.nativeLang !== 'other'
            ? ob.nativeLang
            : null;
        setResolvedSampleLang(lang ?? learningLang ?? nativeLang ?? 'en-US');
      } catch { setResolvedSampleLang(learningLang ?? nativeLang ?? 'en-US'); }
    });
  }, [visible]);

  const sampleKey = normalizeLangCode(resolvedSampleLang);
  const demo      = DEMO_SAMPLES[sampleKey] ?? DEMO_SAMPLES.en;

  useEffect(() => {
    if (visible) {
      slideY.setValue(SH);
      backdropO.setValue(0);
      Animated.parallel([
        Animated.timing(backdropO, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropO, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: SH, duration: 220, useNativeDriver: true }),
      ]).start();
      setPlayingDemo(null);
      stopPlayback();
    }
  }, [visible]);

  useEffect(() => { setPlayingDemo(null); stopPlayback(); }, [sampleKey]);

  const handlePlayDemo = async (key: DemoKey) => {
    if (playingDemo === key) { stopPlayback(); setPlayingDemo(null); return; }
    stopPlayback();
    setPlayingDemo(key);
    const text = key.startsWith('word') ? demo.word : demo.sentence;
    try { await speak(text, key.endsWith('ai'), resolvedSampleLang); }
    finally { setPlayingDemo(null); }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try { await onSubscribe(); } finally { setLoading(false); }
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdropO }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[s.sheet, { backgroundColor: pal.bg, transform: [{ translateY: slideY }] }]}>

        {/* Fixed header */}
        <View style={[s.header, {
          paddingTop: insets.top + 10,
          backgroundColor: pal.dialog,
          borderBottomColor: pal.border,
        }]}>
          <TouchableOpacity
            style={s.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color={pal.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: pal.text }]}>{t('basic_plan_name')}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* 1. Hero */}
          <HeroSection pal={pal} t={t} />

          {/* 2. Ribbon — Compare Plans */}
          <RibbonBanner label={t('plan_compare_title')} />

          {/* 3. Coffee price card */}
          <CoffeeValueCard t={t} />

          {/* 4. Pricing / purchase */}
          <PricingSection
            pal={pal}
            t={t}
            isSubscribed={isSubscribed}
            loading={loading}
            onSubscribe={handleSubscribe}
            onRestore={onRestore}
            onManageSubscription={onManageSubscription}
          />

          {/* 5. Feature cards */}
          <RibbonBanner label={t('whats_included')} />
          <AIVoiceCard demo={demo} playingDemo={playingDemo} onPlay={handlePlayDemo} t={t} pal={pal} />
          <AiFeaturesCard t={t} pal={pal} />
          <PremiumThemesCard t={t} pal={pal} />
        </ScrollView>

      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Hero styles
const hs = StyleSheet.create({
  container: {
    paddingTop: 36,
    paddingBottom: 0,
    paddingHorizontal: 0,
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 310,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    zIndex: 2,
  },
  badge: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: PLAN_BLUE,
    backgroundColor: `${PLAN_BLUE}10`,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: PLAN_BLUE,
    letterSpacing: 0.3,
  },
  headline: {
    fontSize: 36,
    fontWeight: '900',
    color: HERO_DARK,
    textAlign: 'center',
    lineHeight: 44,
    letterSpacing: -0.5,
    marginBottom: 18,
    zIndex: 2,
    paddingHorizontal: 20,
  },
  bearWrap: {
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 2,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 14,
    paddingTop: 4,
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: PLAN_BLUE,
    opacity: 0.35,
  },
});

// Coffee card styles
const cvs = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 2,
    borderRadius: 20,
    backgroundColor: '#F0F2F6',
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  leftZone: {
    width: 54,
    alignItems: 'center',
  },
  bearPeek: {
    marginBottom: -12,
    zIndex: 2,
  },
  coffeeIcon: {
    zIndex: 1,
  },
  textBlock: {
    flex: 1,
  },
  textRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  line1: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8A94A6',
    lineHeight: 16,
    flexShrink: 1,
  },
  line2: {
    fontSize: 15,
    fontWeight: '800',
    color: HERO_DARK,
    lineHeight: 20,
  },
});

// Pricing section styles
const ps = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  planLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  planDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PLAN_BLUE,
    opacity: 0.5,
  },
  planLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: PLAN_BLUE,
    letterSpacing: 0.3,
  },
  btn: {
    width: '100%',
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PLAN_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  restoreText: {
    fontSize: 13,
  },
});

// Main stylesheet
const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: 0,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0.2 },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flex: 1 },

  // ── Ribbon banner ─────────────────────────────────────────────────────────
  ribbonWrap: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  ribbonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  ribbonLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: PLAN_BLUE,
    opacity: 0.25,
    borderRadius: 1,
  },
  ribbon: {
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: HERO_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: HERO_DARK,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
    minWidth: 180,
  },
  ribbonText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },

  // ── Plan chip ─────────────────────────────────────────────────────────────
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: PLAN_BLUE,
    marginTop: 22,
  },
  planChipText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  // ── Feature cards ─────────────────────────────────────────────────────────
  featureCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 22,
    borderWidth: 1,
    padding: CARD_PADDING,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 28,
    marginBottom: 20,
  },
  cardDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 14,
  },

  // ── Voice demo ────────────────────────────────────────────────────────────
  voiceDemoBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    backgroundColor: PLAN_BLUE + '07',
    borderColor: PLAN_BLUE + '22',
  },
  voiceDivider: { height: StyleSheet.hairlineWidth, marginVertical: 18 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  voiceTextCol: { flex: 1 },
  voiceText: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  voiceButtonCol: { flexDirection: 'row', gap: 8 },
  voiceBtn: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 56,
    gap: 3,
  },
  voiceBtnAI: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: PLAN_BLUE,
    minWidth: 56,
    gap: 3,
    shadowColor: 'rgba(0,0,0,0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 2,
  },
  voiceBtnLabel:   { fontSize: 9,  fontWeight: '700', letterSpacing: 0.3 },
  voiceBtnAILabel: { fontSize: 9,  fontWeight: '800', letterSpacing: 0.5, color: '#fff' },

  // ── AI tools 2×2 grid ────────────────────────────────────────────────────
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  toolBlock: {
    paddingVertical: 20,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: PLAN_BLUE + '08',
    borderColor: PLAN_BLUE + '20',
    alignItems: 'center',
    gap: 12,
  },
  toolIconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PLAN_BLUE + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },

  // ── Theme carousel ────────────────────────────────────────────────────────
  themeStrip: { gap: 10, paddingVertical: 6, paddingHorizontal: 2 },
  themeStripCard: {
    width: STRIP_W,
    height: STRIP_H,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
});
