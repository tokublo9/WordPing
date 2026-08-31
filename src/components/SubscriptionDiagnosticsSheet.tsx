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
import Purchases from 'react-native-purchases';

import type { Palette } from '../types';
import { getAIEntitlementSnapshot } from '../lib/aiEntitlement';

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
  isAnonymous: boolean;
  activeEntitlements: string[];
  /** From the same snapshot the AI entitlement rule reads. */
  plan: string;
  entitlementSource: string;
  isSubscriptionLoaded: boolean;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; report: Report }
  | { status: 'failed'; reason: string };

export function SubscriptionDiagnosticsSheet({ visible, onClose, pal, themeColor }: Props) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setCopied(false);
    // The published snapshot — plan, source and loaded flag — is what the rest
    // of the app actually acts on, so reading it here shows the real state
    // rather than a second opinion computed for this screen.
    const snapshot = getAIEntitlementSnapshot();
    try {
      if (Platform.OS !== 'ios') throw new Error('RevenueCat runs on iOS only');
      const [appUserId, info] = await Promise.all([
        Purchases.getAppUserID(),
        Purchases.getCustomerInfo(),
      ]);
      setState({
        status: 'ready',
        report: {
          appUserId,
          isAnonymous: appUserId.startsWith('$RCAnonymousID:'),
          // Identifiers only. The entitlement objects also carry store receipts
          // and product metadata, which are deliberately not read.
          activeEntitlements: Object.keys(info.entitlements.active),
          plan: snapshot.plan,
          entitlementSource: snapshot.entitlementSource ?? 'not resolved',
          isSubscriptionLoaded: snapshot.isSubscriptionLoaded,
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

  const copyAppUserId = useCallback(async () => {
    if (state.status !== 'ready') return;
    await Clipboard.setStringAsync(state.report.appUserId);
    setCopied(true);
  }, [state]);

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
                  label="RevenueCat App User ID"
                  value={state.report.appUserId}
                  monospace
                  pal={pal}
                />
                <TouchableOpacity
                  style={[styles.copyButton, { borderColor: pal.border, backgroundColor: pal.card }]}
                  onPress={() => { void copyAppUserId(); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Copy App User ID"
                >
                  <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={15}
                    color={copied ? themeColor : pal.sub}
                  />
                  <Text style={[styles.copyLabel, { color: copied ? themeColor : pal.text }]}>
                    {copied ? 'Copied' : 'Copy App User ID'}
                  </Text>
                </TouchableOpacity>

                <Field
                  label="Identity"
                  value={state.report.isAnonymous ? 'Anonymous (no login)' : 'Aliased'}
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
