import {
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FLIP_CARD_H, FLIP_CARD_PAD_H, FLIP_CARD_PAD_V } from '../constants';

interface Props {
  children: React.ReactNode;
  // Called on a quick tap anywhere on the card face (but not after a vertical drag).
  // Placing the Pressable INSIDE the ScrollView is the key: React Native's Pressable
  // automatically yields the gesture to the parent ScrollView on vertical drags, so
  // onFlip never fires after a scroll. Horizontal drags are stolen by the parent
  // PanResponder (FlipCardBrowser) without triggering onFlip.
  onFlip: () => void;
  onVoice: () => void;
  voiceColor: string;
  showVoice?: boolean;
}

export function CardScrollFace({ children, onFlip, onVoice, voiceColor, showVoice = true }: Props) {
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
      {showVoice && (
        <TouchableOpacity
          style={s.voiceBtn}
          onPress={onVoice}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="volume-medium-outline" size={20} color={voiceColor} />
        </TouchableOpacity>
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
  voiceBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 2,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
