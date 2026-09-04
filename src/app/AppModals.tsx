import type { Dispatch, SetStateAction } from 'react';
import type { Appearance, Folder, OnboardingChoices, Palette, ReviewEntry, WordCard } from '../types';
import { WordModal } from '../components/WordModal';
import { NotificationModal } from '../components/NotificationModal';
import { SettingsModal } from '../components/SettingsModal';
import { PaywallModal } from '../components/PaywallModal';
import { ProSheet } from '../components/ProSheet';
import { FolderCustomizeModal } from '../components/FolderCustomizeModal';
import { FolderPickerSheet } from '../components/FolderPickerSheet';
import { OnboardingModal } from '../components/OnboardingModal';
import { TextToSpeechScreen } from '../components/TextToSpeechScreen';
import type { AIVoice } from '../lib/aiVoices';
import { BulkImportModal } from '../components/BulkImportModal';
import type { BulkImportDraft, BulkImportResult } from '../features/cards/bulkImport';
import type { FeatureDiscovery } from '../hooks/useFeatureDiscovery';
import { TEXT_TO_SPEECH_ENABLED } from '../features/flags';

// ── Prop types ────────────────────────────────────────────────────────────────

export interface AppModalsProps {
  // Shared
  pal: Palette;
  themeColor: string;        // activeThemeColor
  rawThemeColor: string;     // themeColor — used by PaywallModal
  isSubscribed: boolean;
  isPremium: boolean;
  /** ISO-8601 expiry of the active entitlement; drives ProSheet's downgrade note. */
  subscriptionExpirationDate: string | null;
  /** False until RevenueCat has answered; paid features stay locked until then. */
  isSubscriptionLoaded: boolean;
  subscribe(): Promise<void>;
  subscribePremium(): Promise<void>;
  restore(): Promise<void>;
  onManageSubscription?: () => void;   // __DEV__ only; pre-computed in App.tsx

  // WordModal
  wordModal: {
    visible: boolean;
    onClose(): void;
    onBulkImport(): void;
    editingCard: WordCard | null;
    word: string;
    onChangeWord: Dispatch<SetStateAction<string>>;
    meaning: string;
    onChangeMeaning: Dispatch<SetStateAction<string>>;
    note: string;
    onChangeNote: Dispatch<SetStateAction<string>>;
    onSave(): void;
    wordLang: string | undefined;
    onChangeWordLang: Dispatch<SetStateAction<string | undefined>>;
    meaningLang: string | undefined;
    onChangeMeaningLang: Dispatch<SetStateAction<string | undefined>>;
    hideWord: boolean;
    onChangeHideWord: (value: boolean) => void;
    /** Live, not read off `editingCard`: the toggle below writes through immediately. */
    notifCandidate: boolean;
    onToggleNotifCandidate(): void;
    onMove(): void;
    audioUri: string | undefined;
    onChangeAudioUri: Dispatch<SetStateAction<string | undefined>>;
    audioSpeed: number;
    onChangeAudioSpeed: Dispatch<SetStateAction<number>>;
    audioVolume: number;
    onChangeAudioVolume: Dispatch<SetStateAction<number>>;
    hideAiTools: boolean;
    reviewHistory: ReviewEntry[];
    testClearPending: boolean;
    onResetAll(): void;
  };

  bulkImport: {
    visible: boolean;
    onClose(): void;
    existingTexts: readonly string[];
    /** Every card and folder: a CSV/JSON row can name a folder of its own. */
    existingCards: readonly WordCard[];
    folders: readonly Folder[];
    destinationFolderId: string | null;
    onImport(drafts: readonly BulkImportDraft[]): Promise<BulkImportResult> | BulkImportResult;
  };

  // NotificationModal
  notifModal: {
    visible: boolean;
    onClose(): void;
    intervalSeconds: number;
    onPickInterval(s: number): void;
    displayOnlyWord: boolean;
    onToggleDisplayOnlyWord(v: boolean): void;
    notifyAllWords: boolean;
    onToggleNotifyAllWords(v: boolean): void;
    noNotifiableWords: boolean;
    onTest(): void;
  };

  // Standalone Text-to-Speech prototype
  textToSpeech: {
    visible: boolean;
    onClose(): void;
    voice: AIVoice;
    isPremium: boolean;
    onUpgrade(): void;
    onHistoryAvailabilityChange(hasHistory: boolean): void;
  };

