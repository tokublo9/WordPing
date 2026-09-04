export interface FolderNotifSettings {
  intervalSeconds: number;  // 0 = off
  displayOnlyWord: boolean;
  /**
   * "Notify All Words" — ignore the candidate list for this folder.
   *
   * Off by default and absent on every folder that has not turned it on, so
   * notifications draw from the words the user picked and nothing else. On, the
   * whole folder is eligible. Per folder, like the interval and the content
   * preference beside it.
   */
  notifyAllWords?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  icon?: string;
  color?: string;
  notifSettings?: FolderNotifSettings;
}

export type TestLevel = 'perfect' | 'good' | 'slightly' | 'unknown';

export interface ReviewEntry {
  ts: number;        // Unix ms timestamp of the review submission
  rating: TestLevel; // stable rating ID — resolved to a label via i18n at display time
}

export interface WordCard {
  id: string;
  createdAt?: number;     // stable original registration time; legacy cards may omit it
  word: string;
  meaning: string;
  note: string;
  /**
   * The user put this word on its folder's notification list.
   *
   * Opt-in, and the only per-word notification state there is: it replaced the
   * old `notifOff` mute, which said the opposite and would otherwise have been
   * a second, silent veto over a word the user had just added. Absent means not
   * a candidate, so a newly registered word notifies nothing until it is added.
   * Set from the Add/Edit sheet, Flip Mode and the selection bar; read only by
   * the scheduler.
   */
  notifCandidate?: boolean;
  folderId?: string;
  testMastered?: boolean;
  testNextReview?: number; // Unix ms; if set and > appNow(), skip in test queue
  /**
   * Unix ms UTC. While in the future the card is hidden from ordinary learning
   * views, but a matching result filter can reveal it. The card is never
   * deleted and remains in backups.
   */
  hiddenUntil?: number;
  testLevel?: TestLevel;
  reviewHistory?: ReviewEntry[];
  wordLang?: string;    // BCP-47 locale for free device TTS (e.g. 'en-US', 'ja-JP')
  meaningLang?: string; // BCP-47 locale for free device TTS
  /**
   * Hide the word text on this card's study faces.
   *
   * Per-word, and off unless the user turns it on. Pairs with Custom Voice:
   * with a recording attached and the text hidden, the card becomes a listening
   * exercise — hear it, recall it, flip. Only the text is hidden; the voice
   * button and every other control stay exactly where they were.
   */
  hideWord?: boolean;
  audioUri?: string;    // local file URI of user-attached audio (available on every plan)
  audioSpeed?: number;  // playback rate, e.g. 0.5 / 0.75 / 1.0 / 1.25 / 1.5 / 2.0 (default 1.0)
  audioVolume?: number; // playback volume 0.0–1.0 (default 1.0)
}

export interface IntervalOption {
  label: string;
  seconds: number;
}

export interface ThemeColor {
  name: string;
  value: string;
}

export type Appearance = 'light' | 'dark' | 'system';

export interface ThemeSkin {
  id: string;
  name: string;
  emoji: string;
  darkStatusBar: boolean; // true → white status-bar text
  themeColor: string;
  palette: Palette;
  patternType?: 'flower' | 'paw' | 'space';
  wallpaperImage?: number;          // Metro require() result
  wallpaperBlur?: number;           // BlurView intensity
  wallpaperOverlayColor?: string;   // tint layer on top of blur
}

export interface OnboardingChoices {
  purpose: 'language' | 'words';
  gender: 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';
  dateOfBirth: string;   // ISO date: YYYY-MM-DD
  discoverySource: 'app_store' | 'social_media' | 'friend_family' | 'web_search' | 'advertisement' | 'other';
  learningLang?: string;  // BCP-47; only when purpose === 'language'
  nativeLang: string;     // BCP-47
  wordCategory?: string;  // only when purpose === 'words'
}

export interface Palette {
  bg: string;
  card: string;
  text: string;
  sub: string;
  border: string;
  input: string;
  chip: string;
  dialog: string;
}
