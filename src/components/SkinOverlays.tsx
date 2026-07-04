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
  { xFrac: 0.05, w: 10, h: 7,  color: '#4CAF50', opacity: 0.38, duration: 7200, delay: 0,    sway: 22, spins: 1.5 },
  { xFrac: 0.22, w: 8,  h: 5,  color: '#81C784', opacity: 0.30, duration: 8800, delay: 1300, sway: 16, spins: 2   },
  { xFrac: 0.38, w: 12, h: 8,  color: '#388E3C', opacity: 0.32, duration: 6600, delay: 800,  sway: 26, spins: 1   },
  { xFrac: 0.55, w: 7,  h: 5,  color: '#A5D6A7', opacity: 0.34, duration: 9200, delay: 2600, sway: 18, spins: 2   },
  { xFrac: 0.68, w: 10, h: 7,  color: '#66BB6A', opacity: 0.28, duration: 7600, delay: 400,  sway: 20, spins: 1.5 },
  { xFrac: 0.80, w: 9,  h: 6,  color: '#C8E6C9', opacity: 0.24, duration: 8200, delay: 3200, sway: 14, spins: 1   },
  { xFrac: 0.14, w: 8,  h: 6,  color: '#2E7D32', opacity: 0.30, duration: 7000, delay: 1800, sway: 24, spins: 2   },
  { xFrac: 0.91, w: 11, h: 7,  color: '#AED581', opacity: 0.32, duration: 7400, delay: 2900, sway: 18, spins: 1.5 },
];

export function GreenNatureOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {LEAVES.map((spec, i) => <FallingItem key={i} spec={spec} />)}
    </View>
  );
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
  { xFrac: 0.08, w: 10, h: 7,  color: '#D4627A', opacity: 0.42, duration: 6800, delay: 0,    sway: 20, spins: 1.5 },
  { xFrac: 0.22, w: 12, h: 8,  color: '#E88FA0', opacity: 0.34, duration: 8200, delay: 1500, sway: 24, spins: 2   },
  { xFrac: 0.38, w: 8,  h: 6,  color: '#C44060', opacity: 0.38, duration: 7200, delay: 600,  sway: 16, spins: 1   },
  { xFrac: 0.52, w: 11, h: 7,  color: '#F0A0B0', opacity: 0.30, duration: 9000, delay: 2800, sway: 22, spins: 2   },
  { xFrac: 0.65, w: 9,  h: 6,  color: '#D4627A', opacity: 0.38, duration: 6400, delay: 400,  sway: 18, spins: 1.5 },
  { xFrac: 0.78, w: 13, h: 9,  color: '#E07090', opacity: 0.32, duration: 9400, delay: 3400, sway: 26, spins: 1   },
  { xFrac: 0.14, w: 8,  h: 6,  color: '#FFB8C6', opacity: 0.30, duration: 7800, delay: 1900, sway: 16, spins: 2   },
  { xFrac: 0.90, w: 10, h: 7,  color: '#C44060', opacity: 0.34, duration: 7000, delay: 2500, sway: 20, spins: 1.5 },
];

export function RosesOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ROSE_PETALS.map((spec, i) => <FallingItem key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SunsetOverlay — warm glow pulse + slow drifting clouds
// ─────────────────────────────────────────────────────────────────────────────

function WarmGlow() {
  const pulse   = usePulse(5500, 0);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.11] });
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FF7020', opacity }]} />;
}

interface CloudSpec { top: number; width: number; maxOp: number; color: string; driftPx: number; driftMs: number; delay: number; }
const CLOUDS: CloudSpec[] = [
  { top: H * 0.06, width: W * 0.62, maxOp: 0.08, color: '#FFD0A0', driftPx: 32,  driftMs: 14000, delay: 0    },
  { top: H * 0.18, width: W * 0.82, maxOp: 0.06, color: '#FFB870', driftPx: -24, driftMs: 19000, delay: 4000 },
  { top: H * 0.33, width: W * 0.54, maxOp: 0.07, color: '#FF9A60', driftPx: 28,  driftMs: 12000, delay: 2000 },
];

function Cloud({ spec }: { spec: CloudSpec }) {
  const drift      = usePulse(spec.driftMs, spec.delay);
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, spec.driftPx] });
  return (
    <Animated.View style={{
      position: 'absolute', top: spec.top, left: W * 0.09,
      width: spec.width, height: 44, borderRadius: 22,
      backgroundColor: spec.color, opacity: spec.maxOp,
      transform: [{ translateX }],
    }} />
  );
}

