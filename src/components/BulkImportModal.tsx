import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  I18nManager,
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
import { PostHogMaskView } from 'posthog-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Palette } from '../types';
import { useLang, type TranslationKey } from '../i18n';
import {
  DESTRUCTIVE_ACTION_COLOR,
} from '../constants';
import {
  analyzeBulkImport,
  BulkImportExecutionGuard,
  fileImportDrafts,
  parseBulkImportText,
  planFileImport,
  type BulkImportAnalysis,
  type BulkImportDraft,
  type BulkImportResult,
  type FileImportPlan,
} from '../features/cards/bulkImport';
import { pickWordImportFile } from '../features/cards/importFile';
import {
  normalizeImportSource,
  type ImportSource,
  type ImportSourceFailure,
} from '../features/cards/fileImport';
import {
  IMPORT_PREVIEW_LIMIT,
  IMPORT_ROLES,
  previewRecords,
  type ImportFieldRole,
} from '../features/cards/importMapping';
import { fillTemplate } from '../lib/fillTemplate';
import type { Folder, WordCard } from '../types';
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
  /** Every card, so a file import can check duplicates in the folder each row lands in. */
  existingCards: readonly WordCard[];
  /** Used to resolve a `folder` column onto a real folder. Never creates one. */
  folders: readonly Folder[];
  destinationFolderId: string | null;
  onClose(): void;
  onImport(drafts: readonly BulkImportDraft[]): Promise<BulkImportResult> | BulkImportResult;
}

type Step = 'input' | 'preview' | 'file-mapping' | 'file-preview' | 'file-backup-rejected';

const PARSE_FAILURE_KEYS: Readonly<Record<ImportSourceFailure, TranslationKey>> = {
  empty_file: 'import_file_error_empty',
  invalid_json: 'import_file_error_invalid_json',
  unsupported_shape: 'import_file_error_shape',
  no_columns: 'import_file_error_columns',
  no_rows: 'import_file_error_empty',
  file_too_large: 'import_file_error_too_large',
  native_backup: 'import_backup_rejected_body',
};

const ROLE_LABEL_KEYS: Readonly<Record<ImportFieldRole, TranslationKey>> = {
  front: 'word_label',
  back: 'meaning_label',
  note: 'note_label',
  ignore: 'import_map_ignore',
};

/** Preselect only roles with exactly one detected claimant. */
function initialFileMapping(source: ImportSource): ImportFieldRole[] {
  return source.analysis.columns.map(column => {
    if (column.detected === null || column.detected === 'ignore') return 'ignore';
    const claimantCount = source.analysis.columns.filter(
      candidate => candidate.detected === column.detected,
    ).length;
    return claimantCount === 1 ? column.detected : 'ignore';
  });
}

