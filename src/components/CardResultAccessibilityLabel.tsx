import { StyleSheet, View } from 'react-native';
import type { TestLevel } from '../types';
import { useLang } from '../i18n';
import { TEST_LEVEL_LABEL_KEYS } from '../features/cards/levels';

/** Keeps the graded result in the accessibility tree independently of its colour stripe. */
export function CardResultAccessibilityLabel({ testLevel }: { testLevel?: TestLevel }) {
  const t = useLang();
  if (!testLevel) return null;

  return (
    <View
      style={styles.hidden}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={t(TEST_LEVEL_LABEL_KEYS[testLevel])}
    />
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
});
