import type { Dispatch, SetStateAction } from 'react';
import type { Appearance, Folder, OnboardingChoices, Palette, ReviewEntry, WordCard } from '../types';
import { WordModal } from '../components/WordModal';
import { NotificationModal } from '../components/NotificationModal';
import { SettingsModal } from '../components/SettingsModal';
import { PaywallModal } from '../components/PaywallModal';
import { ProSheet } from '../components/ProSheet';
import { FolderCustomizeModal } from '../components/FolderCustomizeModal';
import { TestModeScreen } from '../components/TestModeScreen';
import { FolderPickerSheet } from '../components/FolderPickerSheet';
import { OnboardingModal } from '../components/OnboardingModal';

// ── Prop types ────────────────────────────────────────────────────────────────

export interface AppModalsProps {
  // Shared
  pal: Palette;
  themeColor: string;        // activeThemeColor
  rawThemeColor: string;     // themeColor — used by PaywallModal
  isSubscribed: boolean;
  subscribe(): Promise<void>;
  restore(): Promise<void>;
  onManageSubscription?: () => void;   // __DEV__ only; pre-computed in App.tsx

  // WordModal
  wordModal: {
    visible: boolean;
    onClose(): void;
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

  // NotificationModal
  notifModal: {
    visible: boolean;
    onClose(): void;
    intervalSeconds: number;
    onPickInterval(s: number): void;
    displayOnlyWord: boolean;
    onToggleDisplayOnlyWord(v: boolean): void;
    onTest(): void;
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
    showFullCard: boolean;
    onToggleShowFullCard: Dispatch<SetStateAction<boolean>>;
    verticalFlip: boolean;
    onToggleVerticalFlip: Dispatch<SetStateAction<boolean>>;
    hideAiTools: boolean;
    onToggleHideAiTools: Dispatch<SetStateAction<boolean>>;
  };

  // PaywallModal
  paywallModal: {
    visible: boolean;
    reason: 'words' | 'voice';
    onClose(): void;
  };

  // ProSheet
  proSheet: {
    visible: boolean;
    onClose(): void;
    learningLang: string | undefined;
    nativeLang: string;
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

  // TestModeScreen
  testMode: {
    visible: boolean;
    cards: WordCard[];
    onUpdateCard(id: string, patch: Partial<WordCard>): void;
    onClose(): void;
  };

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
  pal, themeColor, rawThemeColor, isSubscribed,
  subscribe, restore, onManageSubscription,
  wordModal, notifModal, settingsModal, paywallModal,
  proSheet, folderAdd, folderEdit, testMode, movePicker, onboarding,
}: AppModalsProps) {
  return (
    <>
      <WordModal
        visible={wordModal.visible}
        onClose={wordModal.onClose}
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
        wordLang={wordModal.wordLang}
        onChangeWordLang={wordModal.onChangeWordLang}
        meaningLang={wordModal.meaningLang}
        onChangeMeaningLang={wordModal.onChangeMeaningLang}
        audioUri={wordModal.audioUri}
        onChangeAudioUri={wordModal.onChangeAudioUri}
        audioSpeed={wordModal.audioSpeed}
        onChangeAudioSpeed={wordModal.onChangeAudioSpeed}
        audioVolume={wordModal.audioVolume}
        onChangeAudioVolume={wordModal.onChangeAudioVolume}
        hideAiTools={wordModal.hideAiTools}
        reviewHistory={wordModal.reviewHistory}
        testClearPending={wordModal.testClearPending}
        onResetAll={wordModal.onResetAll}
      />

      <NotificationModal
        visible={notifModal.visible}
        onClose={notifModal.onClose}
        intervalSeconds={notifModal.intervalSeconds}
        onPickInterval={notifModal.onPickInterval}
        displayOnlyWord={notifModal.displayOnlyWord}
        onToggleDisplayOnlyWord={notifModal.onToggleDisplayOnlyWord}
        pal={pal}
        themeColor={themeColor}
        onTest={notifModal.onTest}
      />

      <SettingsModal
        visible={settingsModal.visible}
        onClose={settingsModal.onClose}
        themeColor={themeColor}
        appearance={settingsModal.appearance}
        onPickAppearance={settingsModal.onPickAppearance}
        skinId={settingsModal.skinId}
        onPickSkin={settingsModal.onPickSkin}
        isSubscribed={isSubscribed}
        onUpgrade={settingsModal.onUpgrade}
        onSubscribe={subscribe}
        onRestore={restore}
        onManageSubscription={onManageSubscription}
        pal={pal}
        language={settingsModal.language}
        onPickLanguage={settingsModal.onPickLanguage}
        showFullCard={settingsModal.showFullCard}
        onToggleShowFullCard={settingsModal.onToggleShowFullCard}
        verticalFlip={settingsModal.verticalFlip}
        onToggleVerticalFlip={settingsModal.onToggleVerticalFlip}
        hideAiTools={settingsModal.hideAiTools}
        onToggleHideAiTools={settingsModal.onToggleHideAiTools}
      />

      <PaywallModal
        visible={paywallModal.visible}
        reason={paywallModal.reason}
        onClose={paywallModal.onClose}
        onSubscribe={subscribe}
        onRestore={restore}
        pal={pal}
        themeColor={rawThemeColor}
      />

      <ProSheet
        visible={proSheet.visible}
        onClose={proSheet.onClose}
        onSubscribe={subscribe}
        onRestore={restore}
        onManageSubscription={onManageSubscription}
        themeColor={themeColor}
        pal={pal}
        isSubscribed={isSubscribed}
        learningLang={proSheet.learningLang}
        nativeLang={proSheet.nativeLang}
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

      {testMode.visible && (
        <TestModeScreen
          cards={testMode.cards}
          onUpdateCard={testMode.onUpdateCard}
          onClose={testMode.onClose}
          pal={pal}
          themeColor={themeColor}
          isSubscribed={isSubscribed}
        />
      )}

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