function sourceRowNumber(source: ImportSource, index: number): number {
  return index + (source.format === 'csv' ? 2 : 1);
}

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
  existingCards,
  folders,
  destinationFolderId,
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
  const [kbHeight, setKbHeight] = useState(0);
  // ── CSV / JSON import ───────────────────────────────────────────────────────
  // Held separately from the typed flow so neither can disturb the other: the
  // text box keeps its content while a file is being reviewed, and backing out
  // of the file preview returns to exactly what was typed.
  const [filePlan, setFilePlan] = useState<FileImportPlan | null>(null);
  const [fileSource, setFileSource] = useState<ImportSource | null>(null);
  const [fileMapping, setFileMapping] = useState<ImportFieldRole[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileBlankSkippedCount, setFileBlankSkippedCount] = useState(0);
  const [fileErrorKey, setFileErrorKey] = useState<TranslationKey | null>(null);
  const [picking, setPicking] = useState(false);
  const executionGuard = useRef(new BulkImportExecutionGuard()).current;
  // Keep the submitted rows stable while the native full-screen Modal dismisses.
  // The import updates `existingTexts`, which would otherwise repaint every row as
  // a duplicate. Crucially, the content stays mounted instead of collapsing to an
  // empty full-screen surface during the dismissal animation.
  const submittedAnalysisRef = useRef<BulkImportAnalysis | null>(null);
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
      submittedAnalysisRef.current = null;
      inputFocusedRef.current = false;
      setFilePlan(null);
      setFileSource(null);
      setFileMapping([]);
      setFileName('');
      setFileBlankSkippedCount(0);
      setFileErrorKey(null);
      setPicking(false);
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
  const renderedPreviewAnalysis = importing && submittedAnalysisRef.current
    ? submittedAnalysisRef.current
    : previewAnalysis;
  const importDisabled = importing
    || previewAnalysis.validItems.length === 0;
  const resetDisabled = input.length === 0;
  const mappedImport = useMemo(
    () => fileSource === null ? null : normalizeImportSource(fileSource, fileMapping),
    [fileMapping, fileSource],
  );
  const mappedPreview = useMemo(
    () => previewRecords(mappedImport?.records ?? [], IMPORT_PREVIEW_LIMIT),
    [mappedImport],
  );
  const mappingErrorKey: TranslationKey | null = !mappedImport || mappedImport.validity.ok
    ? null
    : mappedImport.validity.reason === 'front_missing'
      ? 'import_map_error_front'
      : mappedImport.validity.reason === 'back_missing'
        ? 'import_map_error_back'
        : 'import_map_error_duplicate';
  const mappingSkippedCount = mappedImport === null
    ? 0
    : mappedImport.skippedBlank + mappedImport.errors.length;
  const mappingCanContinue = mappedImport?.validity.ok === true
    && mappedImport.records.length > 0;
  const previewCountText = (total: number) => fillTemplate(
    t(total > IMPORT_PREVIEW_LIMIT ? 'import_preview_showing' : 'import_preview_ready'),
    {
      shown: String(Math.min(total, IMPORT_PREVIEW_LIMIT)),
      total: String(total),
    },
  );
  const importCountText = (total: number) => fillTemplate(
    t('import_confirm_count'),
    { total: String(total) },
  );
  const filePreviewCountsText = filePlan === null ? '' : fillTemplate(
    t('import_preview_counts'),
    {
      added: String(filePlan.validCount),
      duplicates: String(filePlan.duplicateCount),
      skipped: String(filePlan.invalidCount + fileBlankSkippedCount),
    },
  );
  const filePreviewTruncationText = fillTemplate(
    t('import_preview_first_notice'),
    { shown: String(IMPORT_PREVIEW_LIMIT) },
  );
  const backupRejectedTitle = fillTemplate(
    t('import_backup_rejected_title'),
    { appName: t('app_name') },
  );
  const backupRejectedBody = fillTemplate(
    t('import_backup_rejected_body'),
    { appName: t('app_name') },
  );

  const close = () => {
    if (importing) return;
    Keyboard.dismiss();
    onClose();
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

  const clearFileAndReturnToInput = () => {
    setStep('input');
    setFilePlan(null);
    setFileSource(null);
    setFileMapping([]);
    setFileName('');
    setFileBlankSkippedCount(0);
    setImportError(false);
  };

  /** A role moves between columns, so duplicate assignments never exist. */
  const changeFileMapping = (columnIndex: number, role: ImportFieldRole) => {
    setFileMapping(current => current.map((assigned, index) => {
      if (index === columnIndex) return role;
      if (role !== 'ignore' && assigned === role) return 'ignore';
      return assigned;
    }));
    setImportError(false);
  };

  const continueMappedFile = () => {
    if (!fileSource || !mappedImport || !mappingCanContinue) return;
    const rejectedRows = new Set(mappedImport.errors.map(error => error.rowNumber));
    const acceptedRowNumbers = fileSource.rows.flatMap((row, index) => {
      const rowNumber = sourceRowNumber(fileSource, index);
      return row.every(cell => cell.trim() === '') || rejectedRows.has(rowNumber)
        ? []
        : [rowNumber];
    });
    setFilePlan(planFileImport({
      rows: mappedImport.records.map((record, index) => ({
        rowNumber: acceptedRowNumbers[index] ?? sourceRowNumber(fileSource, index),
        word: record.front,
        meaning: record.back,
        note: record.note,
        folderName: '',
      })),
      errors: mappedImport.errors.map(error => ({
        rowNumber: error.rowNumber,
        reason: 'malformed' as const,
      })),
      ignoredColumns: fileSource.headers.filter((_, index) => fileMapping[index] === 'ignore'),
      existingCards,
      folders,
      destinationFolderId,
    }));
    setFileBlankSkippedCount(mappedImport.skippedBlank);
    setStep('file-preview');
  };

  /**
   * Chooses a CSV or JSON file, parses it on the device, and shows the plan.
   *
   * Nothing is written here. A parse failure names its reason rather than
   * collapsing to a generic error, because "not valid JSON" and "no word
   * column" have completely different fixes.
   */
  const pickFile = async () => {
    if (picking || importing) return;
    Keyboard.dismiss();
    setPicking(true);
    setFileErrorKey(null);
    try {
      const picked = await pickWordImportFile();
      if (picked.status === 'cancelled') return;
      if (picked.status === 'unreadable') {
        setFileErrorKey('import_file_error_unreadable');
        return;
      }
      // A completed selection replaces every temporary decision from the
      // previous file. Cancelling the picker above leaves that state alone.
      setFilePlan(null);
      setFileSource(null);
      setFileMapping([]);
      setImportError(false);
      setFileName(picked.fileName);
      setFileBlankSkippedCount(0);
      if (!picked.result.ok) {
        if (picked.result.error === 'native_backup') {
          setStep('file-backup-rejected');
          return;
        }
        setFileErrorKey(PARSE_FAILURE_KEYS[picked.result.error]);
        return;
      }
      const source = picked.result.value;
      const initialMapping = initialFileMapping(source);
      setFileSource(source);
      setFileMapping(initialMapping);
      if (!source.analysis.autoMappable) {
        setStep('file-mapping');
        return;
      }
      if (!picked.compatibleResult?.ok) {
        setFileErrorKey(picked.compatibleResult
          ? PARSE_FAILURE_KEYS[picked.compatibleResult.error]
          : 'import_file_error_unreadable');
        return;
      }
      const normalized = normalizeImportSource(source, initialMapping);
      const legacyErrorRows = new Set(
        picked.compatibleResult.value.errors.map(error => error.rowNumber),
      );
      const normalizedErrorRows = new Set(normalized.errors.map(error => error.rowNumber));
      const addedErrors = normalized.errors
        .filter(error => !legacyErrorRows.has(error.rowNumber))
        .map(error => ({ rowNumber: error.rowNumber, reason: 'malformed' as const }));
      const unreportedBlankRows = source.rows.filter((row, index) => (
        row.every(cell => cell.trim() === '')
        && !legacyErrorRows.has(sourceRowNumber(source, index))
      )).length;
      setFileBlankSkippedCount(unreportedBlankRows);
      setFilePlan(planFileImport({
        rows: picked.compatibleResult.value.rows.filter(
          row => !normalizedErrorRows.has(row.rowNumber),
        ),
        errors: [...picked.compatibleResult.value.errors, ...addedErrors],
        ignoredColumns: picked.compatibleResult.value.ignoredColumns,
        existingCards,
        folders,
        destinationFolderId,
      }));
      setStep('file-preview');
    } catch {
      setFileErrorKey('import_file_error_unreadable');
    } finally {
      setPicking(false);
    }
  };

  /**
   * Commits the file plan.
   *
   * Only the rows the plan accepted are sent. `createBulkImportBatch` checks
   * every one again on the way in, so a word added between the preview and this
   * tap is still caught and counted rather than duplicated.
   */
  const runFileImport = () => executionGuard.run(async () => {
    if (importing || !filePlan || filePlan.validCount === 0) return;
    setImportError(false);
    setImporting(true);
    try {
      const importResult = await onImport(fileImportDrafts(filePlan));
      if (importResult.error) {
        setImportError(true);
        setImporting(false);
        return;
      }
      onClose();
    } catch {
      // An unexpected failure leaves nothing behind: the batch is built in full
      // before it reaches state, so a throw means no card was created.
      setImportError(true);
      setImporting(false);
    }
  });

  const backFromFilePreview = () => {
    if (fileSource && !fileSource.analysis.autoMappable) {
      setStep('file-mapping');
      setImportError(false);
      return;
    }
    clearFileAndReturnToInput();
  };

  const runImport = () => executionGuard.run(async () => {
    if (importDisabled) return;
    Keyboard.dismiss();
    const analysisAtSubmission = previewAnalysis;
    submittedAnalysisRef.current = analysisAtSubmission;
    setImportError(false);
    setImporting(true);
    try {
      const importResult = await onImport(
        analysisAtSubmission.items.map(item => ({ id: item.id, text: item.normalizedText })),
      );
      if (importResult.error) {
        submittedAnalysisRef.current = null;
        setImportError(true);
        setImporting(false);
        return;
      }
      // Keep `importing` and the submitted snapshot intact until native dismissal
      // completes. Reopening resets the session before it can paint.
      onClose();
    } catch {
      submittedAnalysisRef.current = null;
      setImportError(true);
      setImporting(false);
    }
  });

  return (
    <FullScreenSheet visible={visible} pal={pal} onRequestClose={close}>
      <View style={styles.safe}>
        <View style={[styles.header, { borderBottomColor: pal.border }]}>
          {(step === 'preview' || step === 'file-mapping' || step === 'file-preview') && !importing ? (
            <TouchableOpacity
              style={styles.headerAction}
              onPress={() => {
                if (step === 'preview') setStep('input');
                else if (step === 'file-preview') backFromFilePreview();
                else clearFileAndReturnToInput();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('ob_back')}
            >
              <Ionicons
                name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
                size={22}
                color={themeColor}
              />
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
          {step === 'file-backup-rejected' ? (
            <View style={styles.rejectionContent} accessibilityRole="alert">
              <Ionicons name="shield-checkmark-outline" size={42} color={themeColor} />
              <Text style={[styles.mappingTitle, { color: pal.text }]} accessibilityRole="header">
                {backupRejectedTitle}
              </Text>
              <Text style={[styles.rejectionBody, { color: pal.sub }]}>
                {backupRejectedBody}
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, styles.rejectionButton, { backgroundColor: themeColor }]}
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={t('import_backup_rejected_action')}
                accessibilityHint={backupRejectedBody}
              >
                <Text style={styles.primaryButtonText}>{t('import_backup_rejected_action')}</Text>
              </TouchableOpacity>
            </View>
          ) : step === 'file-mapping' && fileSource !== null && mappedImport !== null ? (
            <View style={styles.flex}>
              <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.mappingContent}
                showsVerticalScrollIndicator={false}
              >
                <PostHogMaskView>
                  <Text style={[styles.fileName, { color: pal.sub }]} numberOfLines={1}>
                    {t('import_file_summary').replace('{file}', fileName)}
                  </Text>
                </PostHogMaskView>
                <Text style={[styles.mappingTitle, { color: pal.text }]} accessibilityRole="header">
                  {t('import_map_title')}
                </Text>
                <Text style={[styles.helper, { color: pal.sub }]}>{t('import_map_desc')}</Text>
                <Text style={[styles.count, { color: pal.sub }]}>
                  {[
                    formatCount(t('import_map_records'), fileSource.rows.length),
                    formatCount(t('import_file_valid'), mappedImport.records.length),
                    formatCount(t('import_file_invalid'), mappingSkippedCount),
                  ].join(' · ')}
                </Text>

                <View style={styles.mappingColumns}>
                  {fileSource.analysis.columns.map(column => {
                    const columnLabel = t('import_map_column').replace('{name}', column.header);
                    return (
                      <PostHogMaskView key={`${column.index}-${column.header}`}>
                      <View
                        style={[styles.mappingColumn, { backgroundColor: pal.card, borderColor: pal.border }]}
                      >
                        <Text style={[styles.mappingColumnName, { color: pal.text }]} numberOfLines={2}>
                          {columnLabel}
                        </Text>
                        <View
                          style={[
                            styles.mappingChoices,
                            I18nManager.isRTL && styles.rowReverse,
                          ]}
                          accessibilityRole="radiogroup"
                          accessibilityLabel={columnLabel}
                        >
                          {IMPORT_ROLES.map(role => {
                            const selected = fileMapping[column.index] === role;
                            const roleLabel = t(ROLE_LABEL_KEYS[role]);
                            return (
                              <TouchableOpacity
                                key={role}
                                style={[
                                  styles.mappingChoice,
                                  {
                                    backgroundColor: selected ? themeColor + '18' : pal.input,
                                    borderColor: selected ? themeColor : pal.border,
                                  },
                                ]}
                                onPress={() => changeFileMapping(column.index, role)}
                                accessibilityRole="radio"
                                accessibilityLabel={`${columnLabel}. ${roleLabel}`}
                                accessibilityHint={t('import_map_choice_hint')
                                  .replace('{column}', column.header)
                                  .replace('{role}', roleLabel)}
                                accessibilityState={{ selected }}
                              >
                                <Text
                                  style={[
                                    styles.mappingChoiceText,
                                    { color: selected ? themeColor : pal.text },
                                  ]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                >
                                  {roleLabel}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                      </PostHogMaskView>
                    );
                  })}
                </View>

                {mappingErrorKey !== null && (
                  <Text
                    style={styles.errorText}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                  >
                    {t(mappingErrorKey)}
                  </Text>
                )}

                <Text
                  style={[styles.mappingPreviewTitle, { color: pal.text }]}
                  accessibilityRole="header"
                  accessibilityLabel={t('bulk_import_preview')}
                  accessibilityHint={t('import_map_preview_hint')}
                >
                  {t('bulk_import_preview')}
                </Text>
                <Text style={[styles.count, { color: pal.sub }]}>
                  {previewCountText(mappedImport.records.length)}
                </Text>
                <View style={styles.mappingPreviewList}>
                  {mappedPreview.map((record, index) => (
                    <View
                      key={`mapped-preview-${index}`}
                      style={[
                        styles.mappingPreviewCard,
                        I18nManager.isRTL && styles.rowReverse,
                        { backgroundColor: pal.card, borderColor: pal.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.itemNumber,
                          I18nManager.isRTL && styles.rtlItemNumber,
                          { color: pal.sub },
                        ]}
                      >
                        {index + 1}
                      </Text>
                      <View style={styles.itemBody}>
                        {([
                          ['word_label', record.front],
                          ['meaning_label', record.back],
                          ['note_label', record.note],
                        ] as const).map(([labelKey, value]) => (
                          <View key={labelKey} style={styles.filePreviewField}>
                            <Text style={[styles.fileFieldLabel, { color: pal.sub }]}>{t(labelKey)}</Text>
                            <PostHogMaskView>
                              <Text
                                style={[styles.fileFieldValue, { color: pal.text }]}
                                numberOfLines={4}
                                ellipsizeMode="tail"
                                accessibilityLabel={`${t(labelKey)}: ${value}`}
                              >
                                {value}
                              </Text>
                            </PostHogMaskView>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={[styles.previewFooter, { borderTopColor: pal.border, backgroundColor: pal.bg }]}>
                <View style={[styles.footerButtons, I18nManager.isRTL && styles.rowReverse]}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, { backgroundColor: pal.chip }]}
                    onPress={clearFileAndReturnToInput}
                    accessibilityRole="button"
                    accessibilityLabel={t('ob_back')}
                  >
                    <Text style={[styles.buttonText, { color: pal.text }]}>{t('ob_back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      { backgroundColor: themeColor },
                      !mappingCanContinue && styles.disabled,
                    ]}
                    onPress={continueMappedFile}
                    disabled={!mappingCanContinue}
                    accessibilityRole="button"
                    accessibilityLabel={t('import_map_continue')}
                    accessibilityHint={t('import_map_continue_hint')}
                    accessibilityState={{ disabled: !mappingCanContinue }}
                  >
                    <Text style={styles.primaryButtonText}>{t('import_map_continue')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : step === 'file-preview' && filePlan !== null ? (
            <View style={styles.flex}>
              <View style={[styles.previewSummary, { borderBottomColor: pal.border }]}>
                <View style={[styles.previewHeaderRow, I18nManager.isRTL && styles.rowReverse]}>
                  <Text
                    style={[styles.previewHeading, { color: pal.text }]}
                    accessibilityRole="header"
                    accessibilityHint={t('import_map_preview_hint')}
                  >
                    {t('bulk_import_preview')}
                  </Text>
                  <View style={styles.previewFileNameWrap}>
                    <PostHogMaskView>
                      <Text
                        style={[
                          styles.previewFileName,
                          I18nManager.isRTL && styles.rtlPreviewFileName,
                          { color: pal.sub },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        accessibilityLabel={t('import_file_summary').replace('{file}', fileName)}
                      >
                        {t('import_file_summary').replace('{file}', fileName)}
                      </Text>
                    </PostHogMaskView>
                  </View>
                </View>
                <Text
                  style={[styles.previewCounts, { color: pal.sub }]}
                  accessibilityLabel={filePreviewCountsText}
                >
                  {filePreviewCountsText}
                </Text>
              </View>

              <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.previewList}
                showsVerticalScrollIndicator={false}
                accessibilityLabel={t('import_map_preview')}
              >
                {filePlan.validItems.slice(0, IMPORT_PREVIEW_LIMIT).map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.previewItem,
                      I18nManager.isRTL && styles.rowReverse,
                      { backgroundColor: pal.card, borderColor: pal.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.itemNumber,
                        I18nManager.isRTL && styles.rtlItemNumber,
                        { color: pal.sub },
                      ]}
                    >
                      {index + 1}
                    </Text>
                    <View style={styles.itemBody}>
                      {([
                        ['word_label', item.word],
                        ['meaning_label', item.meaning],
                        ['note_label', item.note],
                      ] as const).map(([labelKey, value]) => (
                        <View key={labelKey} style={styles.filePreviewField}>
                          <Text style={[styles.fileFieldLabel, { color: pal.sub }]}>{t(labelKey)}</Text>
                        <PostHogMaskView>
                          <Text
                            style={[styles.fileFieldValue, { color: pal.text }]}
                            numberOfLines={4}
                            ellipsizeMode="tail"
                            accessibilityLabel={`${t(labelKey)}: ${value}`}
                          >
                            {value}
                          </Text>
                        </PostHogMaskView>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
                {filePlan.validCount > IMPORT_PREVIEW_LIMIT && (
                  <Text
                    style={[styles.previewTruncationNotice, { color: pal.sub }]}
                    accessibilityLabel={filePreviewTruncationText}
                  >
                    {filePreviewTruncationText}
                  </Text>
                )}
              </ScrollView>

              <View style={[styles.previewFooter, { borderTopColor: pal.border, backgroundColor: pal.bg }]}>
                {importError && (
                  <Text style={styles.errorText}>{t('bulk_import_failed_generic')}</Text>
                )}
                <View style={[styles.footerButtons, I18nManager.isRTL && styles.rowReverse]}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, { backgroundColor: pal.chip }]}
                    onPress={backFromFilePreview}
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
                      (importing || filePlan.validCount === 0) && styles.disabled,
                    ]}
                    onPress={() => { void runFileImport(); }}
                    disabled={importing || filePlan.validCount === 0}
                    accessibilityRole="button"
                    accessibilityLabel={importCountText(filePlan.validCount)}
                    accessibilityHint={t('import_map_confirm_hint')}
                    accessibilityState={{ disabled: importing || filePlan.validCount === 0, busy: importing }}
                  >
                    {importing && <ActivityIndicator size="small" color="#fff" />}
                    <Text style={styles.primaryButtonText}>{importCountText(filePlan.validCount)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : step === 'input' ? (
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

              {/* Import from a file. Sits above the text box because it is an
                  alternative to typing, not an action performed on what was
                  typed — choosing a file leaves the box untouched. */}
              <TouchableOpacity
                style={[styles.fileButton, { borderColor: pal.border, backgroundColor: pal.card }]}
                onPress={() => { void pickFile(); }}
                disabled={picking}
                accessibilityRole="button"
                accessibilityLabel={t('import_from_file')}
                accessibilityState={{ disabled: picking, busy: picking }}
              >
                {picking
                  ? <ActivityIndicator size="small" color={themeColor} />
                  : <Ionicons name="document-attach-outline" size={17} color={themeColor} />}
                <Text style={[styles.fileButtonText, { color: pal.text }]}>
                  {t('import_from_file')}
                </Text>
              </TouchableOpacity>
              {fileErrorKey !== null && (
                <Text
                  style={styles.errorText}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                >
                  {t(fileErrorKey)}
                </Text>
              )}

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
              {/* Everything typed or pasted here becomes the user's cards. */}
              <PostHogMaskView {...inputScrollPan.panHandlers}>
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
              </PostHogMaskView>
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
                  {formatCount(t('bulk_import_valid_count'), renderedPreviewAnalysis.validItems.length)}
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
                {renderedPreviewAnalysis.items.map((item, index) => (
                  <View
                    key={item.id}
                    style={[styles.previewItem, { backgroundColor: pal.card, borderColor: pal.border }]}
                  >
                    <Text style={[styles.itemNumber, { color: pal.sub }]}>{index + 1}</Text>
                    <View style={styles.itemBody}>
                      {/* The draft rows are the user's words, still editable.
                          The wrapper carries the mask; the input keeps its own
                          accessibilityLabel. */}
                      <PostHogMaskView>
                        <TextInput
                          value={item.text}
                          onChangeText={text => updateDraft(item.id, text)}
                          multiline
                          scrollEnabled={false}
                          textAlignVertical="top"
                          accessibilityLabel={`${t('bulk_import_input_label')} ${index + 1}`}
                          style={[styles.itemInput, { color: pal.text }]}
                        />
                      </PostHogMaskView>
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
                      {formatCount(t('bulk_import_importing'), renderedPreviewAnalysis.validItems.length)}
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
  rowReverse: { flexDirection: 'row-reverse' },
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
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  previewHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  previewHeading: { fontSize: 18, lineHeight: 24, fontWeight: '700', flexShrink: 0 },
  previewFileNameWrap: { flex: 1, minWidth: 0 },
  previewFileName: { fontSize: 12, lineHeight: 17, textAlign: 'right' },
  rtlPreviewFileName: { textAlign: 'left' },
  previewCounts: { fontSize: 13, lineHeight: 18 },
  previewList: { padding: 14, paddingBottom: 28, gap: 9 },
  previewTruncationNotice: { fontSize: 12, lineHeight: 18, marginTop: 3 },
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
  rtlItemNumber: { marginRight: 0, marginLeft: 12 },
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
  // ── File import ─────────────────────────────────────────────────────────────
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  fileButtonText: { fontSize: 15, fontWeight: '600' },
  fileName: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  rejectionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  rejectionBody: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 8 },
  rejectionButton: { flex: 0, width: '100%', marginTop: 24 },
  mappingContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  mappingTitle: { fontSize: 21, lineHeight: 27, fontWeight: '700', marginBottom: 5 },
  mappingColumns: { gap: 10, marginTop: 16 },
  mappingColumn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 11,
  },
  mappingColumnName: { fontSize: 14, lineHeight: 19, fontWeight: '700', marginBottom: 9 },
  mappingChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  mappingChoice: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  mappingChoiceText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  mappingPreviewTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', marginTop: 24 },
  mappingPreviewList: { gap: 9, marginTop: 10 },
  mappingPreviewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
    overflow: 'hidden',
  },
  filePreviewField: { minWidth: 0, gap: 2, marginBottom: 6 },
  fileFieldLabel: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
  fileFieldValue: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  // Read-only rows: a file's contents are corrected in the file, not here, and
  // an editable field would suggest otherwise.
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
