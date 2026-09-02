import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '../i18n';

interface Props {
  color: string;
  /**
   * `card` — a study face, where the icon stands alone in a large centred area.
   *
   * `row` — a word-list row, where it sits at the left where the word would
   * start. Smaller to match the row, with the line height the word would have
   * had, so a hidden row is exactly as tall as a visible one.
   */
  variant?: 'card' | 'row';
}

/**
 * The mark a card shows in place of a hidden word.
 *
 * The icon only. The word itself is never rendered — not transparent, not
 * zero-height — because an invisible `Text` is still read aloud by VoiceOver and
 * still selectable and copyable, any of which would give away the word the card
 * is asking you to recall. No visible label either: the eye-off glyph is the
 * whole message.
 *
 * It does carry an accessible name, because an unlabelled icon announces nothing
 * useful. That name describes the *state*, never the word, so a screen-reader
 * user learns the card is hidden without being told what it hides.
 *
 * Deliberately the only thing that changes. The card keeps its dimensions, and
 * the voice button, the level stripe, the notification badge, every action and —
 * in the list — the row's own tap and long-press all stay exactly where they
 * were: a hidden word is still a card you can hear, open, grade, edit and move.
 */
export function HiddenWordIcon({ color, variant = 'card' }: Props) {
  const t = useLang();
  return (
    <View
      style={variant === 'row' ? s.row : s.card}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('hide_word_card_label')}
    >
      <Ionicons
        name="eye-off-outline"
        size={variant === 'row' ? 18 : 26}
        color={color}
        style={s.icon}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The line box an 18pt word would have occupied, so the list keeps an even
  // rhythm whether or not a row is hidden.
  row: {
    height: 22,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  icon: {
    opacity: 0.35,
  },
});
