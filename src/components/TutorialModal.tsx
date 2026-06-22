import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../types';
import { appStyles as s } from '../styles';

interface Props {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  themeColor: string;
}

const STEPS: { icon: string; title: string; description: string }[] = [
  {
    icon: 'add-circle-outline',
    title: 'Add a word',
    description: 'Tap the + button to register a new word with its meaning and an optional note.',
  },
  {
    icon: 'hand-left-outline',
    title: 'Flip a card',
    description: 'Tap any card to flip it and reveal the meaning on the back side.',
  },
  {
    icon: 'arrow-back-outline',
    title: 'Edit or delete',
    description: 'Swipe a card to the left to reveal the Edit and Delete buttons.',
  },
  {
    icon: 'notifications-outline',
    title: 'Set notifications',
    description: 'Tap the bell icon in the top bar to choose how often you receive word reminders.',
  },
  {
    icon: 'notifications-off-outline',
    title: 'Mute a word',
    description: 'Swipe a card left and tap the bell button to exclude that word from notifications.',
  },
];

export function TutorialModal({ visible, onClose, pal, themeColor }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.overlayCenter} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[s.dialog, styles.container, { backgroundColor: pal.dialog }]}>
          <Text style={[s.dialogTitle, { color: pal.text }]}>How to use Habit Tracker</Text>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {STEPS.map((step, i) => (
              <View key={i} style={styles.step}>
                <View style={[styles.iconWrap, { backgroundColor: themeColor + '18' }]}>
                  <Ionicons name={step.icon as any} size={22} color={themeColor} />
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: pal.text }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: pal.sub }]}>{step.description}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: themeColor }]}
            onPress={onClose}
          >
            <Text style={styles.closeBtnText}>Got it</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { maxHeight: '85%' },
  step: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14, flexShrink: 0,
  },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  stepDesc: { fontSize: 13, lineHeight: 19 },
  closeBtn: { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
