module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // PostHog was removed — see src/config/posthog.ts. Nothing reads these any
    // more, so they are no longer forwarded into `expoConfig.extra`.
    // posthogProjectToken: process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN,
    // posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  },
});
