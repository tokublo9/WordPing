export type WebsitePlan = 'free' | 'basic' | 'premium';
export type PlanFeature = 'core' | 'freeThemes' | 'promoSamples' | 'paidThemes' | 'basicVoice' | 'premiumVoice' | 'backup' | 'priority';
export type ComparisonRow = 'core' | 'storage' | 'studyModes' | 'paidThemes' | 'aiVoice' | 'backup' | 'transfer' | 'priority';
export type ComparisonValue = 'included' | 'notIncluded' | 'promoOnly' | 'basicVoice' | 'premiumVoice';

export const PLAN_FEATURES: Readonly<Record<WebsitePlan, readonly PlanFeature[]>>;
export const COMPARISON_ROWS: readonly (readonly [ComparisonRow, ComparisonValue, ComparisonValue, ComparisonValue])[];
