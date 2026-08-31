import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';

import type { Palette } from '../types';
import { getAIEntitlementSnapshot } from '../lib/aiEntitlement';
import { ENTITLEMENT_IDS } from '../lib/purchases';

/**
 * TEMPORARY — Subscription Diagnostics.
 *
 * Answers one question for a TestFlight tester whose purchase did not take
 * effect: which RevenueCat customer is this device, and what did RevenueCat say
 * about them? Everything shown is already visible in the RevenueCat dashboard
 * once you have the App User ID, which is why the ID is the one value with a
 * Copy button.
 *
 * Read-only by construction. It calls `getAppUserID` and `getCustomerInfo` and
 * nothing else — no purchase, no restore, no `logIn`/`logOut`, no sync. There
 * is no code path here that can change a plan or grant an entitlement.
 *
 * Deliberately not localized: it is an internal tool with a short life, and
 * leaving no i18n keys behind is part of making it a clean deletion. See
 * SUBSCRIPTION_DIAGNOSTICS_ENABLED in features/flags.ts for the removal steps.
 *
 * What it must never show: the RevenueCat API key, a receipt, a purchase token,
 * or anything personal. The App User ID is a pseudonymous identifier the app
 * generates or RevenueCat assigns — it is not an account and not a name.
 */

interface Props {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
}

interface Report {
  appUserId: string;
  /**
   * The customer RevenueCat filed this device under first.
   *
   * After an App Store receipt is transferred, the current App User ID can be an
   * alias and will not be found by a dashboard search — the canonical customer
   * is under this one. When the two differ, this is the ID to look up.
   */
  originalAppUserId: string;
  isAnonymous: boolean;
  isAliased: boolean;
  activeEntitlements: string[];
  /** Premium's own details, when it is active. Null when it is not. */
  premium: PremiumDetails | null;
  /** Whether Apple gave a manage-subscription link, not the link itself. */
  hasManagementUrl: boolean;
  /** From the same snapshot the AI entitlement rule reads. */
  plan: string;
  entitlementSource: string;
  isSubscriptionLoaded: boolean;
  /**
   * Which RevenueCat app this build talks to.
   *
   * A public SDK key is app-specific: one key belongs to exactly one iOS app in
   * exactly one RevenueCat project. So when a customer cannot be found in the
   * project you expected, the question is always "which key shipped?" — and
   * these three values answer it without reproducing the key. Match the last
   * four against Project → Apps → your iOS app → API keys.
   */
  keyType: string;
  keyPrefix: string;
  keyLastFour: string;
  keyLength: number;
  bundleId: string;
  /**
   * The offering the key's project actually served. If these identifiers are
   * not the ones configured in the project you expected, the key is pointing
   * somewhere else — independent confirmation that does not rely on the key.
   */
  offering: string;
  packages: string[];
}

/**
 * The active Premium entitlement, reduced to what identifies the purchase.
 *
 * Product identifier, store, sandbox flag, expiry and renewal state only —
 * never the receipt, the transaction, or the verification payload that sit
 * alongside them on the same object.
 */
interface PremiumDetails {
  productIdentifier: string;
  /** e.g. "App Store — Sandbox". Sandbox is the usual reason for a stray customer. */
  environment: string;
  expirationDate: string;
  willRenew: string;
  periodType: string;
}

/** Describes the key without reproducing it. */
function describeKey(apiKey: string): Pick<Report, 'keyType' | 'keyPrefix' | 'keyLastFour' | 'keyLength'> {
  const keyType = apiKey === ''
    ? 'NOT SET'
    : apiKey.startsWith('appl_')
      ? 'Apple App Store (appl_)'
      : apiKey.startsWith('test_')
        ? 'RevenueCat Test Store (test_)'
        : 'unrecognised prefix';
  return {
    keyType,
    // Enough to identify the key in the dashboard, never enough to use it — and
    // an `appl_` SDK key is public in every copy of the app regardless.
    keyPrefix: apiKey === '' ? '—' : `${apiKey.slice(0, 9)}…`,
    keyLastFour: apiKey === '' ? '—' : apiKey.slice(-4),
    keyLength: apiKey.length,
  };
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; report: Report }
  | { status: 'failed'; reason: string };