  // SettingsModal
  settingsModal: {
    visible: boolean;
    onClose(): void;
    appearance: Appearance;
    onPickAppearance(mode: Appearance): void;
    skinId: string | null;
    onPickSkin: Dispatch<SetStateAction<string | null>>;
    onUpgrade(): void;
    language: string;
    onPickLanguage(code: string): void;
    aiVoice: AIVoice;
    onPickAIVoice(voice: AIVoice): void;
    cardViewMode: 'list' | 'flip';
    onChangeCardViewMode(mode: 'list' | 'flip'): void;
    showFullCard: boolean;
    onToggleShowFullCard: Dispatch<SetStateAction<boolean>>;
    verticalFlip: boolean;
    onToggleVerticalFlip: Dispatch<SetStateAction<boolean>>;
    hideAiTools: boolean;
    onToggleHideAiTools: Dispatch<SetStateAction<boolean>>;
    /** From the one entitlement rule; false while RevenueCat is still answering. */
    canUseAI: boolean;
    /** Per-feature "!" markers for a newly unlocked plan. */
    discovery: FeatureDiscovery;
    onDataReplaced(): void;
  };

  // PaywallModal
  paywallModal: {
    visible: boolean;
    onClose(): void;
  };

  // ProSheet
  proSheet: {
    visible: boolean;
    onClose(): void;
    learningLang: string | undefined;
    nativeLang: string;
    skinId?: string | null;
    onPickSkin?: (id: string | null) => void;
  };

  // FolderCustomizeModal — add new folder
  folderAdd: {
    visible: boolean;
    onClose(): void;
    onCreate(name: string, icon: string): void;
  };

  // FolderCustomizeModal — edit existing folder
  folderEdit: {
    folder: Folder | null;
    onClose(): void;
    onSave(name: string, icon: string): void;
  };

  // Test Mode is not here: it is a card-area mode of the word-list screen, not a
  // sheet, so App.tsx renders it into WordListScreen's `testMode` prop.

  // FolderPickerSheet (move cards)
  movePicker: {
    visible: boolean;
    onClose(): void;
    folders: Folder[];
    currentFolderId: string | null;
    onSelect(folderId: string): void;
  };

