import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import { visibleAnnouncements, type Announcement } from '../features/announcements/announcements';

/**
 * Announcements, opened from Settings.
 *
 * Slides in from the right over the Settings screen and dismisses with the back
 * chevron, matching AppInfoSheet — the comparable Settings sub-screen. The list
 * is local and static; see features/announcements/announcements.ts.
 */

const SW = Dimensions.get('window').width;

interface Props {
  visible: boolean;
  onClose: () => void;
  pal: Palette;
  /** BCP-47 tag used to format announcement dates. */
  language: string;
  /** Injectable so tests and previews can supply announcements. */
  announcements?: readonly Announcement[];
}

function formatDate(iso: string, language: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return parsed.toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    // An unsupported locale tag must not take the row down with it.
    return iso;
  }
}

export function AnnouncementsSheet({ visible, onClose, pal, language, announcements }: Props) {
  const insets = useSafeAreaInsets();
  const t = useLang();
  const slideX = useRef(new Animated.Value(SW)).current;

  const items = useMemo(() => visibleAnnouncements(announcements), [announcements]);

  useEffect(() => {
    if (visible) {
      slideX.setValue(SW);
      Animated.spring(slideX, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    }
  }, [visible, slideX]);

  const dismiss = () => {
    Animated.timing(slideX, { toValue: SW, duration: 220, useNativeDriver: true })
      .start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: pal.bg,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          transform: [{ translateX: slideX }],
        },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: pal.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={dismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        >
          <Ionicons name="chevron-back" size={24} color={pal.text} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: pal.text }]}
          accessibilityRole="header"
          numberOfLines={1}
        >
          {t('announcements')}
        </Text>
        {/* Balances the back button so the title stays optically centred. */}
        <View style={styles.backBtn} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty} accessibilityRole="text">
          <View style={[styles.emptyIcon, { backgroundColor: pal.chip }]}>
            <Ionicons name="megaphone-outline" size={32} color={pal.sub} />
          </View>
          <Text style={[styles.emptyTitle, { color: pal.text }]}>
            {t('announcements_empty_title')}
          </Text>
          <Text style={[styles.emptyBody, { color: pal.sub }]}>
            {t('announcements_empty_desc')}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {items.map(item => (
            <View
              key={item.id}
              style={[styles.card, { backgroundColor: pal.card, borderColor: pal.border }]}
              accessibilityRole="text"
              accessibilityLabel={`${item.title}. ${formatDate(item.publishedAt, language)}. ${item.body}`}
            >
              <Text style={[styles.cardDate, { color: pal.sub }]}>
                {formatDate(item.publishedAt, language)}
              </Text>
              <Text style={[styles.cardTitle, { color: pal.text }]}>{item.title}</Text>
              <Text style={[styles.cardBody, { color: pal.sub }]}>{item.body}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  content: { padding: 16, gap: 12 },
  // Centred block with generous side padding so the copy stays readable on an
  // SE and does not stretch edge to edge on a Pro Max.
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  cardDate: { fontSize: 11 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardBody: { fontSize: 13, lineHeight: 19 },
});
