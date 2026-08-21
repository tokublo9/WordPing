export const PLAN_FEATURES = {
  free: ['core', 'freeThemes', 'promoSamples'],
  basic: ['core', 'paidThemes', 'basicVoice'],
  premium: ['core', 'paidThemes', 'premiumVoice', 'backup', 'priority'],
};

export const COMPARISON_ROWS = [
  ['core', 'included', 'included', 'included'],
  ['storage', 'included', 'included', 'included'],
  ['studyModes', 'included', 'included', 'included'],
  ['paidThemes', 'notIncluded', 'included', 'included'],
  ['aiVoice', 'promoOnly', 'basicVoice', 'premiumVoice'],
  ['backup', 'notIncluded', 'notIncluded', 'included'],
  ['transfer', 'notIncluded', 'notIncluded', 'included'],
  ['priority', 'notIncluded', 'notIncluded', 'included'],
];