export function SunsetOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <WarmGlow />
      {CLOUDS.map((spec, i) => <Cloud key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SakuraOverlay — cherry blossom petals
// ─────────────────────────────────────────────────────────────────────────────

const SAKURA_PETALS: FallSpec[] = [
  { xFrac: 0.04, w: 10, h: 7,  color: '#FFB7C5', opacity: 0.55, duration: 6200, delay: 0,    sway: 22, spins: 1   },
  { xFrac: 0.18, w: 8,  h: 6,  color: '#FFC9D5', opacity: 0.46, duration: 8000, delay: 1100, sway: 26, spins: 1.5 },
  { xFrac: 0.30, w: 12, h: 8,  color: '#FF90A8', opacity: 0.44, duration: 5700, delay: 600,  sway: 18, spins: 2   },
  { xFrac: 0.45, w: 9,  h: 6,  color: '#FFADC0', opacity: 0.52, duration: 8800, delay: 2300, sway: 22, spins: 1   },
  { xFrac: 0.58, w: 11, h: 7,  color: '#FFB7C5', opacity: 0.50, duration: 7000, delay: 400,  sway: 20, spins: 1.5 },
  { xFrac: 0.70, w: 8,  h: 6,  color: '#FFC9D5', opacity: 0.42, duration: 7400, delay: 3200, sway: 16, spins: 2   },
  { xFrac: 0.82, w: 10, h: 7,  color: '#FF90A8', opacity: 0.54, duration: 6000, delay: 1700, sway: 26, spins: 1   },
  { xFrac: 0.12, w: 9,  h: 6,  color: '#FFADC0', opacity: 0.46, duration: 9200, delay: 2900, sway: 20, spins: 1.5 },
  { xFrac: 0.40, w: 11, h: 7,  color: '#FFB7C5', opacity: 0.48, duration: 6800, delay: 1500, sway: 18, spins: 2   },
  { xFrac: 0.93, w: 8,  h: 6,  color: '#FFC9D5', opacity: 0.40, duration: 7800, delay: 500,  sway: 22, spins: 1   },
];

export function SakuraOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SAKURA_PETALS.map((spec, i) => <FallingItem key={i} spec={spec} />)}
    </View>
  );
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
  { xFrac: 0.05, size: 5, opacity: 0.68, duration: 5200, delay: 0,    drift: 11  },
  { xFrac: 0.14, size: 3, opacity: 0.54, duration: 6800, delay: 800,  drift: -9  },
  { xFrac: 0.25, size: 6, opacity: 0.64, duration: 4700, delay: 300,  drift: 13  },
  { xFrac: 0.36, size: 4, opacity: 0.58, duration: 7200, delay: 1700, drift: -11 },
  { xFrac: 0.47, size: 5, opacity: 0.70, duration: 5700, delay: 2500, drift: 9   },
  { xFrac: 0.57, size: 3, opacity: 0.50, duration: 6200, delay: 400,  drift: -13 },
  { xFrac: 0.67, size: 6, opacity: 0.62, duration: 5000, delay: 2100, drift: 11  },
  { xFrac: 0.77, size: 4, opacity: 0.56, duration: 7500, delay: 1300, drift: -9  },
  { xFrac: 0.87, size: 5, opacity: 0.66, duration: 5400, delay: 3400, drift: 11  },
  { xFrac: 0.09, size: 4, opacity: 0.54, duration: 7000, delay: 1900, drift: -10 },
  { xFrac: 0.32, size: 6, opacity: 0.60, duration: 5800, delay: 650,  drift: 16  },
  { xFrac: 0.52, size: 3, opacity: 0.48, duration: 8000, delay: 2900, drift: -7  },
  { xFrac: 0.72, size: 5, opacity: 0.64, duration: 4400, delay: 1100, drift: 13  },
  { xFrac: 0.93, size: 4, opacity: 0.54, duration: 6500, delay: 3700, drift: -9  },
  { xFrac: 0.41, size: 5, opacity: 0.58, duration: 6000, delay: 550,  drift: 10  },
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
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SNOWFLAKES.map((spec, i) => <Snowflake key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CyberNeonOverlay — pulsing neon scan-lines + glowing particles
// ─────────────────────────────────────────────────────────────────────────────

interface NeonLineSpec { yFrac: number; color: string; maxOp: number; halfPeriod: number; delay: number; }
const NEON_LINES: NeonLineSpec[] = [
  { yFrac: 0.20, color: '#00E5FF', maxOp: 0.28, halfPeriod: 2100, delay: 0    },
  { yFrac: 0.44, color: '#FF00FF', maxOp: 0.22, halfPeriod: 2900, delay: 700  },
  { yFrac: 0.64, color: '#00E5FF', maxOp: 0.24, halfPeriod: 1900, delay: 1600 },
  { yFrac: 0.82, color: '#7B00FF', maxOp: 0.20, halfPeriod: 3400, delay: 400  },
];

function NeonLine({ spec }: { spec: NeonLineSpec }) {
  const pulse   = usePulse(spec.halfPeriod, spec.delay);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, spec.maxOp] });
  return (
    <Animated.View style={{
      position: 'absolute', left: 0, top: spec.yFrac * H,
      width: W, height: 1, backgroundColor: spec.color, opacity,
    }} />
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
      {NEON_LINES.map((spec, i) => <NeonLine key={i} spec={spec} />)}
      {NEON_PARTICLES.map((spec, i) => <NeonParticle key={i} spec={spec} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CoffeeHouseOverlay — wisps of rising steam
// ─────────────────────────────────────────────────────────────────────────────

interface SteamSpec { xFrac: number; yStart: number; width: number; maxOp: number; riseMs: number; pulseMs: number; delay: number; }
const STEAM: SteamSpec[] = [
  { xFrac: 0.30, yStart: H * 0.68, width: 8,  maxOp: 0.22, riseMs: 4800, pulseMs: 2200, delay: 0    },
  { xFrac: 0.43, yStart: H * 0.71, width: 10, maxOp: 0.18, riseMs: 5800, pulseMs: 2700, delay: 1100 },
  { xFrac: 0.56, yStart: H * 0.66, width: 7,  maxOp: 0.20, riseMs: 4200, pulseMs: 2000, delay: 650  },
  { xFrac: 0.68, yStart: H * 0.74, width: 9,  maxOp: 0.16, riseMs: 6400, pulseMs: 3000, delay: 2100 },
];

function SteamWisp({ spec }: { spec: SteamSpec }) {
  const rise  = useFall(spec.riseMs, spec.delay);
  const pulse = usePulse(spec.pulseMs, spec.delay + 200);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, -160] });
  const translateX = rise.interpolate({
    inputRange: [0, 0.33, 0.66, 1], outputRange: [0, 7, -5, 3],
  });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, spec.maxOp] });
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.xFrac * W, top: spec.yStart,
      width: spec.width, height: 70, borderRadius: spec.width / 2,
      backgroundColor: '#D8C4A8', opacity,
      transform: [{ translateY }, { translateX }],
    }} />
  );
}

