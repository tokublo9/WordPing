import { DEFAULT_LIMITS, FEATURES, type Feature, type FeatureLimits, type Tier } from './config';
import type { Env } from './env';
import { log, redactError } from './log';

/**
 * Operator-controlled runtime state, held in KV so it can be changed without
 * shipping a new mobile build or redeploying the Worker.
 *
 *   wrangler kv key put --binding=WORDPING_KV config:killswitch '{"voice_custom":true}'
 *   wrangler kv key put --binding=WORDPING_KV config:limits '{"voice_card":{"premium":{"maxRequestsPerDay":50}}}'
 *
 * Both keys are optional. A malformed value is ignored and logged rather than
 * failing the request — a bad paste into KV must not take the API down.
 */
export const KILLSWITCH_KEY = 'config:killswitch';
export const LIMITS_KEY = 'config:limits';

/** KV is read through the edge cache; 60 s is the worst-case propagation delay. */
const CONFIG_CACHE_TTL_SECONDS = 60;

export interface RuntimeConfig {
  disabledFeatures: ReadonlySet<Feature>;
  limitsFor(feature: Feature, tier: Tier): FeatureLimits;
}

const FEATURE_SET: ReadonlySet<string> = new Set(FEATURES);
const TIERS: readonly Tier[] = ['free', 'basic', 'premium'];

function parseDisabledFeatures(raw: string | null): ReadonlySet<Feature> {
  const disabled = new Set<Feature>();
  if (!raw) return disabled;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return disabled;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === true && FEATURE_SET.has(key)) disabled.add(key as Feature);
  }
  return disabled;
}

type LimitOverrides = Partial<Record<Feature, Partial<Record<Tier, Partial<FeatureLimits>>>>>;

const LIMIT_FIELDS: readonly (keyof FeatureLimits)[] = [
  'maxCharsPerRequest', 'maxRequestsPerMinute', 'maxRequestsPerDay', 'maxCharsPerDay',
];

function parseLimitOverrides(raw: string | null): LimitOverrides {
  const overrides: LimitOverrides = {};
  if (!raw) return overrides;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return overrides;

  for (const [featureKey, tierBlob] of Object.entries(parsed as Record<string, unknown>)) {
    if (!FEATURE_SET.has(featureKey)) continue;
    if (!tierBlob || typeof tierBlob !== 'object' || Array.isArray(tierBlob)) continue;
    const byTier: Partial<Record<Tier, Partial<FeatureLimits>>> = {};

    for (const tier of TIERS) {
      const values = (tierBlob as Record<string, unknown>)[tier];
      if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
      const limits: Partial<FeatureLimits> = {};
      for (const field of LIMIT_FIELDS) {
        const value = (values as Record<string, unknown>)[field];
        // Zero is meaningful here: it is how an operator revokes a tier's access.
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          limits[field] = Math.floor(value);
        }
      }
      if (Object.keys(limits).length > 0) byTier[tier] = limits;
    }
    if (Object.keys(byTier).length > 0) overrides[featureKey as Feature] = byTier;
  }
  return overrides;
}

export async function loadRuntimeConfig(env: Env, requestId: string): Promise<RuntimeConfig> {
  let disabledFeatures: ReadonlySet<Feature> = new Set();
  let overrides: LimitOverrides = {};

  const [rawKillswitch, rawLimits] = await Promise.all([
    env.WORDPING_KV.get(KILLSWITCH_KEY, { cacheTtl: CONFIG_CACHE_TTL_SECONDS }).catch(() => null),
    env.WORDPING_KV.get(LIMITS_KEY, { cacheTtl: CONFIG_CACHE_TTL_SECONDS }).catch(() => null),
  ]);

  try {
    disabledFeatures = parseDisabledFeatures(rawKillswitch);
  } catch (error) {
    log('warn', 'runtime_config_killswitch_invalid', requestId, redactError(error));
  }
  try {
    overrides = parseLimitOverrides(rawLimits);
  } catch (error) {
    log('warn', 'runtime_config_limits_invalid', requestId, redactError(error));
  }

  return {
    disabledFeatures,
    limitsFor(feature, tier) {
      return { ...DEFAULT_LIMITS[feature][tier], ...overrides[feature]?.[tier] };
    },
  };
}
