import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Appearance, Palette } from '../types';
import { THEME_COLORS } from '../constants';
import { appStyles as s } from '../styles';

interface Props {
  visible: boolean;
  onClose: () => void;
  themeColor: string;
  onPickTheme: (color: string) => void;
  appearance: Appearance;
  onPickAppearance: (mode: Appearance) => void;
  pal: Palette;
}

export function SettingsModal({
  visible, onClose, themeColor, onPickTheme, appearance, onPickAppearance, pal,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.overlayCenter} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[s.dialog, { backgroundColor: pal.dialog }]}>
          <Text style={[s.dialogTitle, { color: pal.text }]}>Settings</Text>

          <Text style={[s.sectionLabel, { color: pal.sub }]}>Theme Color</Text>
          <View style={s.colorGrid}>
            {THEME_COLORS.map(color => (
              <TouchableOpacity
                key={color.value}
                style={s.colorItem}
                onPress={() => onPickTheme(color.value)}
              >
                <View style={[
                  s.colorSwatch,
                  { backgroundColor: color.value },
                  themeColor === color.value && s.colorSwatchSelected,
                ]}>
                  {themeColor === color.value && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </View>
                <Text style={[s.colorName, { color: pal.sub }]}>{color.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.sectionLabel, { color: pal.sub, marginTop: 20 }]}>Appearance</Text>
          <View style={s.appearanceRow}>
            {(['light', 'dark', 'system'] as Appearance[]).map(mode => {
              const active = appearance === mode;
              const label = mode.charAt(0).toUpperCase() + mode.slice(1);
              const icon =
                mode === 'light' ? 'sunny-outline' :
                mode === 'dark'  ? 'moon-outline'  :
                                   'phone-portrait-outline';
              return (
                <TouchableOpacity
                  key={mode}
                  style={[
                    s.appearanceBtn,
                    { backgroundColor: active ? themeColor : pal.chip },
                  ]}
                  onPress={() => onPickAppearance(mode)}
                >
                  <Ionicons name={icon as any} size={18} color={active ? '#fff' : pal.sub} />
                  <Text style={[s.appearanceBtnText, { color: active ? '#fff' : pal.sub }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
