import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import {
  DESTRUCTIVE_ACTION_COLOR,
} from '../constants';
import {
  analyzeBulkImport,
  BulkImportExecutionGuard,
  parseBulkImportText,
  type BulkImportDraft,
  type BulkImportResult,
} from '../features/cards/bulkImport';
import {
  FULL_SCREEN_SHEET_HEADER,
  FULL_SCREEN_SHEET_HEADER_ACTION,
  FULL_SCREEN_SHEET_TITLE,
  FullScreenSheet,
} from './FullScreenSheet';

interface Props {
  visible: boolean;
  pal: Palette;
  themeColor: string;
  existingTexts: readonly string[];
  onClose(): void;
  onImport(drafts: readonly BulkImportDraft[]): Promise<BulkImportResult> | BulkImportResult;
}

type Step = 'input' | 'preview';

const BULK_IMPORT_INPUT_INITIAL_HEIGHT = 300;
// Normal tap threshold. Movement up to this counts as a tap on release; past it the
// touch becomes a page scroll and the text box is left alone.
const BULK_IMPORT_TAP_SLOP = 6;

function formatCount(template: string, count: number): string {
  return template.replace('{n}', count.toLocaleString());
}

export function BulkImportModal({
  visible,
  pal,
  themeColor,
  existingTexts,
  onClose,
  onImport,
}: Props) {
  const t = useLang();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('input');
  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState<BulkImportDraft[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(false);
  // True from the moment a successful import closes the sheet until it reopens: the
  // body renders nothing so the closing sheet cannot repaint the preview.
  const [imported, setImported] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const executionGuard = useRef(new BulkImportExecutionGuard()).current;
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const dragStartScrollYRef = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const inputFocusedRef = useRef(false);

  // The native input focuses on touch-down, which is too early to tell a tap from the
  // start of a scroll. So while the box is unfocused the wrapper takes the touch
  // instead: a release inside the tap threshold focuses it, anything longer scrolls
  // the page and never focuses, places a caret, or selects text. Once the box is
  // focused the touch is handed straight to it, so caret placement and long-press
  // selection behave natively while editing.
  const inputScrollPan = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: () => !inputFocusedRef.current,
    onMoveShouldSetPanResponderCapture: (_event, gesture) => (
      Math.abs(gesture.dy) > BULK_IMPORT_TAP_SLOP
      && Math.abs(gesture.dy) > Math.abs(gesture.dx)
    ),
    onPanResponderGrant: () => {
      dragStartScrollYRef.current = scrollYRef.current;
    },
    onPanResponderMove: (_event, gesture) => {
      if (Math.hypot(gesture.dx, gesture.dy) <= BULK_IMPORT_TAP_SLOP) return;
      scrollRef.current?.scrollTo({
        y: Math.max(0, dragStartScrollYRef.current - gesture.dy),
        animated: false,
      });
    },
    // A release that never left the tap threshold was a deliberate tap on the box.
    onPanResponderRelease: (_event, gesture) => {
      if (Math.hypot(gesture.dx, gesture.dy) > BULK_IMPORT_TAP_SLOP) return;
      inputRef.current?.focus();
    },
    // Once the page is following the finger, the input must not grab the drag back.
    onPanResponderTerminationRequest: () => false,
  })).current;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  };

  // Opening resets during render rather than in an effect: an effect would let the
  // previous session's step paint for a frame first, which is the preview flashing
  // back on reopen. Adjusting here re-renders before anything reaches the screen.
  const [renderedVisible, setRenderedVisible] = useState(visible);
  if (visible !== renderedVisible) {
    setRenderedVisible(visible);
    if (visible) {
      setStep('input');
      setInput('');
      setDrafts([]);
      setImporting(false);
      setImportError(false);
      setImported(false);
      inputFocusedRef.current = false;
    }
  }

  useEffect(() => {
    if (!visible) {
      setKbHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, event => {
      setKbHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKbHeight(0);
      // Android can hide the keyboard while the input keeps focus. Dropping focus with
      // it keeps the tap-to-focus gesture in charge whenever the keyboard is away.
      inputRef.current?.blur();
    });
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  const parsedDrafts = useMemo(() => parseBulkImportText(input), [input]);
  const previewDisabled = parsedDrafts.length === 0;
  const previewAnalysis = useMemo(
    () => analyzeBulkImport(drafts, existingTexts),
    [drafts, existingTexts],
  );
  const importDisabled = importing
    || previewAnalysis.validItems.length === 0;
  const resetDisabled = input.length === 0;

  const close = () => {
    if (!importing) onClose();
  };

  const openPreview = () => {
    if (previewDisabled) return;
    Keyboard.dismiss();
    setDrafts(parsedDrafts);
    setStep('preview');
  };

  // Clearing the text is enough to restore the default height: the box auto-sizes
  // from `minHeight` up, so it has no grown height to undo.
  const resetInput = () => {
    if (resetDisabled) return;
    setInput('');
  };

  const updateDraft = (id: string, text: string) => {
    setDrafts(current => current.map(item => item.id === id ? { ...item, text } : item));
  };

  const removeDraft = (id: string) => {
    setDrafts(current => current.filter(item => item.id !== id));
  };

  const runImport = () => executionGuard.run(async () => {
    if (importDisabled) return;
    setImportError(false);
    setImporting(true);
    try {
      const importResult = await onImport(
        previewAnalysis.items.map(item => ({ id: item.id, text: item.normalizedText })),
      );
      if (importResult.error) {
        setImportError(true);
        setImporting(false);
        return;
      }
      // Stop rendering the preview in the same update that closes the sheet. Importing
      // grows the word list, which flows back in through `existingTexts` and would
      // otherwise repaint every reviewed row as a duplicate while the sheet slides
      // away. `importing` deliberately stays true so the footer cannot change either;
      // reopening the sheet resets both.
      setImported(true);
      onClose();
    } catch {
      setImportError(true);
      setImporting(false);
    }
  });

  // A finished import leaves only the sheet's own background to slide away, so the
  // word list is the next thing on screen — no preview, no header, no flash.
  if (imported) {
    return <FullScreenSheet visible={visible} pal={pal} onRequestClose={close} />;
  }

  return (
    <FullScreenSheet visible={visible} pal={pal} onRequestClose={close}>
      <View style={styles.safe}>
        <View style={[styles.header, { borderBottomColor: pal.border }]}>
          {step === 'preview' && !importing ? (
            <TouchableOpacity
              style={styles.headerAction}
              onPress={() => setStep('input')}
              accessibilityRole="button"
              accessibilityLabel={t('ob_back')}
            >
              <Ionicons name="chevron-back" size={22} color={themeColor} />
            </TouchableOpacity>
          ) : <View style={styles.headerAction} />}
          <Text style={[styles.title, { color: pal.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {t('bulk_import')}
          </Text>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={close}
            disabled={importing}
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
            accessibilityState={{ disabled: importing }}
          >
            <Ionicons name="close" size={23} color={importing ? pal.border : pal.sub} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {step === 'input' ? (
            <ScrollView
              ref={scrollRef}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              // The keyboard is compensated once, by the KeyboardAvoidingView padding
              // above. Letting iOS also manage keyboard/content insets made every
              // growth of the box re-scroll to the caret and snap back, which is the
              // jump seen when pressing Enter on the last line.
              automaticallyAdjustKeyboardInsets={false}
              automaticallyAdjustContentInsets={false}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.helper, { color: pal.sub }]}>{t('bulk_import_helper')}</Text>
              <View style={styles.resetRow}>
                <TouchableOpacity
                  style={[
                    styles.resetButton,
                    { backgroundColor: pal.chip },
                    resetDisabled && styles.disabled,
                  ]}
                  onPress={resetInput}
                  disabled={resetDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={t('bulk_import_reset')}
                  accessibilityState={{ disabled: resetDisabled }}
                >
                  <Ionicons name="refresh" size={14} color={pal.sub} />
                  <Text style={[styles.resetButtonText, { color: pal.text }]}>
                    {t('bulk_import_reset')}
                  </Text>
                </TouchableOpacity>
              </View>
              <View {...inputScrollPan.panHandlers}>
                <TextInput
                  ref={inputRef}
                  value={input}
                  onChangeText={setInput}
                  onFocus={() => { inputFocusedRef.current = true; }}
                  onBlur={() => { inputFocusedRef.current = false; }}
                  multiline
                  scrollEnabled={false}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  placeholder={t('bulk_import_placeholder')}
                  placeholderTextColor={pal.sub}
                  accessibilityLabel={t('bulk_import_input_label')}
                  style={[
                    styles.bulkInput,
                    { backgroundColor: pal.input, borderColor: pal.border, color: pal.text },
                  ]}
                />
              </View>
              <View style={styles.countRow}>
                <Text style={[styles.count, { color: pal.sub }]}>
                  {formatCount(t('bulk_import_parsed_count'), parsedDrafts.length)}
                </Text>
              </View>
              <View style={styles.footerButtons}>
                <TouchableOpacity
                  style={[styles.secondaryButton, { backgroundColor: pal.chip }]}
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel={t('cancel')}
                >
                  <Text style={[styles.buttonText, { color: pal.text }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    { backgroundColor: themeColor },
                    previewDisabled && styles.disabled,
                  ]}
                  onPress={openPreview}
                  disabled={previewDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={t('bulk_import_preview')}
                  accessibilityState={{ disabled: previewDisabled }}
                >
                  <Text style={styles.primaryButtonText}>{t('bulk_import_preview')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.flex}>
              <View style={[styles.previewSummary, { borderBottomColor: pal.border }]}>
                <Text style={[styles.previewHeading, { color: pal.text }]}>{t('bulk_import_preview')}</Text>
                <Text style={[styles.count, { color: pal.sub }]}>
                  {formatCount(t('bulk_import_valid_count'), previewAnalysis.validItems.length)}
                </Text>
              </View>
              <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.previewList}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {previewAnalysis.items.map((item, index) => (
                  <View
                    key={item.id}
                    style={[styles.previewItem, { backgroundColor: pal.card, borderColor: pal.border }]}
                  >
                    <Text style={[styles.itemNumber, { color: pal.sub }]}>{index + 1}</Text>
                    <View style={styles.itemBody}>
                      <TextInput
                        value={item.text}
                        onChangeText={text => updateDraft(item.id, text)}
                        multiline
                        scrollEnabled={false}
                        textAlignVertical="top"
                        accessibilityLabel={`${t('bulk_import_input_label')} ${index + 1}`}
                        style={[styles.itemInput, { color: pal.text }]}
                      />
                      <View style={styles.badgeRow}>
                        {item.duplicateKind != null && (
                          <Text style={styles.duplicateBadge}>{t('bulk_import_duplicate')}</Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeDraft(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('bulk_import_remove_item')} ${index + 1}`}
                    >
                      <Ionicons
                        name="close-circle"
                        size={25}
                        color={DESTRUCTIVE_ACTION_COLOR}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>

              <View style={[styles.previewFooter, { borderTopColor: pal.border, backgroundColor: pal.bg }]}>
                {importError && (
                  <Text style={styles.errorText}>{t('bulk_import_failed_generic')}</Text>
                )}
                {importing && (
                  <View style={styles.progressRow}>
                    <ActivityIndicator size="small" color={themeColor} />
                    <Text style={[styles.count, { color: pal.sub }]}>
                      {formatCount(t('bulk_import_importing'), previewAnalysis.validItems.length)}
                    </Text>
                  </View>
                )}
                <View style={styles.footerButtons}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, { backgroundColor: pal.chip }]}
                    onPress={() => setStep('input')}
                    disabled={importing}
                    accessibilityRole="button"
                    accessibilityLabel={t('ob_back')}
                    accessibilityState={{ disabled: importing }}
                  >
                    <Text style={[styles.buttonText, { color: pal.text }]}>{t('ob_back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      { backgroundColor: themeColor },
                      importDisabled && styles.disabled,
                    ]}
                    onPress={() => { void runImport(); }}
                    disabled={importDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={t('bulk_import_import')}
                    accessibilityState={{ disabled: importDisabled, busy: importing }}
                  >
                    {importing && <ActivityIndicator size="small" color="#fff" />}
                    <Text style={styles.primaryButtonText}>{t('bulk_import_import')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
        {kbHeight > 0 && step === 'input' && (
          <View style={[styles.kbToolbar, { bottom: Math.max(0, kbHeight - insets.bottom) }]}>
            <TouchableOpacity
              onPress={openPreview}
              disabled={previewDisabled}
              style={[
                styles.kbBtn,
                { backgroundColor: themeColor },
                previewDisabled && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('bulk_import_preview')}
              accessibilityState={{ disabled: previewDisabled }}
            >
              <Text style={[styles.kbBtnText, { color: '#fff' }]}>{t('bulk_import_preview')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={Keyboard.dismiss}
              style={[styles.kbBtn, { backgroundColor: pal.chip }]}
              accessibilityRole="button"
              accessibilityLabel={t('dismiss_keyboard')}
            >
              <Ionicons name="chevron-down" size={16} color={pal.sub} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </FullScreenSheet>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    ...FULL_SCREEN_SHEET_HEADER,
  },
  headerAction: { ...FULL_SCREEN_SHEET_HEADER_ACTION },
  title: { ...FULL_SCREEN_SHEET_TITLE },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
  helper: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  resetRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 32,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  resetButtonText: { fontSize: 13, fontWeight: '600' },
  bulkInput: {
    // No explicit height: the box sits at this default and auto-grows to fit
    // overflowing content, so nothing is ever clipped or internally scrolled.
    minHeight: BULK_IMPORT_INPUT_INITIAL_HEIGHT,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    lineHeight: 23,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 9,
  },
  count: { fontSize: 13, lineHeight: 18 },
  footerButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
  },
  disabled: { opacity: 0.42 },
  buttonText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  errorText: { color: DESTRUCTIVE_ACTION_COLOR, fontSize: 13, lineHeight: 18, marginTop: 8 },
  previewSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  previewHeading: { fontSize: 16, fontWeight: '700' },
  previewList: { padding: 14, paddingBottom: 28, gap: 9 },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  itemNumber: {
    width: 30,
    marginRight: 12,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  itemBody: { flex: 1, justifyContent: 'center', minWidth: 0 },
  itemInput: {
    minHeight: 20,
    padding: 0,
    margin: 0,
    fontSize: 15,
    lineHeight: 20,
    includeFontPadding: false,
  },
  removeButton: {
    width: 44,
    height: 44,
    marginLeft: 8,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingTop: 5 },
  duplicateBadge: {
    color: '#9A6700',
    backgroundColor: '#FFF4CE',
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '600',
  },
  previewFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  progressRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  kbToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  kbBtn: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    height: 36,
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  kbBtnText: { fontSize: 15, fontWeight: '700' },
});