  // OnboardingModal
  onboarding: {
    visible: boolean;
    onComplete(choices: OnboardingChoices): Promise<void>;
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AppModals({
  pal, themeColor, rawThemeColor, isSubscribed, isPremium,
  subscriptionExpirationDate,
  isSubscriptionLoaded,
  subscribe, subscribePremium, restore, onManageSubscription,
  wordModal, bulkImport, notifModal, textToSpeech, settingsModal, paywallModal,
  proSheet, folderAdd, folderEdit, movePicker, onboarding,
}: AppModalsProps) {
  return (
    <>
      <WordModal
        visible={wordModal.visible}
        onClose={wordModal.onClose}
        onBulkImport={wordModal.onBulkImport}
        editingCard={wordModal.editingCard}
        word={wordModal.word}
        onChangeWord={wordModal.onChangeWord}
        meaning={wordModal.meaning}
        onChangeMeaning={wordModal.onChangeMeaning}
        note={wordModal.note}
        onChangeNote={wordModal.onChangeNote}
        onSave={wordModal.onSave}
        pal={pal}
        themeColor={themeColor}
        isSubscribed={isSubscribed}
        isPremium={isPremium}
        wordLang={wordModal.wordLang}
        onChangeWordLang={wordModal.onChangeWordLang}
        meaningLang={wordModal.meaningLang}
        onChangeMeaningLang={wordModal.onChangeMeaningLang}
        hideWord={wordModal.hideWord}
        onChangeHideWord={wordModal.onChangeHideWord}
        notifCandidate={wordModal.notifCandidate}
        onToggleNotifCandidate={wordModal.onToggleNotifCandidate}
        onMove={wordModal.onMove}
        audioUri={wordModal.audioUri}
        onChangeAudioUri={wordModal.onChangeAudioUri}
        audioSpeed={wordModal.audioSpeed}
        onChangeAudioSpeed={wordModal.onChangeAudioSpeed}
        audioVolume={wordModal.audioVolume}
        onChangeAudioVolume={wordModal.onChangeAudioVolume}
        hideAiTools={wordModal.hideAiTools}
        discovery={settingsModal.discovery}
        reviewHistory={wordModal.reviewHistory}
        testClearPending={wordModal.testClearPending}
        onResetAll={wordModal.onResetAll}
      />

      <BulkImportModal
        visible={bulkImport.visible}
        onClose={bulkImport.onClose}
        pal={pal}
        themeColor={themeColor}
        existingTexts={bulkImport.existingTexts}
        existingCards={bulkImport.existingCards}
        folders={bulkImport.folders}
        destinationFolderId={bulkImport.destinationFolderId}
        onImport={bulkImport.onImport}
      />

      <NotificationModal
        visible={notifModal.visible}
        onClose={notifModal.onClose}
        intervalSeconds={notifModal.intervalSeconds}
        onPickInterval={notifModal.onPickInterval}
        displayOnlyWord={notifModal.displayOnlyWord}
        onToggleDisplayOnlyWord={notifModal.onToggleDisplayOnlyWord}
        notifyAllWords={notifModal.notifyAllWords}
        onToggleNotifyAllWords={notifModal.onToggleNotifyAllWords}
        noNotifiableWords={notifModal.noNotifiableWords}
        pal={pal}
        themeColor={themeColor}
        onTest={notifModal.onTest}
      />

      {TEXT_TO_SPEECH_ENABLED && (
        <TextToSpeechScreen
          visible={textToSpeech.visible}
          onClose={textToSpeech.onClose}
          pal={pal}
          themeColor={themeColor}
          voice={textToSpeech.voice}
          isPremium={textToSpeech.isPremium}
          onUpgrade={textToSpeech.onUpgrade}
          onHistoryAvailabilityChange={textToSpeech.onHistoryAvailabilityChange}
        />
      )}

      <SettingsModal
        visible={settingsModal.visible}
        onClose={settingsModal.onClose}
        themeColor={themeColor}
        appearance={settingsModal.appearance}
        onPickAppearance={settingsModal.onPickAppearance}
        skinId={settingsModal.skinId}
        onPickSkin={settingsModal.onPickSkin}
        isSubscribed={isSubscribed}
        isPremium={isPremium}
        isSubscriptionLoaded={isSubscriptionLoaded}
        onUpgrade={settingsModal.onUpgrade}
        onSubscribe={subscribe}
        onSubscribePremium={subscribePremium}
        onRestore={restore}
        onManageSubscription={onManageSubscription}
        pal={pal}
        language={settingsModal.language}
        onPickLanguage={settingsModal.onPickLanguage}
        aiVoice={settingsModal.aiVoice}
        onPickAIVoice={settingsModal.onPickAIVoice}
        cardViewMode={settingsModal.cardViewMode}
        onChangeCardViewMode={settingsModal.onChangeCardViewMode}
        showFullCard={settingsModal.showFullCard}
        onToggleShowFullCard={settingsModal.onToggleShowFullCard}
        verticalFlip={settingsModal.verticalFlip}
        onToggleVerticalFlip={settingsModal.onToggleVerticalFlip}
        hideAiTools={settingsModal.hideAiTools}
        onToggleHideAiTools={settingsModal.onToggleHideAiTools}
        canUseAI={settingsModal.canUseAI}
        discovery={settingsModal.discovery}
        onDataReplaced={settingsModal.onDataReplaced}
      />

      <PaywallModal
        visible={paywallModal.visible}
        onClose={paywallModal.onClose}
        onSubscribe={subscribe}
        pal={pal}
        themeColor={rawThemeColor}
      />

      <ProSheet
        visible={proSheet.visible}
        onClose={proSheet.onClose}
        onSubscribe={subscribe}
        onSubscribePremium={subscribePremium}
        onManageSubscription={onManageSubscription}
        language={settingsModal.language}
        themeColor={themeColor}
        pal={pal}
        isSubscribed={isSubscribed}
        isPremium={isPremium}
        expirationDate={subscriptionExpirationDate}
        learningLang={proSheet.learningLang}
        nativeLang={proSheet.nativeLang}
        skinId={proSheet.skinId}
        onPickSkin={proSheet.onPickSkin}
      />

      <FolderCustomizeModal
        visible={folderAdd.visible}
        mode="edit"
        isNew
        currentValue="folder-outline"
        folderName=""
        onSelect={() => {}}
        onSaveEdit={folderAdd.onCreate}
        onClose={folderAdd.onClose}
        pal={pal}
        themeColor={themeColor}
        isSubscribed={isSubscribed}
      />

      <FolderCustomizeModal
        visible={folderEdit.folder !== null}
        mode="edit"
        currentValue={folderEdit.folder?.icon ?? 'folder-outline'}
        folderName={folderEdit.folder?.name ?? ''}
        onSelect={() => {}}
        onSaveEdit={(name, icon) => {
          if (!folderEdit.folder) return;
          folderEdit.onSave(name, icon);
        }}
        onClose={folderEdit.onClose}
        pal={pal}
        themeColor={themeColor}
        isSubscribed={isSubscribed}
      />

      <FolderPickerSheet
        visible={movePicker.visible}
        onClose={movePicker.onClose}
        folders={movePicker.folders}
        currentFolderId={movePicker.currentFolderId}
        pal={pal}
        themeColor={themeColor}
        onSelect={movePicker.onSelect}
        isSubscribed={isSubscribed}
      />

      <OnboardingModal
        visible={onboarding.visible}
        pal={pal}
        themeColor={themeColor}
        onComplete={onboarding.onComplete}
      />
    </>
  );
}
