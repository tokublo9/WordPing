import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type AlertButton, type AlertOptions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostHogMaskView } from 'posthog-react-native';

import { useLang } from '../i18n';
import type { Palette } from '../types';

interface Notice {
  id: number;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const hosts = new Map<number, number>();
const queue: Notice[] = [];
let notice: Notice | null = null;
let nextId = 1;
let nextHostId = 1;

function publish() { listeners.forEach(listener => listener()); }

function topHost(): number | null {
  let id: number | null = null;
  let priority = -Infinity;
  for (const [candidate, candidatePriority] of hosts) {
    if (candidatePriority > priority || (candidatePriority === priority && candidate > (id ?? -1))) {
      id = candidate;
      priority = candidatePriority;
    }
  }
  return id;
}

function advance() {
  notice = queue.shift() ?? null;
  publish();
}

/** Same call shape as React Native Alert.alert, backed by WordCore views. */
export const WordCoreAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    queue.push({ id: nextId++, title, message, buttons, options });
    if (notice === null) advance();
  },
};

interface Props {
  active?: boolean;
  /** Root: 0; a native screen modal: 10; a modal presented inside it: 20. */
  priority?: number;
  pal: Palette;
  themeColor: string;
}

export function WordCoreAlertHost({ active = true, priority = 0, pal, themeColor }: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const hostIdRef = useRef<number | null>(null);
  if (hostIdRef.current === null) hostIdRef.current = nextHostId++;
  const hostId = hostIdRef.current;
  const [, setRevision] = useState(0);

  useEffect(() => {
    const update = () => setRevision(value => value + 1);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  useEffect(() => {
    if (!active) return;
    hosts.set(hostId, priority);
    publish();
    return () => {
      hosts.delete(hostId);
      publish();
    };
  }, [active, hostId, priority]);

  if (!active || topHost() !== hostId || notice === null) return null;
  const current = notice;
  const buttons = current.buttons?.length ? current.buttons : [{ text: t('close') }];
  const primaryIndex = buttons.reduce((selected, button, index) =>
    button.style !== 'cancel' && button.style !== 'destructive' ? index : selected, -1);
  const dismiss = (button?: AlertButton) => {
    if (notice?.id !== current.id) return;
    advance();
    button?.onPress?.();
  };

  return (
    <View style={styles.overlay}>
      <PostHogMaskView
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
        {!!current.title && <Text style={[styles.title, { color: pal.text }]} accessibilityRole="header">{current.title}</Text>}
        {!!current.message && (
          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false} bounces={false}>
            <Text style={[styles.body, { color: pal.sub }]}>{current.message}</Text>
          </ScrollView>
        )}
        {buttons.map((button, index) => {
          const primary = index === primaryIndex;
          return (
            <TouchableOpacity
              key={`${current.id}:${index}`}
              style={[
                styles.button,
                primary ? { backgroundColor: themeColor } : { borderColor: pal.border, borderWidth: StyleSheet.hairlineWidth },
              ]}
              onPress={() => dismiss(button)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={button.text}
            >
              <Text style={[styles.buttonLabel, { color: primary ? '#fff' : button.style === 'destructive' ? '#D64545' : pal.text }]}>
                {button.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </PostHogMaskView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  bodyScroll: { flexGrow: 0 },
  body: { fontSize: 14, lineHeight: 21 },
  button: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonLabel: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
