import { ImageBackground, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

interface Props {
  image: number;
  blurIntensity?: number;
  overlayColor?: string;
}

export function SkinWallpaperOverlay({
  image,
  blurIntensity = 20,
  overlayColor = 'rgba(240, 255, 245, 0.45)',
}: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ImageBackground
        source={image}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        {blurIntensity > 0 && (
          <BlurView intensity={blurIntensity} tint="light" style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
      </ImageBackground>
    </View>
  );
}
