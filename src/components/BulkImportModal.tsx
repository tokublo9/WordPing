import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Palette } from '../types';
import { useLang } from '../i18n';
import {
  BULK_IMPORT_MAX_ITEM_CHARS,
  BULK_IMPORT_MAX_ITEMS,
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
  availableSlots?: number;
  onClose(): void;
  onImport(drafts: readonly BulkImportDraft[]): Promise<BulkImportResult> | BulkImportResult;
}

type Step = 'input' | 'preview' | 'result';

function formatCount(template: string, count: number): string {
  return template.replace('{n}', count.toLocaleString());
}

export function BulkImportModal({
  visible,
  pal,
  themeColor,
  existingTexts,
  availableSlots,
  onClose,
  onImport,
}: Props) {
  const t = useLang();
  const [step, setStep] = useState<Step>('input');
  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState<BulkImportDraft[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const executionGuard = useRef(new BulkImportExecutionGuard()).current;

  useEffect(() => {
    if (!visible) return;
    setStep('input');
    setInput('');
    setDrafts([]);
    setImporting(false);
    setResult(null);
  }, [visible]);

  const parsedDrafts = useMemo(() => parseBulkImportText(input), [input]);
  const inputAnalysis = useMemo(
    () => analyzeBulkImport(
      parsedDrafts,
      existingTexts,
      BULK_IMPORT_MAX_ITEMS,
      BULK_IMPORT_MAX_ITEM_CHARS,
    ),
    [existingTexts, parsedDrafts],
  );
  const previewAnalysis = useMemo(
    () => analyzeBulkImport(
      drafts,
      existingTexts,
      BULK_IMPORT_MAX_ITEMS,
      BULK_IMPORT_MAX_ITEM_CHARS,
    ),
    [drafts, existingTexts],
  );
  const exceedsPlanCapacity = availableSlots != null
    && previewAnalysis.validItems.length > Math.max(0, availableSlots);
  const importDisabled = importing
    || previewAnalysis.validItems.length === 0
    || previewAnalysis.exceedsItemLimit
    || previewAnalysis.tooLongCount > 0
    || exceedsPlanCapacity;

  const close = () => {
    if (!importing) onClose();
  };

  const openPreview = () => {
    if (parsedDrafts.length === 0) return;
    setDrafts(parsedDrafts);
    setStep('preview');
  };

  const updateDraft = (id: string, text: string) => {
    setDrafts(current => current.map(item => item.id === id ? { ...item, text } : item));
  };

  const removeDraft = (id: string) => {
    setDrafts(current => current.filter(item => item.id !== id));
  };

  const runImport = () => executionGuard.run(async () => {
    if (importDisabled) return;
    setImporting(true);
    try {
      const importResult = await onImport(
        previewAnalysis.items.map(item => ({ id: item.id, text: item.normalizedText })),
      );
      setResult(importResult);
      setStep('result');
    } catch {
      setResult({
        added: 0,
        duplicatesSkipped: previewAnalysis.duplicateCount,
        failed: previewAnalysis.validItems.length,
        error: 'unknown',
      });
      setStep('result');
    } finally {
      setImporting(false);
    }
  });

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
            accessibilityLabel={step === 'result' ? t('done') : t('cancel')}
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
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.helper, { color: pal.sub }]}>{t('bulk_import_helper')}</Text>
              <TextInput
                value={input}
                onChangeText={setInput}
                multiline
                scrollEnabled
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
              <View style={styles.countRow}>
                <Text style={[styles.count, { color: pal.sub }]}>
                  {formatCount(t('bulk_import_parsed_count'), parsedDrafts.length)}
                </Text>
                <Text style={[
                  styles.limit,
                  { color: inputAnalysis.exceedsItemLimit ? DESTRUCTIVE_ACTION_COLOR : pal.sub },
                ]}>
                  {inputAnalysis.validItems.length} / {BULK_IMPORT_MAX_ITEMS}
                </Text>
              </View>
              {inputAnalysis.exceedsItemLimit && (
                <Text style={styles.errorText}>
                  {formatCount(t('bulk_import_item_limit'), BULK_IMPORT_MAX_ITEMS)}
                </Text>
              )}
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
                    parsedDrafts.length === 0 && styles.disabled,
                  ]}
                  onPress={openPreview}
                  disabled={parsedDrafts.length === 0}
                  accessibilityRole="button"
                  accessibilityLabel={t('bulk_import_preview')}
                  accessibilityState={{ disabled: parsedDrafts.length === 0 }}
                >
                  <Text style={styles.primaryButtonText}>{t('bulk_import_preview')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : step === 'preview' ? (
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
                        {item.tooLong && (
                          <Text style={styles.errorBadge}>
                            {formatCount(t('bulk_import_item_too_long'), BULK_IMPORT_MAX_ITEM_CHARS)}
                          </Text>
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
                {previewAnalysis.exceedsItemLimit && (
                  <Text style={styles.errorText}>
                    {formatCount(t('bulk_import_item_limit'), BULK_IMPORT_MAX_ITEMS)}
                  </Text>
                )}
                {exceedsPlanCapacity && (
                  <Text style={styles.errorText}>{t('reached_word_limit')}</Text>
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
          ) : (
            <View style={styles.resultContent}>
              <View style={[styles.resultIcon, { backgroundColor: themeColor + '1C' }]}>
                <Ionicons
                  name={result?.error ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                  size={44}
                  color={result?.error ? DESTRUCTIVE_ACTION_COLOR : themeColor}
                />
              </View>
              {result?.error === 'word_limit' && (
                <Text style={[styles.resultLine, { color: pal.text }]}>{t('reached_word_limit')}</Text>
              )}
              {result?.error === 'item_limit' && (
                <Text style={[styles.resultLine, { color: pal.text }]}>
                  {formatCount(t('bulk_import_item_limit'), BULK_IMPORT_MAX_ITEMS)}
                </Text>
              )}
              {result?.error === 'item_too_long' && (
                <Text style={[styles.resultLine, { color: pal.text }]}>
                  {formatCount(t('bulk_import_item_too_long'), BULK_IMPORT_MAX_ITEM_CHARS)}
                </Text>
              )}
              {result?.error && !['word_limit', 'item_limit', 'item_too_long'].includes(result.error) && (
                <Text style={[styles.resultLine, { color: pal.text }]}>{t('bulk_import_failed_generic')}</Text>
              )}
              <Text style={[styles.resultLine, { color: pal.text }]}>
                {formatCount(t('bulk_import_added_count'), result?.added ?? 0)}
              </Text>
              {(result?.duplicatesSkipped ?? 0) > 0 && (
                <Text style={[styles.resultLine, { color: pal.sub }]}>
                  {formatCount(t('bulk_import_skipped_count'), result?.duplicatesSkipped ?? 0)}
                </Text>
              )}
              {(result?.failed ?? 0) > 0 && (
                <Text style={[styles.resultLine, { color: DESTRUCTIVE_ACTION_COLOR }]}>
                  {formatCount(t('bulk_import_failed_count'), result?.failed ?? 0)}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.doneButton, { backgroundColor: themeColor }]}
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={t('done')}
              >
                <Text style={styles.primaryButtonText}>{t('done')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
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
  bulkInput: {
    minHeight: 150,
    height: 210,
    maxHeight: 210,
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
  limit: { fontSize: 12, fontVariant: ['tabular-nums'] },
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
  itemNumber: { width: 26, textAlign: 'center', fontSize: 12, fontWeight: '600' },
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
  errorBadge: {
    color: '#B42318',
    backgroundColor: '#FEE4E2',
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
  resultContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 10,
  },
  resultIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  resultLine: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  doneButton: {
    minWidth: 180,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
  },
});
