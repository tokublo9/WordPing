import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Without a boundary a render throw unmounts the whole tree, and what is left is the
 * bare native root view: black, with nothing mounted to receive a tap. Catching here
 * keeps a readable, recoverable surface on screen instead.
 *
 * This sits above LangContext so it cannot use `useLang`. The copy is English-only by
 * necessity; it is the one screen that must render even when the app failed to.
 */
function ErrorScreen({ message, onRetry }: { message: string; onRetry(): void }) {
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#0F0F1A' : '#F7F8FC';
  const text = dark ? '#F0F0FF' : '#1A1A2E';
  const sub = dark ? '#9A9AB8' : '#666';
  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: text }]}>Something went wrong</Text>
      <Text style={[styles.body, { color: sub }]}>
        Your saved words are safe on this device. Tap below to return to them.
      </Text>
      {__DEV__ && message !== '' && (
        <Text style={[styles.detail, { color: sub }]} numberOfLines={6}>{message}</Text>
      )}
      <TouchableOpacity
        style={styles.button}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (__DEV__) {
      console.error('[render] tree crashed', error, info.componentStack);
    }
  }

  // Vocabulary lives in SQLite, so remounting re-reads it from disk. Nothing the user
  // entered is lost by retrying.
  private retry = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      return <ErrorScreen message={this.state.message} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 },
  detail: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 14 },
  button: {
    minHeight: 48,
    marginTop: 24,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
