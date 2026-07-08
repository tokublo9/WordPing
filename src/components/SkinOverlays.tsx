/**
 * SkinOverlays.tsx
 * Animated overlay components for each Premium skin.
 * All animations use useNativeDriver:true (transforms + opacity only) for smooth 60fps.
 */
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { useEffect, useRef } from 'react';

const { width: W, height: H } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Shared animation hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Loops 0→1 at constant speed, starting after `delay` ms. */
function useFall(duration: number, delay: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    const t = setTimeout(() => anim.start(), delay);
    return () => { clearTimeout(t); anim.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

/** Loops 0→1→0 smoothly, starting after `delay` ms. */
function usePulse(halfPeriod: number, delay: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const ease = Easing.inOut(Easing.ease);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: halfPeriod, easing: ease, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: halfPeriod, easing: ease, useNativeDriver: true }),
      ]),
    );
    const t = setTimeout(() => anim.start(), delay);
    return () => { clearTimeout(t); anim.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: falling petal / leaf
// ─────────────────────────────────────────────────────────────────────────────

interface FallSpec {
  xFrac: number;
  w: number;
  h: number;
  color: string;
  opacity: number;
  duration: number;
  delay: number;
  sway: number;
  spins: number;
}

function FallingItem({ spec }: { spec: FallSpec }) {
  const p = useFall(spec.duration, spec.delay);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [-spec.h - 4, H + spec.h] });
  const translateX = p.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, spec.sway, 0, -spec.sway, 0],
  });
  const rotate = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spec.spins * 360}deg`] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W, top: 0,
      width: spec.w, height: spec.h, borderRadius: spec.h / 2,
      backgroundColor: spec.color, opacity: spec.opacity,
      transform: [{ translateY }, { translateX }, { rotate }],
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GreenNatureOverlay — floating leaves
// ─────────────────────────────────────────────────────────────────────────────

const LEAVES: FallSpec[] = [
  { xFrac: 0.08, w: 8,  h: 5,  color: '#4CAF50', opacity: 0.26, duration: 11000, delay: 0,    sway: 14, spins: 0 },
  { xFrac: 0.24, w: 6,  h: 4,  color: '#81C784', opacity: 0.20, duration: 13500, delay: 2100, sway: 11, spins: 0 },
  { xFrac: 0.41, w: 9,  h: 6,  color: '#388E3C', opacity: 0.22, duration: 10000, delay: 950,  sway: 17, spins: 0 },
  { xFrac: 0.57, w: 7,  h: 5,  color: '#A5D6A7', opacity: 0.24, duration: 13000, delay: 3800, sway: 10, spins: 0 },
  { xFrac: 0.70, w: 8,  h: 5,  color: '#66BB6A', opacity: 0.18, duration: 11500, delay: 650,  sway: 18, spins: 0 },
  { xFrac: 0.83, w: 6,  h: 4,  color: '#C8E6C9', opacity: 0.16, duration: 14500, delay: 5200, sway: 10, spins: 0 },
  { xFrac: 0.16, w: 7,  h: 5,  color: '#2E7D32', opacity: 0.21, duration: 10500, delay: 2800, sway: 14, spins: 0 },
];

const GREEN_RAYS = [
  { xFrac: 0.22, halfPeriod: 5500, delay: 0    },
  { xFrac: 0.54, halfPeriod: 7800, delay: 3000 },
  { xFrac: 0.80, halfPeriod: 6500, delay: 5200 },
];

const POLLEN = [
  { xFrac: 0.20, yStart: H * 0.72, size: 2, maxOp: 0.18, riseMs: 7800,  pulseMs: 3600, delay: 0    },
  { xFrac: 0.44, yStart: H * 0.65, size: 2, maxOp: 0.14, riseMs: 9800,  pulseMs: 4600, delay: 1700 },
  { xFrac: 0.64, yStart: H * 0.76, size: 2, maxOp: 0.16, riseMs: 8800,  pulseMs: 4200, delay: 3100 },
  { xFrac: 0.80, yStart: H * 0.60, size: 2, maxOp: 0.12, riseMs: 11500, pulseMs: 5400, delay: 850  },
  { xFrac: 0.34, yStart: H * 0.82, size: 2, maxOp: 0.15, riseMs: 9300,  pulseMs: 4400, delay: 4000 },
];

export function GreenNatureOverlay() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// BeautifulWoodsOverlay — angled light rays + floating dust motes
// ─────────────────────────────────────────────────────────────────────────────

interface DustSpec { xFrac: number; yStart: number; size: number; maxOp: number; riseMs: number; pulseMs: number; delay: number; }

const DUST_MOTES: DustSpec[] = [
  { xFrac: 0.12, yStart: H * 0.62, size: 2, maxOp: 0.18, riseMs: 9000,  pulseMs: 4500, delay: 0 },
  { xFrac: 0.28, yStart: H * 0.50, size: 3, maxOp: 0.14, riseMs: 11500, pulseMs: 5500, delay: 1600 },
  { xFrac: 0.44, yStart: H * 0.72, size: 2, maxOp: 0.16, riseMs: 8200,  pulseMs: 4000, delay: 3200 },
  { xFrac: 0.60, yStart: H * 0.40, size: 2, maxOp: 0.12, riseMs: 12500, pulseMs: 6000, delay: 800  },
  { xFrac: 0.75, yStart: H * 0.66, size: 3, maxOp: 0.15, riseMs: 10200, pulseMs: 5000, delay: 2400 },
  { xFrac: 0.88, yStart: H * 0.55, size: 2, maxOp: 0.13, riseMs: 9800,  pulseMs: 4800, delay: 4200 },
  { xFrac: 0.34, yStart: H * 0.80, size: 2, maxOp: 0.17, riseMs: 8600,  pulseMs: 4200, delay: 600  },
  { xFrac: 0.55, yStart: H * 0.30, size: 3, maxOp: 0.11, riseMs: 13500, pulseMs: 6500, delay: 3600 },
];

function DustMote({ spec }: { spec: DustSpec }) {
  const rise  = useFall(spec.riseMs, spec.delay);
  const pulse = usePulse(spec.pulseMs, spec.delay + 300);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [spec.yStart, spec.yStart - 130] });
  const opacity    = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, spec.maxOp] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W, top: 0,
      width: spec.size, height: spec.size, borderRadius: spec.size / 2,
      backgroundColor: '#E8D5B0', opacity, transform: [{ translateY }],
    }} />
  );
}

interface RaySpec { xFrac: number; halfPeriod: number; delay: number; }
const RAYS: RaySpec[] = [
  { xFrac: 0.22, halfPeriod: 4200, delay: 0    },
  { xFrac: 0.48, halfPeriod: 5800, delay: 2000 },
  { xFrac: 0.70, halfPeriod: 3900, delay: 4000 },
];

function LightRay({ spec }: { spec: RaySpec }) {
  const pulse   = usePulse(spec.halfPeriod, spec.delay);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.06] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W - 35, top: -H * 0.12,
      width: 70, height: H * 1.35, backgroundColor: '#FFE090',
      opacity, transform: [{ rotate: '14deg' }],
    }} />
  );
}

export function BeautifulWoodsOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {RAYS.map((spec, i) => <LightRay key={i} spec={spec} />)}
      {DUST_MOTES.map((spec, i) => <DustMote key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RosesOverlay — gently falling rose petals
// ─────────────────────────────────────────────────────────────────────────────

const ROSE_PETALS: FallSpec[] = [
  { xFrac: 0.06, w: 9,  h: 6,  color: '#C44060', opacity: 0.34, duration: 11500, delay: 0,    sway: 12, spins: 0 },
  { xFrac: 0.20, w: 11, h: 7,  color: '#E8829A', opacity: 0.26, duration: 14000, delay: 2100, sway: 10, spins: 0 },
  { xFrac: 0.35, w: 8,  h: 5,  color: '#D4627A', opacity: 0.30, duration: 10500, delay: 950,  sway: 14, spins: 0 },
  { xFrac: 0.50, w: 12, h: 8,  color: '#F0A0B0', opacity: 0.22, duration: 15000, delay: 3800, sway: 8,  spins: 0 },
  { xFrac: 0.63, w: 9,  h: 6,  color: '#C44060', opacity: 0.28, duration: 12000, delay: 550,  sway: 16, spins: 0 },
  { xFrac: 0.76, w: 11, h: 7,  color: '#E07090', opacity: 0.24, duration: 13000, delay: 5000, sway: 10, spins: 0 },
  { xFrac: 0.12, w: 8,  h: 5,  color: '#FFB8C6', opacity: 0.22, duration: 14500, delay: 3100, sway: 12, spins: 0 },
  { xFrac: 0.88, w: 10, h: 6,  color: '#D4627A', opacity: 0.26, duration: 11000, delay: 1700, sway: 14, spins: 0 },
  { xFrac: 0.44, w: 9,  h: 6,  color: '#E8829A', opacity: 0.24, duration: 12500, delay: 4200, sway: 10, spins: 0 },
];

function RoseGlow() {
  const pulse   = usePulse(7000, 0);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.03, 0.09] });
  return (
    <Animated.View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: H * 0.28, backgroundColor: '#C44060', opacity,
    }} />
  );
}

export function RosesOverlay() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SunsetOverlay — warm glow pulse + slow drifting clouds
// ─────────────────────────────────────────────────────────────────────────────

function WarmGlow() {
  const pulse   = usePulse(5500, 0);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.13] });
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FF7020', opacity }]} />;
}

function SunGlow() {
  const pulse   = usePulse(7500, 1200);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.20] });
  return (
    <Animated.View style={{
      position: 'absolute', top: -W * 0.18, right: -W * 0.18,
      width: W * 0.75, height: W * 0.75, borderRadius: W * 0.375,
      backgroundColor: '#FFD060', opacity,
    }} />
  );
}

interface CloudSpec { top: number; width: number; maxOp: number; color: string; driftPx: number; driftMs: number; delay: number; }
const CLOUDS: CloudSpec[] = [
  { top: H * 0.05, width: W * 0.65, maxOp: 0.10, color: '#FFD0A0', driftPx:  30, driftMs: 14000, delay: 0    },
  { top: H * 0.16, width: W * 0.85, maxOp: 0.08, color: '#FFB870', driftPx: -22, driftMs: 19500, delay: 4000 },
  { top: H * 0.30, width: W * 0.56, maxOp: 0.09, color: '#FF9A60', driftPx:  26, driftMs: 12500, delay: 2000 },
  { top: H * 0.48, width: W * 0.74, maxOp: 0.06, color: '#FFD0A0', driftPx: -18, driftMs: 17000, delay: 6500 },
];

function Cloud({ spec }: { spec: CloudSpec }) {
  const drift      = usePulse(spec.driftMs, spec.delay);
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, spec.driftPx] });
  return (
    <Animated.View style={{
      position: 'absolute', top: spec.top, left: W * 0.08,
      width: spec.width, height: 44, borderRadius: 22,
      backgroundColor: spec.color, opacity: spec.maxOp,
      transform: [{ translateX }],
    }} />
  );
}

export function SunsetOverlay() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SakuraOverlay — cherry blossom petals
// ─────────────────────────────────────────────────────────────────────────────

const SAKURA_PETALS: FallSpec[] = [
  { xFrac: 0.04, w: 10, h: 7,  color: '#FFB7C5', opacity: 0.46, duration: 9000,  delay: 0,    sway: 18, spins: 0.4 },
  { xFrac: 0.18, w: 8,  h: 6,  color: '#FFC9D5', opacity: 0.38, duration: 11000, delay: 1300, sway: 22, spins: 0.4 },
  { xFrac: 0.30, w: 12, h: 8,  color: '#FF90A8', opacity: 0.36, duration: 8200,  delay: 750,  sway: 16, spins: 0.4 },
  { xFrac: 0.45, w: 9,  h: 6,  color: '#FFADC0', opacity: 0.44, duration: 12000, delay: 2600, sway: 20, spins: 0.4 },
  { xFrac: 0.58, w: 11, h: 7,  color: '#FFB7C5', opacity: 0.42, duration: 9500,  delay: 450,  sway: 18, spins: 0.4 },
  { xFrac: 0.70, w: 8,  h: 6,  color: '#FFC9D5', opacity: 0.34, duration: 10500, delay: 3600, sway: 14, spins: 0.4 },
  { xFrac: 0.82, w: 10, h: 7,  color: '#FF90A8', opacity: 0.46, duration: 8500,  delay: 1900, sway: 22, spins: 0.4 },
  { xFrac: 0.12, w: 9,  h: 6,  color: '#FFADC0', opacity: 0.38, duration: 12500, delay: 3200, sway: 18, spins: 0.4 },
  { xFrac: 0.40, w: 11, h: 7,  color: '#FFB7C5', opacity: 0.40, duration: 10000, delay: 1600, sway: 16, spins: 0.4 },
  { xFrac: 0.93, w: 8,  h: 6,  color: '#FFC9D5', opacity: 0.32, duration: 11500, delay: 650,  sway: 20, spins: 0.4 },
];

export function SakuraOverlay() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// GalaxyOverlay — twinkling stars + soft glow particles
// ─────────────────────────────────────────────────────────────────────────────

interface StarSpec { xFrac: number; yFrac: number; size: number; maxOp: number; halfPeriod: number; delay: number; }

const STARS: StarSpec[] = [
  { xFrac: 0.05, yFrac: 0.04, size: 2, maxOp: 0.80, halfPeriod: 1900, delay: 0    },
  { xFrac: 0.14, yFrac: 0.11, size: 1, maxOp: 0.60, halfPeriod: 2500, delay: 400  },
  { xFrac: 0.24, yFrac: 0.07, size: 2, maxOp: 0.72, halfPeriod: 1600, delay: 900  },
  { xFrac: 0.36, yFrac: 0.17, size: 1, maxOp: 0.58, halfPeriod: 2200, delay: 200  },
  { xFrac: 0.46, yFrac: 0.05, size: 2, maxOp: 0.76, halfPeriod: 1400, delay: 1300 },
  { xFrac: 0.56, yFrac: 0.13, size: 1, maxOp: 0.64, halfPeriod: 2900, delay: 600  },
  { xFrac: 0.66, yFrac: 0.08, size: 2, maxOp: 0.80, halfPeriod: 1700, delay: 1100 },
  { xFrac: 0.76, yFrac: 0.19, size: 1, maxOp: 0.55, halfPeriod: 2100, delay: 300  },
  { xFrac: 0.86, yFrac: 0.06, size: 2, maxOp: 0.70, halfPeriod: 1850, delay: 950  },
  { xFrac: 0.93, yFrac: 0.14, size: 1, maxOp: 0.60, halfPeriod: 2700, delay: 550  },
  { xFrac: 0.10, yFrac: 0.24, size: 2, maxOp: 0.65, halfPeriod: 1550, delay: 1500 },
  { xFrac: 0.30, yFrac: 0.29, size: 1, maxOp: 0.50, halfPeriod: 2300, delay: 750  },
  { xFrac: 0.50, yFrac: 0.27, size: 2, maxOp: 0.62, halfPeriod: 2000, delay: 1200 },
  { xFrac: 0.72, yFrac: 0.31, size: 1, maxOp: 0.55, halfPeriod: 2450, delay: 450  },
  { xFrac: 0.89, yFrac: 0.21, size: 2, maxOp: 0.68, halfPeriod: 1750, delay: 850  },
  // Lower half — sparser and dimmer
  { xFrac: 0.08, yFrac: 0.44, size: 1, maxOp: 0.35, halfPeriod: 2800, delay: 650  },
  { xFrac: 0.40, yFrac: 0.54, size: 1, maxOp: 0.30, halfPeriod: 3300, delay: 1700 },
  { xFrac: 0.66, yFrac: 0.47, size: 1, maxOp: 0.32, halfPeriod: 2650, delay: 250  },
  { xFrac: 0.83, yFrac: 0.51, size: 1, maxOp: 0.28, halfPeriod: 3100, delay: 1050 },
  { xFrac: 0.21, yFrac: 0.59, size: 1, maxOp: 0.25, halfPeriod: 3500, delay: 850  },
];

function Star({ spec }: { spec: StarSpec }) {
  const pulse   = usePulse(spec.halfPeriod, spec.delay);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [spec.maxOp * 0.15, spec.maxOp] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W, top: spec.yFrac * H,
      width: spec.size, height: spec.size, borderRadius: spec.size / 2,
      backgroundColor: '#FFFFFF', opacity,
    }} />
  );
}

interface GlowSpec { xFrac: number; yFrac: number; size: number; color: string; maxOp: number; halfPeriod: number; delay: number; }
const GLOWS: GlowSpec[] = [
  { xFrac: 0.15, yFrac: 0.09, size: 32, color: '#818CF8', maxOp: 0.12, halfPeriod: 4200, delay: 0    },
  { xFrac: 0.72, yFrac: 0.19, size: 26, color: '#C084FC', maxOp: 0.10, halfPeriod: 5800, delay: 2100 },
  { xFrac: 0.42, yFrac: 0.34, size: 22, color: '#818CF8', maxOp: 0.08, halfPeriod: 3700, delay: 1100 },
  { xFrac: 0.86, yFrac: 0.07, size: 16, color: '#A5F3FC', maxOp: 0.15, halfPeriod: 2900, delay: 3200 },
  { xFrac: 0.56, yFrac: 0.14, size: 14, color: '#F0ABFC', maxOp: 0.12, halfPeriod: 4700, delay: 1600 },
];

function GlowParticle({ spec }: { spec: GlowSpec }) {
  const pulse   = usePulse(spec.halfPeriod, spec.delay);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, spec.maxOp] });
  return (
    <Animated.View style={{
      position: 'absolute',
      left: spec.xFrac * W - spec.size / 2,
      top:  spec.yFrac * H - spec.size / 2,
      width: spec.size, height: spec.size, borderRadius: spec.size / 2,
      backgroundColor: spec.color, opacity,
    }} />
  );
}

export function GalaxyOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {STARS.map((spec, i) => <Star key={i} spec={spec} />)}
      {GLOWS.map((spec, i) => <GlowParticle key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SnowMountainOverlay — drifting snowflakes
// ─────────────────────────────────────────────────────────────────────────────

interface SnowSpec { xFrac: number; size: number; opacity: number; duration: number; delay: number; drift: number; }

const SNOWFLAKES: SnowSpec[] = [
  { xFrac: 0.05, size: 3, opacity: 0.38, duration: 13000, delay: 0,    drift: 6  },
  { xFrac: 0.13, size: 2, opacity: 0.28, duration: 16000, delay: 1400, drift: -5 },
  { xFrac: 0.22, size: 3, opacity: 0.34, duration: 12000, delay: 600,  drift: 7  },
  { xFrac: 0.31, size: 2, opacity: 0.30, duration: 15000, delay: 3000, drift: -6 },
  { xFrac: 0.41, size: 3, opacity: 0.36, duration: 13500, delay: 4500, drift: 5  },
  { xFrac: 0.50, size: 2, opacity: 0.26, duration: 17000, delay: 800,  drift: -7 },
  { xFrac: 0.59, size: 3, opacity: 0.32, duration: 12500, delay: 4000, drift: 6  },
  { xFrac: 0.68, size: 2, opacity: 0.28, duration: 15500, delay: 2200, drift: -5 },
  { xFrac: 0.77, size: 3, opacity: 0.34, duration: 14000, delay: 5500, drift: 6  },
  { xFrac: 0.86, size: 2, opacity: 0.30, duration: 16500, delay: 1800, drift: -6 },
  { xFrac: 0.09, size: 2, opacity: 0.26, duration: 14500, delay: 3500, drift: 5  },
  { xFrac: 0.36, size: 3, opacity: 0.32, duration: 13000, delay: 1000, drift: -6 },
  { xFrac: 0.55, size: 2, opacity: 0.28, duration: 16000, delay: 5000, drift: 7  },
  { xFrac: 0.73, size: 3, opacity: 0.36, duration: 12000, delay: 2700, drift: -5 },
  { xFrac: 0.91, size: 2, opacity: 0.28, duration: 15000, delay: 400,  drift: 6  },
];

function Snowflake({ spec }: { spec: SnowSpec }) {
  const p = useFall(spec.duration, spec.delay);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [-10, H + 10] });
  const translateX = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, spec.drift, 0] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W, top: 0,
      width: spec.size, height: spec.size, borderRadius: spec.size / 2,
      backgroundColor: '#FFFFFF', opacity: spec.opacity,
      transform: [{ translateY }, { translateX }],
    }} />
  );
}

export function SnowMountainOverlay() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// CyberNeonOverlay — diagonal laser beams from each corner + floating particles
// ─────────────────────────────────────────────────────────────────────────────

// Beam geometry is computed once from screen dimensions at module load.
const DIAG   = Math.sqrt((W / 2) ** 2 + (H / 2) ** 2);
const BEAM_L = DIAG * 1.30; // extend 30% past center for a clean crossing

interface DiagBeamConfig {
  cx: number;
  cy: number;
  rotation: string;
  color: string;
  halfPeriod: number;
  delay: number;
  maxOp: number;
}

function buildBeam(
  x0: number, y0: number,
  color: string,
  halfPeriod: number, delay: number, maxOp: number,
): DiagBeamConfig {
  // Unit vector from corner toward screen center
  const dx = (W / 2 - x0) / DIAG;
  const dy = (H / 2 - y0) / DIAG;
  // Place beam centre along that vector at distance BEAM_L/2 from corner
  const cx = x0 + BEAM_L / 2 * dx;
  const cy = y0 + BEAM_L / 2 * dy;
  // Rotate a vertical rectangle to point in direction (dx, dy):
  // natural direction of height-axis = 90° from +x → subtract 90°
  const rotDeg = Math.atan2(dy, dx) * (180 / Math.PI) - 90;
  return { cx, cy, rotation: `${rotDeg.toFixed(2)}deg`, color, halfPeriod, delay, maxOp };
}

const DIAG_BEAMS: DiagBeamConfig[] = [
  buildBeam(0, 0, '#00E5FF', 2800, 0,    0.38), // top-left  → cyan
  buildBeam(W, 0, '#FF00FF', 3200, 700,  0.34), // top-right → magenta
  buildBeam(0, H, '#7B00FF', 3000, 1400, 0.30), // bot-left  → purple
  buildBeam(W, H, '#00BFFF', 2600, 2100, 0.32), // bot-right → deep-sky
];

function DiagBeam({ spec }: { spec: DiagBeamConfig }) {
  const pulse  = usePulse(spec.halfPeriod, spec.delay);
  const lineOp = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, spec.maxOp] });
  const glowOp = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, spec.maxOp * 0.35] });

  return (
    <>
      {/* Soft colour glow (wider) */}
      <Animated.View style={{
        position: 'absolute',
        left: spec.cx - 5, top: spec.cy - BEAM_L / 2,
        width: 10, height: BEAM_L,
        backgroundColor: spec.color, opacity: glowOp,
        transform: [{ rotate: spec.rotation }],
      }} />
      {/* Bright white core */}
      <Animated.View style={{
        position: 'absolute',
        left: spec.cx - 1, top: spec.cy - BEAM_L / 2,
        width: 2, height: BEAM_L,
        backgroundColor: '#ffffff', opacity: lineOp,
        transform: [{ rotate: spec.rotation }],
      }} />
    </>
  );
}

interface NeonParticleSpec { xFrac: number; yFrac: number; size: number; color: string; maxOp: number; halfPeriod: number; delay: number; }
const NEON_PARTICLES: NeonParticleSpec[] = [
  { xFrac: 0.12, yFrac: 0.17, size: 4, color: '#00E5FF', maxOp: 0.75, halfPeriod: 1500, delay: 0    },
  { xFrac: 0.35, yFrac: 0.41, size: 3, color: '#FF00FF', maxOp: 0.65, halfPeriod: 1900, delay: 300  },
  { xFrac: 0.60, yFrac: 0.27, size: 5, color: '#00E5FF', maxOp: 0.70, halfPeriod: 1200, delay: 850  },
  { xFrac: 0.79, yFrac: 0.61, size: 3, color: '#7B00FF', maxOp: 0.60, halfPeriod: 2300, delay: 500  },
  { xFrac: 0.50, yFrac: 0.73, size: 4, color: '#FF00FF', maxOp: 0.65, halfPeriod: 1700, delay: 1300 },
  { xFrac: 0.89, yFrac: 0.34, size: 3, color: '#00E5FF', maxOp: 0.75, halfPeriod: 1050, delay: 200  },
  { xFrac: 0.22, yFrac: 0.57, size: 5, color: '#7B00FF', maxOp: 0.58, halfPeriod: 2100, delay: 950  },
  { xFrac: 0.70, yFrac: 0.86, size: 3, color: '#FF00FF', maxOp: 0.55, halfPeriod: 2600, delay: 650  },
];

function NeonParticle({ spec }: { spec: NeonParticleSpec }) {
  const pulse   = usePulse(spec.halfPeriod, spec.delay);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, spec.maxOp] });
  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.0] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W, top: spec.yFrac * H,
      width: spec.size, height: spec.size, borderRadius: spec.size / 2,
      backgroundColor: spec.color, opacity, transform: [{ scale }],
    }} />
  );
}

export function CyberNeonOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {DIAG_BEAMS.map((spec, i) => <DiagBeam key={i} spec={spec} />)}
      {NEON_PARTICLES.map((spec, i) => <NeonParticle key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CoffeeHouseOverlay — wisps of rising steam
// ─────────────────────────────────────────────────────────────────────────────

interface SteamSpec { xFrac: number; yStart: number; width: number; maxOp: number; riseMs: number; pulseMs: number; delay: number; }
const STEAM: SteamSpec[] = [
  { xFrac: 0.28, yStart: H * 0.65, width: 7,  maxOp: 0.17, riseMs: 6200, pulseMs: 2800, delay: 0    },
  { xFrac: 0.40, yStart: H * 0.68, width: 9,  maxOp: 0.13, riseMs: 7600, pulseMs: 3400, delay: 1300 },
  { xFrac: 0.55, yStart: H * 0.62, width: 6,  maxOp: 0.15, riseMs: 5600, pulseMs: 2500, delay: 750  },
  { xFrac: 0.69, yStart: H * 0.70, width: 8,  maxOp: 0.12, riseMs: 8400, pulseMs: 3800, delay: 2400 },
];

function SteamWisp({ spec }: { spec: SteamSpec }) {
  const rise  = useFall(spec.riseMs, spec.delay);
  const pulse = usePulse(spec.pulseMs, spec.delay + 200);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, -180] });
  const translateX = rise.interpolate({
    inputRange: [0, 0.33, 0.66, 1], outputRange: [0, 8, -6, 3],
  });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, spec.maxOp] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W, top: spec.yStart,
      width: spec.width, height: 80, borderRadius: spec.width / 2,
      backgroundColor: '#D8C4A8', opacity,
      transform: [{ translateY }, { translateX }],
    }} />
  );
}

function CoffeeGlow() {
  const pulse   = usePulse(4500, 600);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.03, 0.07] });
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FF8040', opacity }]} />;
}

const COFFEE_DUST = [
  { xFrac: 0.36, yStart: H * 0.54, size: 2, maxOp: 0.13, riseMs: 9000,  pulseMs: 4400, delay: 550  },
  { xFrac: 0.52, yStart: H * 0.47, size: 2, maxOp: 0.10, riseMs: 11000, pulseMs: 5400, delay: 2200 },
  { xFrac: 0.65, yStart: H * 0.59, size: 2, maxOp: 0.11, riseMs: 10000, pulseMs: 4900, delay: 1150 },
  { xFrac: 0.44, yStart: H * 0.68, size: 2, maxOp: 0.09, riseMs: 12000, pulseMs: 6000, delay: 3300 },
  { xFrac: 0.74, yStart: H * 0.50, size: 2, maxOp: 0.12, riseMs: 9500,  pulseMs: 4600, delay: 1800 },
];

export function CoffeeHouseOverlay() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// AuroraOverlay — slowly moving northern-lights bands
// ─────────────────────────────────────────────────────────────────────────────

interface AuroraBandSpec {
  topFrac: number;
  color: string;
  opRange: [number, number];
  yRange: number;
  driftMs: number;
  pulseMs: number;
  delay: number;
  rot: string;
}

const AURORA_BANDS: AuroraBandSpec[] = [
  { topFrac: 0.05, color: '#00FF9F', opRange: [0.05, 0.20], yRange: 38, driftMs: 9500,  pulseMs: 4800, delay: 0,    rot: '3deg'  },
  { topFrac: 0.15, color: '#00D4E8', opRange: [0.04, 0.16], yRange: 48, driftMs: 12500, pulseMs: 6200, delay: 2200, rot: '-2deg' },
  { topFrac: 0.24, color: '#7B2FBE', opRange: [0.04, 0.14], yRange: 32, driftMs: 11000, pulseMs: 5500, delay: 4800, rot: '4deg'  },
  { topFrac: 0.10, color: '#4CC9F0', opRange: [0.03, 0.12], yRange: 52, driftMs: 14500, pulseMs: 7200, delay: 1100, rot: '-3deg' },
  { topFrac: 0.20, color: '#C77DFF', opRange: [0.03, 0.11], yRange: 42, driftMs: 12000, pulseMs: 5800, delay: 3400, rot: '2deg'  },
];

function AuroraBand({ spec }: { spec: AuroraBandSpec }) {
  const drift = usePulse(spec.driftMs, spec.delay);
  const pulse = usePulse(spec.pulseMs, spec.delay + 600);
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [-spec.yRange / 2, spec.yRange / 2] });
  const opacity    = pulse.interpolate({ inputRange: [0, 1], outputRange: spec.opRange });
  return (
    <Animated.View style={{
      position: 'absolute', top: spec.topFrac * H, left: -W * 0.25,
      width: W * 1.5, height: H * 0.16, borderRadius: H * 0.08,
      backgroundColor: spec.color, opacity,
      transform: [{ translateY }, { rotate: spec.rot }],
    }} />
  );
}

export function AuroraOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {AURORA_BANDS.map((spec, i) => <AuroraBand key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RainyWindowOverlay — thin raindrops falling at a slight angle
// ─────────────────────────────────────────────────────────────────────────────

interface RainSpec { xFrac: number; dropH: number; opacity: number; duration: number; delay: number; }

const RAINDROPS: RainSpec[] = [
  { xFrac: 0.06, dropH: 18, opacity: 0.16, duration: 1340, delay: 0    },
  { xFrac: 0.20, dropH: 14, opacity: 0.13, duration: 1580, delay: 420  },
  { xFrac: 0.34, dropH: 22, opacity: 0.17, duration: 1200, delay: 900  },
  { xFrac: 0.48, dropH: 16, opacity: 0.14, duration: 1460, delay: 250  },
  { xFrac: 0.60, dropH: 20, opacity: 0.15, duration: 1320, delay: 710  },
  { xFrac: 0.73, dropH: 14, opacity: 0.13, duration: 1640, delay: 140  },
  { xFrac: 0.83, dropH: 22, opacity: 0.16, duration: 1260, delay: 1050 },
  { xFrac: 0.91, dropH: 16, opacity: 0.13, duration: 1500, delay: 560  },
  { xFrac: 0.14, dropH: 20, opacity: 0.14, duration: 1380, delay: 820  },
];

function RainDrop({ spec }: { spec: RainSpec }) {
  const p = useFall(spec.duration, spec.delay % spec.duration);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [-30, H + 30] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W, top: 0,
      width: 1.5, height: spec.dropH, borderRadius: 1,
      backgroundColor: '#B0D4F0', opacity: spec.opacity,
      transform: [{ translateY }, { rotate: '9deg' }],
    }} />
  );
}

export function RainyWindowOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {RAINDROPS.map((spec, i) => <RainDrop key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AnimalOverlay — dog paw prints appear one by one in a trail along the right
// side of the screen, from bottom-right up toward the top-right, then fade out.
// ─────────────────────────────────────────────────────────────────────────────

const PAW_CYCLE = 21000;

interface PawSpec { x: number; y: number; rot: number; delay: number; scale: number; }

const PAWS: PawSpec[] = [
  { x: W * 0.70, y: H * 0.80, rot:  12, delay:     0, scale: 1.0 },
  { x: W * 0.80, y: H * 0.71, rot:  -8, delay:  3000, scale: 0.9 },
  { x: W * 0.72, y: H * 0.61, rot:  12, delay:  6000, scale: 1.0 },
  { x: W * 0.82, y: H * 0.52, rot:  -8, delay:  9000, scale: 0.9 },
  { x: W * 0.74, y: H * 0.42, rot:  12, delay: 12000, scale: 1.0 },
  { x: W * 0.84, y: H * 0.32, rot:  -8, delay: 15000, scale: 0.9 },
  { x: W * 0.76, y: H * 0.22, rot:  12, delay: 18000, scale: 1.0 },
];

function usePawFade(delay: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fadeIn  = 280;
    const hold    = 900;
    const fadeOut = 380;
    const idle    = PAW_CYCLE - delay - fadeIn - hold - fadeOut;
    const steps: Animated.CompositeAnimation[] = [];
    if (delay > 0) steps.push(Animated.delay(delay));
    steps.push(Animated.timing(v, { toValue: 1, duration: fadeIn,  easing: Easing.out(Easing.ease), useNativeDriver: true }));
    steps.push(Animated.delay(hold));
    steps.push(Animated.timing(v, { toValue: 0, duration: fadeOut, easing: Easing.in(Easing.ease),  useNativeDriver: true }));
    if (idle > 0) steps.push(Animated.delay(idle));
    const anim = Animated.loop(Animated.sequence(steps));
    anim.start();
    return () => anim.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

const PAW_COLOR = 'rgba(141, 104, 84, 0.52)';

function PawPrintView({ spec }: { spec: PawSpec }) {
  const opacity = usePawFade(spec.delay);
  const s = spec.scale;
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.x, top: spec.y,
      opacity, transform: [{ rotate: `${spec.rot}deg` }],
    }}>
      {/* Toe pads — two larger middle, two smaller outer */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 * s, marginBottom: 1.5 * s, justifyContent: 'center' }}>
        <View style={{ width: 4.5 * s, height: 4.5 * s, borderRadius: 2.5 * s, backgroundColor: PAW_COLOR, marginBottom: 1.5 * s }} />
        <View style={{ width: 5   * s, height: 5.5 * s, borderRadius: 2.5 * s, backgroundColor: PAW_COLOR }} />
        <View style={{ width: 5   * s, height: 5.5 * s, borderRadius: 2.5 * s, backgroundColor: PAW_COLOR }} />
        <View style={{ width: 4.5 * s, height: 4.5 * s, borderRadius: 2.5 * s, backgroundColor: PAW_COLOR, marginBottom: 1.5 * s }} />
      </View>
      {/* Main palm pad */}
      <View style={{ width: 13 * s, height: 10 * s, borderRadius: 6.5 * s, backgroundColor: PAW_COLOR, alignSelf: 'center' }} />
    </Animated.View>
  );
}

export function AnimalOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PAWS.map((spec, i) => <PawPrintView key={i} spec={spec} />)}
    </View>
  );
}