export function SubscriptionDiagnosticsSheet({ visible, onClose, pal, themeColor }: Props) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setCopied(null);
    // The published snapshot — plan, source and loaded flag — is what the rest
    // of the app actually acts on, so reading it here shows the real state
    // rather than a second opinion computed for this screen.
    const snapshot = getAIEntitlementSnapshot();
    try {
      if (Platform.OS !== 'ios') throw new Error('RevenueCat runs on iOS only');
      const [appUserId, info, offerings] = await Promise.all([
        Purchases.getAppUserID(),
        Purchases.getCustomerInfo(),
        // Best-effort: a project with no offerings configured is itself a clue.
        Purchases.getOfferings().catch(() => null),
      ]);
      const premiumInfo = info.entitlements.active[ENTITLEMENT_IDS.PREMIUM];
      setState({
        status: 'ready',
        report: {
          appUserId,
          originalAppUserId: info.originalAppUserId,
          isAnonymous: appUserId.startsWith('$RCAnonymousID:'),
          // A receipt transfer leaves the device on an alias. That is exactly
          // the case where searching the dashboard for the current ID finds
          // nothing, so it is called out rather than left to be spotted.
          isAliased: info.originalAppUserId !== appUserId,
          premium: premiumInfo === undefined ? null : {
            productIdentifier: premiumInfo.productIdentifier,
            environment: `${premiumInfo.store}${premiumInfo.isSandbox ? ' — Sandbox' : ' — Production'}`,
            expirationDate: premiumInfo.expirationDate ?? 'none (non-expiring)',
            willRenew: premiumInfo.willRenew ? 'yes' : 'no',
            periodType: premiumInfo.periodType,
          },
          // Presence only. The URL itself is Apple's and adds nothing here.
          hasManagementUrl: info.managementURL !== null,
          // Identifiers only. The entitlement objects also carry store receipts
          // and product metadata, which are deliberately not read.
          activeEntitlements: Object.keys(info.entitlements.active),
          plan: snapshot.plan,
          entitlementSource: snapshot.entitlementSource ?? 'not resolved',
          isSubscriptionLoaded: snapshot.isSubscriptionLoaded,
          ...describeKey(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? ''),
          bundleId: Constants.expoConfig?.ios?.bundleIdentifier ?? 'unknown',
          offering: offerings?.current?.identifier ?? 'none',
          packages: offerings?.current?.availablePackages.map(p => p.identifier) ?? [],
        },
      });
    } catch (error) {
      setState({
        status: 'failed',
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [load, visible]);

  const copyValue = useCallback(async (field: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(field);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: pal.dialog,
              borderColor: pal.border,
              marginTop: insets.top + 24,
              marginBottom: insets.bottom + 24,
            },
          ]}
          accessibilityViewIsModal
        >
          <Text style={[styles.title, { color: pal.text }]} accessibilityRole="header">
            Subscription Diagnostics
          </Text>
          <Text style={[styles.subtitle, { color: pal.sub }]}>
            Internal build tool. Read-only — nothing here changes your plan.
          </Text>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {state.status === 'loading' && (
              <View style={styles.centered}>
                <ActivityIndicator size="small" color={themeColor} />
              </View>
            )}

            {state.status === 'failed' && (
              <Text style={[styles.value, { color: pal.text }]}>
                {`Could not read RevenueCat: ${state.reason}`}
              </Text>
            )}

            {state.status === 'ready' && (
              <>
                <Field
                  label="RevenueCat App User ID (current)"
                  value={state.report.appUserId}
                  monospace
                  pal={pal}
                />
                <CopyButton
                  label="Copy current App User ID"
                  copied={copied === 'current'}
                  onPress={() => { void copyValue('current', state.report.appUserId); }}
                  pal={pal}
                  themeColor={themeColor}
                />

                <Field
                  label="Original App User ID"
                  value={state.report.originalAppUserId}
                  monospace
                  pal={pal}
                />
                <CopyButton
                  label="Copy original App User ID"
                  copied={copied === 'original'}
                  onPress={() => { void copyValue('original', state.report.originalAppUserId); }}
                  pal={pal}
                  themeColor={themeColor}
                />

                <Field
                  label="Identity"
                  value={
                    state.report.isAliased
                      ? 'ALIASED — search the dashboard for the original ID'
                      : state.report.isAnonymous
                        ? 'Anonymous (no login), not aliased'
                        : 'Not aliased'
                  }
                  pal={pal}
                />
                <Field label="Resolved plan" value={state.report.plan} pal={pal} />
                <Field
                  label="Active entitlements"
                  value={
                    state.report.activeEntitlements.length > 0
                      ? state.report.activeEntitlements.join(', ')
                      : 'none'
                  }
                  pal={pal}
                />
                <Field label="Entitlement source" value={state.report.entitlementSource} pal={pal} />
                <Field
                  label="Subscription loaded"
                  value={state.report.isSubscriptionLoaded ? 'yes' : 'still loading'}
                  pal={pal}
                />

                <Text style={[styles.sectionLabel, { color: pal.sub }]}>Premium purchase</Text>
                {state.report.premium === null ? (
                  <Field label="Premium" value="not active" pal={pal} />
                ) : (
                  <>
                    <Field label="Product identifier" value={state.report.premium.productIdentifier} monospace pal={pal} />
                    <Field label="Environment / store" value={state.report.premium.environment} pal={pal} />
                    <Field label="Expires" value={state.report.premium.expirationDate} pal={pal} />
                    <Field label="Will renew" value={state.report.premium.willRenew} pal={pal} />
                    <Field label="Period type" value={state.report.premium.periodType} pal={pal} />
                  </>
                )}
                <Field
                  label="Manage-subscription link"
                  value={state.report.hasManagementUrl ? 'available' : 'not available'}
                  pal={pal}
                />

                <Text style={[styles.sectionLabel, { color: pal.sub }]}>
                  Which RevenueCat app this build talks to
                </Text>
                <Field label="SDK key type" value={state.report.keyType} pal={pal} />
                <Field
                  label="SDK key"
                  value={`${state.report.keyPrefix}${state.report.keyLastFour}  (${state.report.keyLength} chars)`}
                  monospace
                  pal={pal}
                />
                <Field label="Bundle identifier" value={state.report.bundleId} monospace pal={pal} />
                <Field label="Current offering" value={state.report.offering} pal={pal} />
                <Field
                  label="Packages"
                  value={state.report.packages.length > 0 ? state.report.packages.join(', ') : 'none'}
                  pal={pal}
                />
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: pal.border }]}
              onPress={() => { void load(); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Refresh"
            >
              <Text style={[styles.secondaryLabel, { color: pal.sub }]}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: themeColor }]}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.primaryLabel}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CopyButton({ label, copied, onPress, pal, themeColor }: {
  label: string;
  copied: boolean;
  onPress: () => void;
  pal: Palette;
  themeColor: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.copyButton, { borderColor: pal.border, backgroundColor: pal.card }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color={copied ? themeColor : pal.sub} />
      <Text style={[styles.copyLabel, { color: copied ? themeColor : pal.text }]}>
        {copied ? 'Copied' : label}
      </Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, monospace = false, pal }: {
  label: string;
  value: string;
  monospace?: boolean;
  pal: Palette;
}) {
  return (
    <View style={styles.field} accessible accessibilityRole="text" accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.fieldLabel, { color: pal.sub }]}>{label}</Text>
      {/* Selectable as well as copyable: the ID is long, and reading it off a
          screenshot is how these reports usually travel. */}
      <Text selectable style={[styles.value, monospace && styles.mono, { color: pal.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 12 },
  bodyScroll: { flexGrow: 0 },
  bodyContent: { paddingBottom: 4 },
  centered: { paddingVertical: 24, alignItems: 'center' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 8,
  },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 3 },
  value: { fontSize: 14, lineHeight: 20 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  copyLabel: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 15, fontWeight: '600' },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
