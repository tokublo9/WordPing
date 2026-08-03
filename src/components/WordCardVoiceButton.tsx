import { ActivityIndicator, type StyleProp, TouchableOpacity, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TTSPlaybackPhase } from '../lib/tts';
import { isTTSNetworkLoading } from '../lib/ttsPlaybackState';

interface Props {
  phase?: Exclude<TTSPlaybackPhase, 'idle'>;
  onPress(): void;
  themeColor: string;
  inactiveColor: string;
  onDarkBackground?: boolean;
  locked?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Identical voice-button visuals and accessibility for list and Flip cards. */
export function WordCardVoiceButton({
  phase,
  onPress,
  themeColor,
  inactiveColor,
  onDarkBackground = false,
  locked = false,
  disabled = false,
  style,
}: Props) {
  const loading = isTTSNetworkLoading(phase);
  const playing = phase === 'playing';
  const idleDarkColor = 'rgba(255,255,255,0.7)';
  const activeDarkColor = '#fff';

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      disabled={disabled || locked}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={loading ? 'Loading audio' : 'Play pronunciation'}
      accessibilityState={{ disabled: disabled || locked, busy: loading }}
    >
      {locked ? (
        <Ionicons
          name="lock-closed-outline"
          size={15}
          color={onDarkBackground ? 'rgba(255,255,255,0.5)' : inactiveColor}
          style={{ opacity: 0.6 }}
        />
      ) : loading ? (
        <ActivityIndicator
          size="small"
          color={onDarkBackground ? activeDarkColor : themeColor}
          accessible={false}
        />
      ) : (
        <Ionicons
          name={playing ? 'volume-high' : 'volume-medium-outline'}
          size={17}
          color={onDarkBackground
            ? (playing ? activeDarkColor : idleDarkColor)
            : (playing ? themeColor : inactiveColor)}
        />
      )}
    </TouchableOpacity>
  );
}
