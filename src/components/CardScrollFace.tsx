import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { FLIP_CARD_H, FLIP_CARD_PAD_H, FLIP_CARD_PAD_V } from '../constants';

interface Props {
  children: React.ReactNode;
  // Called on a quick tap anywhere on the card face (but not after a vertical drag).
  // Placing the Pressable INSIDE the ScrollView is the key: React Native's Pressable
  // automatically yields the gesture to the parent ScrollView on vertical drags, so
  // onFlip never fires after a scroll. Horizontal drags are stolen by the parent
  // PanResponder (FlipCardBrowser) without triggering onFlip.
  onFlip: () => void;
  /**
   * The card's voice control. Every caller passes a `WordCardVoiceButton` driven by
   * `useWordCardVoicePlayback`, so the icon, its loading and playing states and its tap
   * behaviour are identical on every screen.
   */
  voiceButton?: React.ReactNode;
  showVoice?: boolean;
}

export function CardScrollFace({
  children,
  onFlip,
  voiceButton,
  showVoice = true,
}: Props) {
  return (
    <View style={s.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator
        scrollIndicatorInsets={{ top: 4, bottom: 4 }}
        bounces={false}
        nestedScrollEnabled
      >
        {/*
          Pressable fills at least the full card height so the entire card surface
          is tappable for short content. For long content it grows beyond FLIP_CARD_H,
          making the excess scrollable. justifyContent:'center' only has room to act
          when content is shorter than the padded area, centering it naturally.
        */}
        <Pressable style={s.pressable} onPress={onFlip}>
          {children}
        </Pressable>
      </ScrollView>

      {/* Voice button is outside the ScrollView so it stays fixed while text scrolls. */}
      {showVoice && voiceButton && (
        <View style={s.wordCardVoiceBtn}>{voiceButton}</View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  pressable: {
    minHeight: FLIP_CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: FLIP_CARD_PAD_V,
    paddingHorizontal: FLIP_CARD_PAD_H,
    paddingBottom: FLIP_CARD_PAD_V,
  },
  wordCardVoiceBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