export function CoffeeHouseOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {STEAM.map((spec, i) => <SteamWisp key={i} spec={spec} />)}
    </View>
  );
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
  { xFrac: 0.04, dropH: 18, opacity: 0.22, duration: 920,  delay: 0    },
  { xFrac: 0.10, dropH: 14, opacity: 0.16, duration: 1120, delay: 210  },
  { xFrac: 0.17, dropH: 22, opacity: 0.24, duration: 840,  delay: 720  },
  { xFrac: 0.24, dropH: 16, opacity: 0.18, duration: 1030, delay: 340  },
  { xFrac: 0.31, dropH: 20, opacity: 0.22, duration: 970,  delay: 570  },
  { xFrac: 0.38, dropH: 14, opacity: 0.17, duration: 1180, delay: 110  },
  { xFrac: 0.45, dropH: 24, opacity: 0.24, duration: 870,  delay: 830  },
  { xFrac: 0.52, dropH: 16, opacity: 0.19, duration: 1060, delay: 430  },
  { xFrac: 0.59, dropH: 20, opacity: 0.21, duration: 940,  delay: 670  },
  { xFrac: 0.65, dropH: 14, opacity: 0.16, duration: 1220, delay: 260  },
  { xFrac: 0.72, dropH: 22, opacity: 0.23, duration: 900,  delay: 940  },
  { xFrac: 0.79, dropH: 16, opacity: 0.18, duration: 1090, delay: 60   },
  { xFrac: 0.85, dropH: 18, opacity: 0.20, duration: 980,  delay: 620  },
  { xFrac: 0.91, dropH: 14, opacity: 0.17, duration: 1150, delay: 380  },
  { xFrac: 0.96, dropH: 20, opacity: 0.21, duration: 850,  delay: 780  },
  { xFrac: 0.08, dropH: 16, opacity: 0.17, duration: 1080, delay: 480  },
  { xFrac: 0.43, dropH: 22, opacity: 0.22, duration: 930,  delay: 880  },
  { xFrac: 0.77, dropH: 14, opacity: 0.16, duration: 1200, delay: 160  },
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
