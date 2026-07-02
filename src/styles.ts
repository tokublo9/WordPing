import { Platform, StyleSheet } from 'react-native';

// Platform is still used for overlayTop paddingTop below

export const appStyles = StyleSheet.create({
  root: { flex: 1 },

  // Header — SafeAreaView already handles top inset, just add visual gap
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: { fontSize: 28, fontWeight: '700' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 8 },

  wordCount: { fontSize: 13, paddingHorizontal: 20, marginBottom: 10 },
  list: { paddingHorizontal: 20, paddingBottom: 100 },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  emptyHint: { fontSize: 14 },

  // FAB
  fab: {
    position: 'absolute', bottom: 36, right: 24,
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },
  fabText: { fontSize: 32, color: '#fff', lineHeight: 36, fontWeight: '300' },

  // Modal overlays
  overlayTop: {
    flex: 1, justifyContent: 'flex-start', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
  },
  overlayCenter: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 24,
  },
  overlayBottom: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dialog: { borderRadius: 24, padding: 24, width: '100%' },
  bottomSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    width: '100%',
  },
  dialogTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },

  // Notification interval list
  intervalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, marginBottom: 6,
  },
  intervalRowText: { fontSize: 15, fontWeight: '500' },
  intervalRowTextSelected: { fontWeight: '700' },

  // Settings — theme color grid
  sectionLabel: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 12,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  colorItem: { alignItems: 'center', width: 56 },
  colorSwatch: {
    width: 42, height: 42, borderRadius: 21, marginBottom: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  colorSwatchSelected: {},
  colorName: { fontSize: 11, fontWeight: '500' },

  // Settings — appearance buttons
  appearanceRow: { flexDirection: 'row', gap: 8 },
  appearanceBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 14,
  },
  appearanceBtnText: { fontSize: 13, fontWeight: '600' },

  // Word modal inputs
  inputLabel: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 6,
  },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 18 },
  inputMultiline: { minHeight: 48, textAlignVertical: 'top' },
  saveBtn: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 10 },
  cancelBtnText: { fontSize: 15 },
});
