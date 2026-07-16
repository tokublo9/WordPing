import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bootstrapData, persist, readFolders, persistFolders, DEFAULT_FOLDER_ID, WELCOME_FOLDER_ID } from './src/lib/db';
import { BCP47_TO_UI_LANG, LangContext, translate } from './src/i18n';

import type { Appearance, Folder, FolderNotifSettings, OnboardingChoices, WordCard } from './src/types';
import {
  DARK, DEFAULT_LANGUAGE,
  DEFAULT_THEME, FREE_SKIN_IDS, FREE_THEME_COLOR, FREE_VOICE_LIMIT, FREE_WORD_LIMIT, LIGHT, ONBOARDING_KEY, SKINS,
  SHOW_FULL_CARD_KEY, VERTICAL_FLIP_KEY,
} from './src/constants';
import { requestPermission, rescheduleAllNotifications, sendTestNotification } from './src/notifications';
import { appStyles as s } from './src/styles';
import { useSubscription } from './src/hooks/useSubscription';
import { SwipeableCard } from './src/components/SwipeableCard';
import { WordModal } from './src/components/WordModal';
import { NotificationModal } from './src/components/NotificationModal';
import { PaywallModal } from './src/components/PaywallModal';
import { ProSheet } from './src/components/ProSheet';
import { SettingsModal } from './src/components/SettingsModal';
import { ReorderableList } from './src/components/ReorderableList';
import { SwipeableFolder } from './src/components/SwipeableFolder';
import { FolderCustomizeModal } from './src/components/FolderCustomizeModal';
import { AdBannerPlaceholder, AdSquarePlaceholder, AD_BANNER_HEIGHT } from './src/components/AdBannerPlaceholder';
import { TestModeScreen } from './src/components/TestModeScreen';
import { FlipCardBrowser } from './src/components/FlipCardBrowser';
import { FolderPickerSheet } from './src/components/FolderPickerSheet';
import { OnboardingModal, FORCE_SHOW_ONBOARDING } from './src/components/OnboardingModal';
import { SkinPatternOverlay } from './src/components/SkinPatternOverlay';
import { SkinWallpaperOverlay } from './src/components/SkinWallpaperOverlay';
import { DeepSeaOverlay } from './src/components/DeepSeaOverlay';
import {
  AnimalOverlay,
  AuroraOverlay,
  BeautifulWoodsOverlay,
  CoffeeHouseOverlay,
  CyberNeonOverlay,
  GalaxyOverlay,
  GreenNatureOverlay,
  RainyWindowOverlay,
  RosesOverlay,
  SakuraOverlay,
  SnowMountainOverlay,
  SunsetOverlay,
} from './src/components/SkinOverlays';

const ALL_LEVEL_KEYS = ['perfect', 'good', 'slightly', 'unknown', 'none'] as const;

// Localized names for the Welcome folder, keyed by nativeLang BCP-47 code.
const WELCOME_FOLDER_NAMES: Record<string, string> = {
  'en-US': 'Welcome to WordMemo',
  'ja-JP': 'WordMemoへようこそ',
  'ko-KR': 'WordMemo에 오신 것을 환영합니다',
  'zh-CN': '欢迎使用WordMemo',
  'es-ES': 'Bienvenido a WordMemo',
  'fr-FR': 'Bienvenue dans WordMemo',
  'de-DE': 'Willkommen bei WordMemo',
  'it-IT': 'Benvenuto in WordMemo',
  'pt-BR': 'Bem-vindo ao WordMemo',
  'ru-RU': 'Добро пожаловать в WordMemo',
  'ar':    'أهلاً بك في WordMemo',
  'hi-IN': 'WordMemo में आपका स्वागत है',
  'tr-TR': "WordMemo'ya Hoş Geldiniz",
  'nl-NL': 'Welkom bij WordMemo',
  'vi-VN': 'Chào mừng đến với WordMemo',
  'th-TH': 'ยินดีต้อนรับสู่ WordMemo',
  'id-ID': 'Selamat Datang di WordMemo',
  'pl-PL': 'Witaj w WordMemo',
  'el-GR': 'Καλώς ήρθατε στο WordMemo',
  'sv-SE': 'Välkommen till WordMemo',
};

// Translations for the 4 tutorial cards in the Welcome folder.
// Keys match the BCP-47 codes used in OnboardingModal's language list.
const WELCOME_CARD_TEXTS: Record<string, [string, string, string, string]> = {
  'en-US': [
    'Tap the card to reveal its meaning.',
    'Switch between List Mode and Flip Mode using the top-right button.',
    'Tap the graduation cap icon to test yourself.',
    'Set up notifications to review your words automatically.',
  ],
  'ja-JP': [
    'カードをタップして意味を確認しましょう。',
    '右上の切り替えボタンから、リストモードと単語フリップモードを切り替えられます。',
    '右上の帽子アイコンから、登録した単語をテストできます。',
    '通知アイコンから通知を設定して、単語を自動で復習しましょう。',
  ],
  'ko-KR': [
    '카드를 탭하면 뜻이 나타납니다.',
    '오른쪽 상단 버튼으로 목록 모드와 카드 뒤집기 모드를 전환할 수 있습니다.',
    '오른쪽 상단의 졸업 모자 아이콘을 탭하여 단어를 테스트해 보세요.',
    '알림을 설정하면 단어를 자동으로 복습할 수 있습니다.',
  ],
  'zh-CN': [
    '点击卡片以查看其含义。',
    '使用右上角按钮在列表模式和卡片翻转模式之间切换。',
    '点击右上角的学士帽图标来测试自己。',
    '设置通知以自动复习单词。',
  ],
  'es-ES': [
    'Toca la tarjeta para ver su significado.',
    'Usa el botón de la parte superior derecha para cambiar entre el modo lista y el modo de tarjetas.',
    'Toca el icono del birrete para ponerte a prueba.',
    'Configura las notificaciones para repasar tus palabras automáticamente.',
  ],
  'fr-FR': [
    'Appuyez sur la carte pour révéler sa signification.',
    'Utilisez le bouton en haut à droite pour basculer entre le mode liste et le mode cartes.',
    'Appuyez sur l\'icône de chapeau de diplômé pour vous tester.',
    'Configurez les notifications pour réviser vos mots automatiquement.',
  ],
  'de-DE': [
    'Tippe auf die Karte, um ihre Bedeutung zu sehen.',
    'Nutze den Knopf oben rechts, um zwischen Listen- und Karteikartenmodus zu wechseln.',
    'Tippe auf das Doktorhut-Symbol, um dich selbst zu testen.',
    'Richte Benachrichtigungen ein, um deine Wörter automatisch zu wiederholen.',
  ],
  'it-IT': [
    'Tocca la carta per rivelare il suo significato.',
    'Usa il pulsante in alto a destra per passare dalla modalità elenco alla modalità flip.',
    'Tocca l\'icona del tocco accademico per metterti alla prova.',
    'Imposta le notifiche per ripassare le parole automaticamente.',
  ],
  'pt-BR': [
    'Toque no cartão para revelar seu significado.',
    'Use o botão no canto superior direito para alternar entre o modo lista e o modo de cartão.',
    'Toque no ícone do capelo para se testar.',
    'Configure as notificações para revisar suas palavras automaticamente.',
  ],
  'ru-RU': [
    'Нажмите на карточку, чтобы открыть её значение.',
    'Используйте кнопку в правом верхнем углу для переключения между режимом списка и режимом карточек.',
    'Нажмите на иконку академической шапочки, чтобы проверить себя.',
    'Настройте уведомления, чтобы автоматически повторять слова.',
  ],
  'ar': [
    'اضغط على البطاقة لعرض معناها.',
    'استخدم الزر في أعلى اليمين للتبديل بين وضع القائمة ووضع البطاقات.',
    'اضغط على أيقونة قبعة التخرج لاختبار نفسك.',
    'قم بإعداد الإشعارات لمراجعة كلماتك تلقائياً.',
  ],
  'hi-IN': [
    'अर्थ देखने के लिए कार्ड पर टैप करें।',
    'सूची मोड और कार्ड फ्लिप मोड के बीच स्विच करने के लिए ऊपर-दाएं बटन का उपयोग करें।',
    'खुद को परखने के लिए ग्रेजुएशन कैप आइकन पर टैप करें।',
    'अपने शब्दों को स्वचालित रूप से दोहराने के लिए सूचनाएं सेट करें।',
  ],
  'tr-TR': [
    'Anlamını görmek için kartın üzerine dokunun.',
    'Liste modu ile kart modu arasında geçiş yapmak için sağ üstteki düğmeyi kullanın.',
    'Kendinizi test etmek için sağ üstteki mezuniyet şapkası ikonuna dokunun.',
    'Kelimelerinizi otomatik olarak tekrar etmek için bildirimleri ayarlayın.',
  ],
  'nl-NL': [
    'Tik op de kaart om de betekenis te onthullen.',
    'Gebruik de knop rechtsboven om te wisselen tussen lijstmodus en kaartmodus.',
    'Tik op het afstudeerhoed-pictogram om jezelf te testen.',
    'Stel meldingen in om je woorden automatisch te herhalen.',
  ],
  'vi-VN': [
    'Nhấn vào thẻ để xem nghĩa của nó.',
    'Sử dụng nút ở góc trên bên phải để chuyển đổi giữa chế độ danh sách và chế độ lật thẻ.',
    'Nhấn vào biểu tượng mũ tốt nghiệp để kiểm tra bản thân.',
    'Thiết lập thông báo để tự động ôn lại các từ của bạn.',
  ],
  'th-TH': [
    'แตะที่การ์ดเพื่อดูความหมาย',
    'ใช้ปุ่มด้านบนขวาเพื่อสลับระหว่างโหมดรายการและโหมดพลิกการ์ด',
    'แตะไอคอนหมวกรับปริญญาเพื่อทดสอบตัวเอง',
    'ตั้งค่าการแจ้งเตือนเพื่อทบทวนคำศัพท์โดยอัตโนมัติ',
  ],
  'id-ID': [
    'Ketuk kartu untuk melihat artinya.',
    'Gunakan tombol di sudut kanan atas untuk beralih antara mode daftar dan mode balik kartu.',
    'Ketuk ikon topi wisuda untuk menguji dirimu.',
    'Atur notifikasi untuk mengulang kata-kata secara otomatis.',
  ],
  'pl-PL': [
    'Naciśnij kartę, aby zobaczyć jej znaczenie.',
    'Użyj przycisku w prawym górnym rogu, aby przełączyć się między trybem listy a trybem kart.',
    'Naciśnij ikonę biretu, aby się przetestować.',
    'Skonfiguruj powiadomienia, aby automatycznie powtarzać słowa.',
  ],
  'el-GR': [
    'Πατήστε στην κάρτα για να δείτε τη σημασία της.',
    'Χρησιμοποιήστε το κουμπί πάνω δεξιά για εναλλαγή μεταξύ λίστας και λειτουργίας αναστροφής κάρτας.',
    'Πατήστε το εικονίδιο καπέλου αποφοίτησης για να δοκιμάσετε τον εαυτό σας.',
    'Ρυθμίστε ειδοποιήσεις για αυτόματη επανάληψη των λέξεών σας.',
  ],
  'sv-SE': [
    'Tryck på kortet för att se dess betydelse.',
    'Använd knappen uppe till höger för att växla mellan listläge och kortläge.',
    'Tryck på ikonen för studentmössa för att testa dig själv.',
    'Ställ in aviseringar för att automatiskt repetera dina ord.',
  ],
};

const WELCOME_CARD_IDS: string[] = ['wp-w1', 'wp-w2', 'wp-w3', 'wp-w4'];

function buildWelcomeCards(choices: OnboardingChoices): WordCard[] {
  // Language Learning: front = learn lang, back = explanation lang.
  // Vocabulary & Terms: front = English, back = explanation lang.
  // 'other' falls back to English on either side.
  const wordLang = (choices.purpose === 'language' && choices.learningLang && choices.learningLang !== 'other')
    ? choices.learningLang
    : 'en-US';
  const meaningLang = (choices.nativeLang && choices.nativeLang !== 'other')
    ? choices.nativeLang
    : 'en-US';

  const wordTexts    = WELCOME_CARD_TEXTS[wordLang]    ?? WELCOME_CARD_TEXTS['en-US'];
  const meaningTexts = WELCOME_CARD_TEXTS[meaningLang] ?? WELCOME_CARD_TEXTS['en-US'];

  return WELCOME_CARD_IDS.map((id, i) => ({
    id,
    word:        wordTexts[i],
    meaning:     meaningTexts[i],
    note:        '',
    wordLang,
    meaningLang,
    folderId:    WELCOME_FOLDER_ID,
  }));
}



const LEVEL_FILTER_OPTIONS: Array<{ level: string; icon: string | null; color: string }> = [
  { level: 'perfect',  icon: '◎',               color: '#5EBF84' },
  { level: 'good',     icon: 'ellipse-outline',  color: '#6BA4F0' },
  { level: 'slightly', icon: 'triangle-outline', color: '#F2B445' },
  { level: 'unknown',  icon: 'close-outline',    color: '#ED7373' },
  { level: 'none',     icon: null,               color: '#AEB6C0' },
];

export default function App() {
  const systemScheme = useColorScheme();
  const { isSubscribed, isLoaded: isSubscriptionLoaded, subscribe, restore, unsubscribe } = useSubscription();

  const [cards, setCards] = useState<WordCard[]>([]);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [skinId, setSkinId] = useState<string | null>(null);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [showFullCard, setShowFullCard] = useState(false);
  const [verticalFlip, setVerticalFlip] = useState(false);
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(language, key), [language]);

  const [wordModalVisible, setWordModalVisible] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [testModeVisible, setTestModeVisible] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<'list' | 'flip'>('list');
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, right: 0 });
  const menuBtnRef = useRef<View>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderSortDir, setReorderSortDir] = useState<'asc' | 'desc' | null>(null);
  const originalFolderCards = useRef<WordCard[]>([]);
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set(ALL_LEVEL_KEYS));
  const [showLevelLabels, setShowLevelLabels] = useState(true);
  const [paywallReason, setPaywallReason] = useState<'words' | 'voice'>('words');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [proSheetVisible, setProSheetVisible] = useState(false);
  const [learnLang, setLearnLang]     = useState<string | null>(null);
  const [nativeLang, setNativeLang]   = useState('en-US');
  const [movePickerVisible, setMovePickerVisible] = useState(false);
  const [pendingMoveIds, setPendingMoveIds] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ── Folder navigation ────────────────────────────────────────────────────────
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderSelectionMode, setFolderSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [folderReorderMode, setFolderReorderMode] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const folderMenuBtnRef = useRef<View>(null);
  const closeOpenFolder = useRef<(() => void) | null>(null);
  const [menuContext, setMenuContext] = useState<'cards' | 'folders'>('cards');

  const currentFolder      = folders.find(f => f.id === currentFolderId) ?? null;
  const folderCards        = currentFolderId ? cards.filter(c => c.folderId === currentFolderId) : [];
  const folderNotifSettings: FolderNotifSettings = currentFolder?.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
  const notificationsEnabled = folderNotifSettings.intervalSeconds > 0;

  const isFilterActive        = levelFilter.size < ALL_LEVEL_KEYS.length;
  const filteredFolderCards   = isFilterActive
    ? folderCards.filter(c => levelFilter.has(c.testLevel ?? 'none'))
    : folderCards;

  const toggleLevelFilter = (level: string) => {
    setLevelFilter(prev => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });
  };

  const openPaywall = (reason: 'words' | 'voice') => {
    setPaywallReason(reason);
    setPaywallVisible(true);
  };

  const enterSelectionMode = () => {
    setSelectedIds(new Set());
    setSelectionMode(true);
    setReorderMode(false);
    setMenuVisible(false);
    setCardViewMode('list');
  };

  const enterReorderMode = () => {
    setReorderMode(true);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setMenuVisible(false);
    setCardViewMode('list');
    originalFolderCards.current = folderCards;
  };

  const exitReorderMode = () => {
    setReorderMode(false);
    setReorderSortDir(null);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const LEVEL_ORDER: Record<string, number> = { perfect: 0, good: 1, slightly: 2, unknown: 3 };

  const handleSortByLevel = () => {
    const nextDir = reorderSortDir === 'asc' ? 'desc' : 'asc';
    setReorderSortDir(nextDir);
    const sorted = [...folderCards].sort((a, b) => {
      const la = a.testLevel != null ? (LEVEL_ORDER[a.testLevel] ?? 4) : 4;
      const lb = b.testLevel != null ? (LEVEL_ORDER[b.testLevel] ?? 4) : 4;
      return nextDir === 'asc' ? la - lb : lb - la;
    });
    setCards(prev => [
      ...sorted,
      ...prev.filter(c => c.folderId !== currentFolderId),
    ]);
  };

  const handleResetOrder = () => {
    const orig = originalFolderCards.current;
    if (!orig.length) return;
    setCards(prev => [
      ...orig,
      ...prev.filter(c => c.folderId !== currentFolderId),
    ]);
    setReorderSortDir(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    setCards(prev => prev.filter(c => !selectedIds.has(c.id)));
    setFlipped(prev => {
      const next = new Set(prev);
      selectedIds.forEach(id => next.delete(id));
      return next;
    });
    exitSelectionMode();
  };

  const setNotifForSelected = (notifOff: boolean) => {
    setCards(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, notifOff } : c));
    exitSelectionMode();
  };

  const openMenu = () => {
    menuBtnRef.current?.measureInWindow((x, y, w, h) => {
      setMenuAnchor({ top: y + h + 4, right: Dimensions.get('window').width - x - w });
      setMenuContext('cards');
      setMenuVisible(true);
    });
  };

  const openFolderMenu = () => {
    folderMenuBtnRef.current?.measureInWindow((x, y, w, h) => {
      setMenuAnchor({ top: y + h + 4, right: Dimensions.get('window').width - x - w });
      setMenuContext('folders');
      setMenuVisible(true);
    });
  };

  const enterFolderSelectionMode = () => {
    setSelectedFolderIds(new Set());
    setFolderSelectionMode(true);
    setFolderReorderMode(false);
    setMenuVisible(false);
  };

  const exitFolderSelectionMode = () => {
    setFolderSelectionMode(false);
    setSelectedFolderIds(new Set());
  };

  const toggleFolderSelect = (id: string) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const deleteSelectedFolders = () => {
    setFolders(prev => prev.filter(f => !selectedFolderIds.has(f.id)));
    exitFolderSelectionMode();
  };

  const enterFolderReorderMode = () => {
    setFolderReorderMode(true);
    setFolderSelectionMode(false);
    setSelectedFolderIds(new Set());
    setMenuVisible(false);
  };

  const exitFolderReorderMode = () => setFolderReorderMode(false);

  const [editingCard, setEditingCard] = useState<WordCard | null>(null);
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [note, setNote] = useState('');
  const [wordFieldLang, setWordFieldLang] = useState<string | undefined>(undefined);
  const [meaningFieldLang, setMeaningFieldLang] = useState<string | undefined>(undefined);
  const [wordAudioUri, setWordAudioUri] = useState<string | undefined>(undefined);
  const [wordAudioSpeed, setWordAudioSpeed] = useState(1.0);
  const [wordAudioVolume, setWordAudioVolume] = useState(1.0);

  const closeOpenCard = useRef<(() => void) | null>(null);
  const [cardScrollEnabled, setCardScrollEnabled] = useState(true);
  const hasLoaded = useRef(false);
  // Tracks word-list scroll position for the Deep Sea skin gradient effect.
  const scrollY = useRef(new Animated.Value(0)).current;

  // Free users may activate solid_blue and solid_gray; all other skins require a subscription.
  const activeSkin = SKINS.find(s => s.id === skinId && (isSubscribed || FREE_SKIN_IDS.has(s.id))) ?? null;
  // Solid-color skins are simple color themes — the user's Appearance (Light/Dark/System) still
  // applies. Only premium image/wallpaper skins force their own fixed palette and dark-bar setting.
  const isSolidSkin = !!activeSkin?.id.startsWith('solid_');
  const isDark = (activeSkin && !isSolidSkin)
    ? activeSkin.darkStatusBar
    : appearance === 'system' ? systemScheme === 'dark' : appearance === 'dark';
  const pal = (activeSkin && !isSolidSkin) ? activeSkin.palette : isDark ? DARK : LIGHT;
  const activeThemeColor = activeSkin ? activeSkin.themeColor : themeColor;
  // ── Persist & load ──────────────────────────────────────────────────────────
  // Ref so the Supabase remote callback can access up-to-date folders
  const foldersRef = useRef<Folder[]>([]);

  useEffect(() => {
    const applySettings = (s: { themeColor: string; appearance: Appearance; skinId: string | null; language: string }) => {
      setThemeColor(s.themeColor);
      setAppearance(s.appearance);
      setSkinId(s.skinId ?? null);
      setLanguage(s.language ?? DEFAULT_LANGUAGE);
    };

    // Migration helper for existing users upgrading from pre-folder versions:
    // any card that still lacks a folderId is assigned to the first available folder.
    const migrate = (rawCards: WordCard[], existingFolders: Folder[]): { cards: WordCard[]; folders: Folder[] } => {
      if (!rawCards.some(c => !c.folderId)) return { cards: rawCards, folders: existingFolders };
      let finalFolders = existingFolders;
      if (finalFolders.length === 0) {
        finalFolders = [{ id: DEFAULT_FOLDER_ID, name: 'My Words', createdAt: Date.now() }];
        persistFolders(finalFolders);
      }
      const firstId = finalFolders[0].id;
      return { cards: rawCards.map(c => c.folderId ? c : { ...c, folderId: firstId }), folders: finalFolders };
    };

    // Sequential: bootstrapData writes the default folder before readFolders() runs,
    // so on first launch readFolders() returns the seeded "My Words" folder.
    (async () => {
      try {
        const local = await bootstrapData((remote) => {
          applySettings(remote.settings);
          const { cards: migratedCards } = migrate(remote.cards, foldersRef.current);
          setCards(migratedCards);
        });
        const storedFolders = await readFolders();

        const { cards: migratedCards, folders: migratedFolders } = migrate(local.cards, storedFolders);
        foldersRef.current = migratedFolders;
        setCards(migratedCards);
        setFolders(migratedFolders);
        applySettings(local.settings);
        const [rawShowFull, rawVertFlip] = await Promise.all([
          AsyncStorage.getItem(SHOW_FULL_CARD_KEY),
          AsyncStorage.getItem(VERTICAL_FLIP_KEY),
        ]);
        // Only enable from the exact stored string 'true'; any other value stays OFF.
        if (rawShowFull === 'true') setShowFullCard(true);
        if (rawVertFlip !== null) setVerticalFlip(rawVertFlip === 'true');
        setSettingsLoaded(true);
        const obRaw = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (obRaw !== null) {
          try {
            const ob: OnboardingChoices = JSON.parse(obRaw);
            if (ob.learningLang && ob.learningLang !== 'other') setLearnLang(ob.learningLang);
            if (ob.nativeLang && ob.nativeLang !== 'other') setNativeLang(ob.nativeLang);
          } catch {}
        }
        const showingOnboarding = obRaw === null || (__DEV__ && FORCE_SHOW_ONBOARDING);
        // Only navigate into the Welcome folder immediately when onboarding won't be shown.
        // If onboarding will cover the screen, currentFolderId is set in onComplete instead,
        // so the Welcome folder only becomes visible after the modal has fully closed.
        if (local.isFirstLaunch && !showingOnboarding) setCurrentFolderId(WELCOME_FOLDER_ID);
        if (showingOnboarding) setShowOnboarding(true);
        hasLoaded.current = true;
      } catch (e) {
        // Startup failed (e.g. corrupt AsyncStorage). Mark as loaded so the app
        // is usable rather than stuck on a blank screen.
        console.error('Startup error:', e);
        setSettingsLoaded(true);
        hasLoaded.current = true;
      }
    })();

    requestPermission().then(setNotificationGranted);
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    persist({ cards, settings: { themeColor, appearance, skinId, language } });
    if (notificationGranted) rescheduleAllNotifications(cards, folders);
  }, [cards, notificationGranted, themeColor, appearance, skinId, language, folders]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    foldersRef.current = folders;
    persistFolders(folders);
  }, [folders]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(SHOW_FULL_CARD_KEY, showFullCard ? 'true' : 'false');
  }, [showFullCard]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(VERTICAL_FLIP_KEY, verticalFlip ? 'true' : 'false');
  }, [verticalFlip]);

  // ── Notifications ───────────────────────────────────────────────────────────
  const updateFolderNotif = (patch: Partial<FolderNotifSettings>) => {
    if (!currentFolderId) return;
    setFolders(prev => prev.map(f => {
      if (f.id !== currentFolderId) return f;
      const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
      return { ...f, notifSettings: { ...cur, ...patch } };
    }));
  };

  const handlePickInterval = (seconds: number) => {
    if (seconds === 0) {
      updateFolderNotif({ intervalSeconds: 0 });
      return;
    }
    if (!notificationGranted) {
      requestPermission().then(granted => {
        setNotificationGranted(granted);
        if (!granted) return;
        updateFolderNotif({ intervalSeconds: seconds });
      });
      return;
    }
    const conflicting = folders.find(
      f => f.id !== currentFolderId && (f.notifSettings?.intervalSeconds ?? 0) > 0
    );
    if (!conflicting) {
      updateFolderNotif({ intervalSeconds: seconds });
      return;
    }
    const targetName   = currentFolder?.name ?? '';
    const conflictName = conflicting.name;
    const conflictId   = conflicting.id;
    Alert.alert(
      t('notifications'),
      `Notifications are already enabled for "${conflictName}". Enable for "${targetName}" instead?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: 'Enable',
          onPress: () => {
            setFolders(prev => prev.map(f => {
              if (f.id === currentFolderId) {
                const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
                return { ...f, notifSettings: { ...cur, intervalSeconds: seconds } };
              }
              if (f.id === conflictId) {
                const cur: FolderNotifSettings = f.notifSettings ?? { intervalSeconds: 0, displayOnlyWord: false };
                return { ...f, notifSettings: { ...cur, intervalSeconds: 0 } };
              }
              return f;
            }));
          },
        },
      ]
    );
  };

  // ── Theme ────────────────────────────────────────────────────────────────────

  // Enforce free-plan color constraint. Runs after both settings AND subscription
  // status have loaded (to avoid a race where isSubscribed is still the initial
  // false before AsyncStorage resolves). Also re-runs on every subsequent change
  // to isSubscribed or themeColor — covers the downgrade case at runtime.
  useEffect(() => {
    if (!settingsLoaded || !isSubscriptionLoaded) return;
    if (!isSubscribed) {
      // On downgrade: reset any premium skin back to blue.
      if (skinId && !FREE_SKIN_IDS.has(skinId)) {
        setSkinId('solid_blue');
      }
      // Legacy: if no skin is active and themeColor drifted to a paid color, reset it.
      if (!skinId && themeColor !== FREE_THEME_COLOR) {
        setThemeColor(FREE_THEME_COLOR);
      }
    }
  }, [isSubscribed, isSubscriptionLoaded, settingsLoaded, skinId, themeColor]);

  const pickTheme = (color: string) => setThemeColor(color);
  const pickAppearance = (mode: Appearance) => setAppearance(mode);
  const pickLanguage = (code: string) => setLanguage(code);

  // ── Cards ────────────────────────────────────────────────────────────────────
  const openAdd = () => {
    closeOpenCard.current?.();
    setEditingCard(null);
    setWord('');
    setMeaning('');
    setNote('');
    setWordFieldLang(undefined);
    setMeaningFieldLang(undefined);
    setWordAudioUri(undefined);
    setWordAudioSpeed(1.0);
    setWordAudioVolume(1.0);
    setWordModalVisible(true);
  };

  const openEdit = (card: WordCard) => {
    setEditingCard(card);
    setWord(card.word);
    setMeaning(card.meaning);
    setNote(card.note ?? '');
    setWordFieldLang(card.wordLang);
    setMeaningFieldLang(card.meaningLang);
    setWordAudioUri(card.audioUri);
    setWordAudioSpeed(card.audioSpeed ?? 1.0);
    setWordAudioVolume(card.audioVolume ?? 1.0);
    setWordModalVisible(true);
  };

  const saveCard = () => {
    if (!word.trim()) { Alert.alert(t('alert_enter_word')); return; }
    if (!editingCard && !isSubscribed && cards.length >= FREE_WORD_LIMIT) {
      setWordModalVisible(false);
      openPaywall('words');
      return;
    }
    if (editingCard) {
      setCards(prev => prev.map(c =>
        c.id === editingCard.id
          ? { ...c, word: word.trim(), meaning: meaning.trim(), note: note.trim(), wordLang: wordFieldLang, meaningLang: meaningFieldLang, audioUri: wordAudioUri, audioSpeed: wordAudioSpeed, audioVolume: wordAudioVolume }
          : c
      ));
    } else {
      setCards(prev => [
        ...prev,
        { id: Date.now().toString(), word: word.trim(), meaning: meaning.trim(), note: note.trim(), folderId: currentFolderId ?? undefined, wordLang: wordFieldLang, meaningLang: meaningFieldLang, audioUri: wordAudioUri, audioSpeed: wordAudioSpeed, audioVolume: wordAudioVolume },
      ]);
    }
    setWordModalVisible(false);
  };

  const deleteCard = (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
    setFlipped(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const openMovePicker = (ids: string[]) => {
    setPendingMoveIds(ids);
    setMovePickerVisible(true);
  };

  const moveCardsToFolder = (targetFolderId: string) => {
    setCards(prev => prev.map(c => pendingMoveIds.includes(c.id) ? { ...c, folderId: targetFolderId } : c));
    if (selectionMode) exitSelectionMode();
  };

  const toggleCardNotif = (id: string) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, notifOff: !c.notifOff } : c));
  };

  const toggleFlip = (id: string) => {
    setFlipped(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCardOpen = useCallback((close: () => void) => {
    if (closeOpenCard.current !== close) closeOpenCard.current?.();
    closeOpenCard.current = close;
  }, []);

  const handleFolderOpen = useCallback((close: () => void) => {
    if (closeOpenFolder.current !== close) closeOpenFolder.current?.();
    closeOpenFolder.current = close;
  }, []);

  const createFolder = (name: string, icon = 'folder-outline') => {
    const folder: Folder = { id: Date.now().toString(), name, icon, createdAt: Date.now() };
    setFolders(prev => [...prev, folder]);
  };

  const openFolder = (id: string) => {
    closeOpenFolder.current?.();
    exitSelectionMode();
    exitReorderMode();
    exitFolderSelectionMode();
    exitFolderReorderMode();
    setCurrentFolderId(id);
    scrollY.setValue(0);
  };

  const goBackToFolders = () => {
    exitSelectionMode();
    exitReorderMode();
    setCurrentFolderId(null);
    setLevelFilter(new Set(ALL_LEVEL_KEYS));
    // Reset depth gradient to ocean surface when navigating away from word list.
    scrollY.setValue(0);
  };

  const SEL_BAR_H = 68;

  const renderCard = ({ item, index }: { item: WordCard; index: number }) => (
    <SwipeableCard
      item={item}
      isFlipped={flipped.has(item.id)}
      themeColor={activeThemeColor}
      pal={pal}
      voiceLocked={!isSubscribed && index >= FREE_VOICE_LIMIT}
      isSubscribed={isSubscribed}
      onFlip={() => toggleFlip(item.id)}
      onEdit={() => openEdit(item)}
      onDelete={() => deleteCard(item.id)}
      onMove={() => openMovePicker([item.id])}
      onToggleNotif={() => toggleCardNotif(item.id)}
      onVoiceLocked={() => openPaywall('voice')}
      onOpen={handleCardOpen}
      openCardRef={closeOpenCard}
      selectionMode={selectionMode}
      selected={selectedIds.has(item.id)}
      onToggleSelect={() => toggleSelect(item.id)}
      showLevelLabel={showLevelLabels}
      onSwiping={(active) => setCardScrollEnabled(!active)}
      showFullCard={showFullCard}
    />
  );

  const renderFolderItem = ({ item }: { item: Folder }) => {
    const count       = cards.filter(c => c.folderId === item.id).length;
    const folderColor = activeThemeColor;
    const folderIcon  = item.icon ?? 'folder-outline';
    return (
      <SwipeableFolder
        folder={item}
        cardCount={count}
        pal={pal}
        themeColor={activeThemeColor}
        folderColor={folderColor}
        folderIcon={folderIcon}
        onOpen={handleFolderOpen}
        onPress={() => openFolder(item.id)}
        onEdit={() => setEditingFolder(item)}
        onDelete={() => setFolders(prev => prev.filter(f => f.id !== item.id))}
        selectionMode={folderSelectionMode}
        selected={selectedFolderIds.has(item.id)}
        onToggleSelect={() => toggleFolderSelect(item.id)}
      />
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <LangContext.Provider value={t}>
    <SafeAreaProvider>
    <SafeAreaView style={[s.root, { backgroundColor: pal.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {activeSkin?.patternType && (
        <SkinPatternOverlay patternType={activeSkin.patternType} />
      )}
      {activeSkin?.wallpaperImage && (
        <SkinWallpaperOverlay
          image={activeSkin.wallpaperImage}
          blurIntensity={activeSkin.wallpaperBlur}
          overlayColor={activeSkin.wallpaperOverlayColor}
        />
      )}
      {activeSkin?.id === 'skin_deep_sea'  && <DeepSeaOverlay scrollY={scrollY} />}
      {activeSkin?.id === 'skin_leaf_blur' && <GreenNatureOverlay />}
      {activeSkin?.id === 'shop_woods'     && <BeautifulWoodsOverlay />}
      {activeSkin?.id === 'shop_roses'     && <RosesOverlay />}
      {activeSkin?.id === 'skin_sunset'    && <SunsetOverlay />}
      {activeSkin?.id === 'skin_sakura'    && <SakuraOverlay />}
      {activeSkin?.id === 'skin_galaxy'    && <GalaxyOverlay />}
      {activeSkin?.id === 'skin_snow'      && <SnowMountainOverlay />}
      {activeSkin?.id === 'skin_cyber'     && <CyberNeonOverlay />}
      {activeSkin?.id === 'skin_coffee'    && <CoffeeHouseOverlay />}
      {activeSkin?.id === 'skin_aurora'    && <AuroraOverlay />}
      {activeSkin?.id === 'skin_rain'      && <RainyWindowOverlay />}
      {activeSkin?.id === 'skin_paw'       && <AnimalOverlay />}

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      {currentFolderId === null ? (
        /* Folder list header — 3 modes */
        folderSelectionMode ? (
          <View style={s.header}>
            <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
              {selectedFolderIds.size} {t('selected')}
            </Text>
            <TouchableOpacity style={s.iconBtn} onPress={exitFolderSelectionMode}>
              <Text style={{ color: activeThemeColor, fontSize: 16, fontWeight: '600' }}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : folderReorderMode ? (
          <View style={s.header}>
            <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
              {t('reorder_cards')}
            </Text>
            <TouchableOpacity style={s.iconBtn} onPress={exitFolderReorderMode}>
              <Text style={{ color: activeThemeColor, fontSize: 16, fontWeight: '600' }}>
                {t('done')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.header}>
            <Text style={[s.title, { color: pal.text }]}>WordMemo</Text>
            <View style={s.headerIcons}>
              <TouchableOpacity style={s.iconBtn} onPress={() => setAddingFolder(true)}>
                <MaterialCommunityIcons name="folder-plus-outline" size={22} color={pal.sub} />
              </TouchableOpacity>
              <View ref={folderMenuBtnRef}>
                <TouchableOpacity style={s.iconBtn} onPress={openFolderMenu}>
                  <Ionicons name="ellipsis-vertical" size={22} color={pal.sub} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )
      ) : (
        /* Inside-folder header */
        <View style={s.header} onTouchStart={() => closeOpenCard.current?.()}>
          {selectionMode ? (
            <>
              <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
                {selectedIds.size} {t('selected')}
              </Text>
              <TouchableOpacity style={s.iconBtn} onPress={exitSelectionMode}>
                <Text style={{ color: activeThemeColor, fontSize: 16, fontWeight: '600' }}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
            </>
          ) : reorderMode ? (
            <>
              <Text style={[s.title, { color: pal.text, fontSize: 20 }]}>
                {t('reorder_cards')}
              </Text>
              <TouchableOpacity style={s.iconBtn} onPress={exitReorderMode}>
                <Text style={{ color: activeThemeColor, fontSize: 16, fontWeight: '600' }}>
                  {t('done')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: -4 }}>
                <TouchableOpacity
                  style={{ paddingRight: 4, paddingVertical: 0 }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
                  onPress={goBackToFolders}
                >
                  <Ionicons name="chevron-back" size={24} color={pal.text} />
                </TouchableOpacity>
                <Text style={[s.title, { color: pal.text, flex: 1 }]} numberOfLines={1}>
                  {currentFolder?.name ?? ''}
                </Text>
              </View>
              <View style={s.headerIcons}>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={() => setNotificationModalVisible(true)}
                >
                  <Ionicons
                    name={notificationsEnabled ? 'notifications' : 'notifications-off-outline'}
                    size={22}
                    color={notificationsEnabled ? activeThemeColor : pal.sub}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={() => setCardViewMode(m => m === 'list' ? 'flip' : 'list')}
                >
                  <Ionicons
                    name={cardViewMode === 'flip' ? 'list-outline' : 'albums-outline'}
                    size={22}
                    color={pal.sub}
                  />
                </TouchableOpacity>
                <View ref={menuBtnRef}>
                  <TouchableOpacity style={s.iconBtn} onPress={openMenu}>
                    <Ionicons name="ellipsis-vertical" size={22} color={pal.sub} />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────────── */}
      {currentFolderId === null ? (
        /* Folder list */
        <>
          {/* Folder count — mirrors the wordCount row on the card screen for visual alignment */}
          <Text style={[s.wordCount, { color: pal.sub }]}>
            {folders.length} {t(folders.length === 1 ? 'folders_singular' : 'folders_plural')}
          </Text>

          {folders.length === 0 ? (
          <View style={s.empty}>
            <View style={[emptyIconWrap, { backgroundColor: activeThemeColor + '18' }]}>
              <Ionicons name="folder-outline" size={40} color={activeThemeColor} />
            </View>
            <Text style={[s.emptyTitle, { color: pal.text }]}>{t('no_folders_title')}</Text>
            <Text style={[s.emptyHint,  { color: pal.sub  }]}>{t('no_folders_hint')}</Text>
          </View>
        ) : folderReorderMode ? (
          <ReorderableList
            cards={folders.map(f => ({ id: f.id, word: f.name, meaning: '', note: '' }))}
            onReorder={reordered =>
              setFolders(prev => reordered.map(c => prev.find(f => f.id === c.id)!))
            }
            pal={pal}
            themeColor={activeThemeColor}
            extraPaddingBottom={isSubscribed ? 0 : AD_BANNER_HEIGHT}
            folderData={Object.fromEntries(
              folders.map(f => [
                f.id,
                {
                  icon:      f.icon  ?? 'folder-outline',
                  color:     activeThemeColor,
                  cardCount: cards.filter(c => c.folderId === f.id).length,
                },
              ])
            )}
          />
        ) : (
          <>
            <FlatList
              data={folders}
              keyExtractor={f => f.id}
              renderItem={renderFolderItem}
              ListFooterComponent={undefined}
              contentContainerStyle={[
                s.list,
                { paddingBottom: s.list.paddingBottom + (isSubscribed ? 0 : AD_BANNER_HEIGHT) + (folderSelectionMode ? SEL_BAR_H : 0) },
              ]}
              showsVerticalScrollIndicator={false}
            />
            {/* Folder selection bar */}
            {folderSelectionMode && (
              <View style={[selStyles.bar, { backgroundColor: pal.dialog, borderTopColor: pal.border }]}>
                <TouchableOpacity
                  style={selStyles.barBtn}
                  onPress={deleteSelectedFolders}
                  disabled={selectedFolderIds.size === 0}
                >
                  <Ionicons name="trash-outline" size={20} color={selectedFolderIds.size === 0 ? pal.sub : '#E05C5C'} />
                  <Text style={[selStyles.barLabel, { color: selectedFolderIds.size === 0 ? pal.sub : '#E05C5C' }]}>
                    {t('delete')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )
        }
      </>
      ) : (
        /* Card list inside folder */
        <>
          <View onTouchStart={() => closeOpenCard.current?.()}>
            <Text style={[s.wordCount, { color: pal.sub }]}>
              {isFilterActive
                ? `${filteredFolderCards.length} / ${folderCards.length}`
                : folderCards.length}{' '}
              {t(folderCards.length === 1 ? 'words_singular' : 'words_plural')}
            </Text>
          </View>

          {/* Level filter chips + test mode button */}
          {folderCards.length > 0 && !selectionMode && !reorderMode && showLevelLabels && (
            <View style={filterStyles.bar} onTouchStart={() => closeOpenCard.current?.()}>
              {/* Level filter chips */}
              <View style={filterStyles.chipGroup}>
                {LEVEL_FILTER_OPTIONS.map(({ level, icon, color }) => {
                  const count = folderCards.filter(c => (c.testLevel ?? 'none') === level).length;
                  const on = levelFilter.has(level);
                  return (
                    <TouchableOpacity
                      key={level}
                      style={[filterStyles.chip, { borderColor: on ? color : pal.border }]}
                      onPress={() => toggleLevelFilter(level)}
                    >
                      {icon === '◎'
                        ? <Text style={{ fontSize: 14, color: on ? color : '#9CA3AF', lineHeight: 15 }}>◎</Text>
                        : icon != null
                        ? <Ionicons name={icon as any} size={13} color={on ? color : '#9CA3AF'} />
                        : null
                      }
                      <Text style={[filterStyles.chipCount, { color: on ? color : '#9CA3AF' }]}>
                        {count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Test mode button — icon only, pushed to far right */}
              <TouchableOpacity
                style={s.iconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setTestModeVisible(true)}
              >
                <Ionicons name="school-outline" size={22} color={pal.sub} />
              </TouchableOpacity>
            </View>
          )}

          {folderCards.length === 0 ? (
            <View style={s.empty}>
              <View style={[emptyIconWrap, { backgroundColor: activeThemeColor + '18' }]}>
                <Ionicons name="book-outline" size={40} color={activeThemeColor} />
              </View>
              <Text style={[s.emptyTitle, { color: pal.text }]}>{t('no_words_title')}</Text>
              <Text style={[s.emptyHint,  { color: pal.sub  }]}>{t('no_words_hint')}</Text>
            </View>
          ) : reorderMode ? (
            <>
              <View style={reorderToolStyles.toolbar}>
                <TouchableOpacity
                  style={[reorderToolStyles.btn, { backgroundColor: pal.card, borderColor: pal.border }]}
                  onPress={handleSortByLevel}
                >
                  <Text style={[reorderToolStyles.btnText, { color: reorderSortDir != null ? activeThemeColor : pal.text }]}>
                    {t(reorderSortDir === 'asc' ? 'reorder_sort_least_first' : 'reorder_sort_best_first')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[reorderToolStyles.btn, { backgroundColor: pal.card, borderColor: pal.border }]}
                  onPress={handleResetOrder}
                >
                  <Ionicons name="refresh-outline" size={15} color={pal.sub} />
                  <Text style={[reorderToolStyles.btnText, { color: pal.sub }]}>{t('reorder_original')}</Text>
                </TouchableOpacity>
              </View>
              <ReorderableList
                cards={folderCards}
                onReorder={reorderedFolderCards => {
                  setCards(prev => [
                    ...reorderedFolderCards,
                    ...prev.filter(c => c.folderId !== currentFolderId),
                  ]);
                }}
                pal={pal}
                themeColor={activeThemeColor}
                extraPaddingBottom={isSubscribed ? 0 : AD_BANNER_HEIGHT}
                showLevelLabel={showLevelLabels}
              />
            </>
          ) : cardViewMode === 'flip' ? (
            <FlipCardBrowser
              key={Array.from(levelFilter).sort().join(',')}
              cards={filteredFolderCards}
              pal={pal}
              themeColor={activeThemeColor}
              isSubscribed={isSubscribed}
              onEdit={openEdit}
              onDelete={deleteCard}
              onMove={card => openMovePicker([card.id])}
              onToggleNotif={toggleCardNotif}
              showLevelLabel={showLevelLabels}
              verticalFlip={verticalFlip}
            />
          ) : (
            <FlatList
              data={filteredFolderCards}
              keyExtractor={c => c.id}
              renderItem={renderCard}
              style={{ flex: 1 }}
              contentContainerStyle={[
                s.list,
                { paddingBottom: s.list.paddingBottom + (isSubscribed ? 0 : AD_BANNER_HEIGHT) + (selectionMode ? SEL_BAR_H : 0) },
              ]}
              showsVerticalScrollIndicator={true}
              scrollEnabled={cardScrollEnabled}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => closeOpenCard.current?.()}
              scrollEventThrottle={16}
              onScroll={activeSkin?.id === 'skin_deep_sea'
                ? Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false }
                  )
                : undefined}
              ListFooterComponent={
                <TouchableWithoutFeedback onPress={() => closeOpenCard.current?.()}>
                  <View style={{ height: 300 }} />
                </TouchableWithoutFeedback>
              }
            />
          )}

          {/* Selection action bar */}
          {selectionMode && (
            <View style={[selStyles.bar, { backgroundColor: pal.dialog, borderTopColor: pal.border }]}>
              <TouchableOpacity
                style={selStyles.barBtn}
                onPress={() => setNotifForSelected(false)}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="notifications-outline" size={20} color={selectedIds.size === 0 ? pal.sub : activeThemeColor} />
                <Text style={[selStyles.barLabel, { color: selectedIds.size === 0 ? pal.sub : activeThemeColor }]}>
                  {t('notif_on')}
                </Text>
              </TouchableOpacity>
              <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
              <TouchableOpacity
                style={selStyles.barBtn}
                onPress={() => setNotifForSelected(true)}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="notifications-off-outline" size={20} color={pal.sub} />
                <Text style={[selStyles.barLabel, { color: pal.sub }]}>{t('notif_off_action')}</Text>
              </TouchableOpacity>
              <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
              <TouchableOpacity
                style={selStyles.barBtn}
                onPress={() => openMovePicker([...selectedIds])}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="folder-outline" size={20} color={selectedIds.size === 0 ? pal.sub : activeThemeColor} />
                <Text style={[selStyles.barLabel, { color: selectedIds.size === 0 ? pal.sub : activeThemeColor }]}>
                  {t('move')}
                </Text>
              </TouchableOpacity>
              <View style={[selStyles.barDivider, { backgroundColor: pal.border }]} />
              <TouchableOpacity
                style={selStyles.barBtn}
                onPress={deleteSelected}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="trash-outline" size={20} color={selectedIds.size === 0 ? pal.sub : '#E05C5C'} />
                <Text style={[selStyles.barLabel, { color: selectedIds.size === 0 ? pal.sub : '#E05C5C' }]}>
                  {t('delete')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!selectionMode && !reorderMode && (
            <TouchableOpacity
              style={[s.fab, { bottom: (isSubscribed ? 16 : AD_BANNER_HEIGHT) + 48, backgroundColor: activeThemeColor, shadowColor: activeThemeColor }]}
              onPress={openAdd}
            >
              <Text style={s.fabText}>+</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {!isSubscribed && <AdBannerPlaceholder pal={pal} />}

      <WordModal
        visible={wordModalVisible}
        onClose={() => setWordModalVisible(false)}
        editingCard={editingCard}
        word={word}
        onChangeWord={setWord}
        meaning={meaning}
        onChangeMeaning={setMeaning}
        note={note}
        onChangeNote={setNote}
        onSave={saveCard}
        pal={pal}
        themeColor={activeThemeColor}
        isSubscribed={isSubscribed}
        wordLang={wordFieldLang}
        onChangeWordLang={setWordFieldLang}
        meaningLang={meaningFieldLang}
        onChangeMeaningLang={setMeaningFieldLang}
        audioUri={wordAudioUri}
        onChangeAudioUri={setWordAudioUri}
        audioSpeed={wordAudioSpeed}
        onChangeAudioSpeed={setWordAudioSpeed}
        audioVolume={wordAudioVolume}
        onChangeAudioVolume={setWordAudioVolume}
      />

      <NotificationModal
        visible={notificationModalVisible}
        onClose={() => setNotificationModalVisible(false)}
        intervalSeconds={folderNotifSettings.intervalSeconds}
        onPickInterval={handlePickInterval}
        displayOnlyWord={folderNotifSettings.displayOnlyWord}
        onToggleDisplayOnlyWord={(value) => updateFolderNotif({ displayOnlyWord: value })}
        pal={pal}
        themeColor={activeThemeColor}
        onTest={() => {
          const eligible = folderCards.filter(c => !c.notifOff);
          if (eligible.length === 0) return;
          const card = eligible[Math.floor(Math.random() * eligible.length)];
          sendTestNotification(card, folderNotifSettings.displayOnlyWord);
        }}
      />

      <SettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        themeColor={activeThemeColor}
        appearance={appearance}
        onPickAppearance={pickAppearance}
        skinId={skinId}
        onPickSkin={setSkinId}
        isSubscribed={isSubscribed}
        onUpgrade={() => { setSettingsModalVisible(false); openPaywall('words'); }}
        onSubscribe={subscribe}
        onRestore={restore}
        // DEV ONLY: Temporary subscription downgrade for testing. Remove before release.
        onManageSubscription={__DEV__ ? unsubscribe : undefined}
        pal={pal}
        language={language}
        onPickLanguage={pickLanguage}
        showFullCard={showFullCard}
        onToggleShowFullCard={setShowFullCard}
        verticalFlip={verticalFlip}
        onToggleVerticalFlip={setVerticalFlip}
      />

      <PaywallModal
        visible={paywallVisible}
        reason={paywallReason}
        onClose={() => setPaywallVisible(false)}
        onSubscribe={subscribe}
        onRestore={restore}
        pal={pal}
        themeColor={themeColor}
      />

      <ProSheet
        visible={proSheetVisible}
        onClose={() => setProSheetVisible(false)}
        onSubscribe={subscribe}
        onRestore={restore}
        // DEV ONLY: Temporary subscription downgrade for testing. Remove before release.
        onManageSubscription={__DEV__ ? unsubscribe : undefined}
        themeColor={activeThemeColor}
        pal={pal}
        isSubscribed={isSubscribed}
        learningLang={learnLang ?? undefined}
        nativeLang={nativeLang}
      />

      {/* Three-dot popup menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={0}
          onPress={() => setMenuVisible(false)}
        />
        <View style={[
          menuStyles.card,
          { top: menuAnchor.top, right: menuAnchor.right, backgroundColor: pal.dialog, borderWidth: 1, borderColor: pal.border },
        ]}>
          {/* Group 1: Management actions */}
          <TouchableOpacity
            style={menuStyles.item}
            onPress={menuContext === 'folders' ? enterFolderSelectionMode : enterSelectionMode}
          >
            <Ionicons name="checkmark-circle-outline" size={17} color={pal.text} />
            <Text style={[menuStyles.itemText, { color: pal.text }]}>{t('select_entries')}</Text>
          </TouchableOpacity>
          <View style={[menuStyles.sep, { backgroundColor: pal.border }]} />
          <TouchableOpacity
            style={menuStyles.item}
            onPress={menuContext === 'folders' ? enterFolderReorderMode : enterReorderMode}
          >
            <Ionicons name="swap-vertical-outline" size={17} color={pal.text} />
            <Text style={[menuStyles.itemText, { color: pal.text }]}>{t('reorder_cards')}</Text>
          </TouchableOpacity>
          {menuContext === 'cards' && (
            <>
              <View style={[menuStyles.sep, { backgroundColor: pal.border }]} />
              <TouchableOpacity
                style={menuStyles.item}
                onPress={() => { setShowLevelLabels(v => !v); setMenuVisible(false); }}
              >
                <Ionicons
                  name={showLevelLabels ? 'eye-off-outline' : 'eye-outline'}
                  size={17}
                  color={pal.text}
                />
                <Text style={[menuStyles.itemText, { color: pal.text }]}>
                  {t(showLevelLabels ? 'hide_level_labels' : 'show_level_labels')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Thicker divider before settings group */}
          <View style={[menuStyles.groupSep, { backgroundColor: pal.border }]} />

          <TouchableOpacity
            style={menuStyles.item}
            onPress={() => { setSettingsModalVisible(true); setMenuVisible(false); }}
          >
            <Ionicons name="settings-outline" size={17} color={pal.text} />
            <Text style={[menuStyles.itemText, { color: pal.text }]}>{t('settings')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <FolderCustomizeModal
        visible={addingFolder}
        mode="edit"
        isNew
        currentValue="folder-outline"
        folderName=""
        onSelect={() => {}}
        onSaveEdit={(name, icon) => { createFolder(name, icon); }}
        onClose={() => setAddingFolder(false)}
        pal={pal}
        themeColor={activeThemeColor}
        isSubscribed={isSubscribed}
      />

      <FolderCustomizeModal
        visible={editingFolder !== null}
        mode="edit"
        currentValue={editingFolder?.icon ?? 'folder-outline'}
        folderName={editingFolder?.name ?? ''}
        onSelect={() => {}}
        onSaveEdit={(name, icon) => {
          if (!editingFolder) return;
          setFolders(prev => prev.map(f =>
            f.id === editingFolder.id ? { ...f, name, icon } : f
          ));
        }}
        onClose={() => setEditingFolder(null)}
        pal={pal}
        themeColor={activeThemeColor}
        isSubscribed={isSubscribed}
      />

      {testModeVisible && (
        <TestModeScreen
          cards={filteredFolderCards}
          onUpdateCard={(id, patch) =>
            setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
          }
          onClose={() => setTestModeVisible(false)}
          pal={pal}
          themeColor={activeThemeColor}
          isSubscribed={isSubscribed}
        />
      )}

      <FolderPickerSheet
        visible={movePickerVisible}
        onClose={() => setMovePickerVisible(false)}
        folders={folders}
        currentFolderId={currentFolderId}
        pal={pal}
        themeColor={activeThemeColor}
        onSelect={moveCardsToFolder}
        isSubscribed={isSubscribed}
      />

      <OnboardingModal
        visible={showOnboarding}
        pal={pal}
        themeColor={activeThemeColor}
        onComplete={async (choices) => {
          await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(choices));
          if (choices.learningLang && choices.learningLang !== 'other') setLearnLang(choices.learningLang);
          if (choices.nativeLang && choices.nativeLang !== 'other') setNativeLang(choices.nativeLang);
          // Default UI language to the user's chosen explanation language.
          const uiLang = BCP47_TO_UI_LANG[choices.nativeLang];
          if (uiLang) setLanguage(uiLang);
          // Replace placeholder welcome cards with localized versions,
          // then batch everything so the modal close has no intermediate flash.
          setCards(prev => {
            const withoutPlaceholders = prev.filter(c => !WELCOME_CARD_IDS.includes(c.id));
            return [...buildWelcomeCards(choices), ...withoutPlaceholders];
          });
          // Rename the Welcome folder to the user's native language.
          const localizedFolderName = WELCOME_FOLDER_NAMES[choices.nativeLang] ?? WELCOME_FOLDER_NAMES['en-US'];
          setFolders(prev => prev.map(f =>
            f.id === WELCOME_FOLDER_ID ? { ...f, name: localizedFolderName } : f
          ));
          setCurrentFolderId(WELCOME_FOLDER_ID);
          setShowOnboarding(false);
        }}
      />
    </SafeAreaView>
    </SafeAreaProvider>
    </LangContext.Provider>
  );
}

const emptyIconWrap = {
  width: 80, height: 80, borderRadius: 24,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  marginBottom: 20,
};

const selStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 68,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  barLabel: { fontSize: 11, fontWeight: '600' },
  barDivider: { width: StyleSheet.hairlineWidth },
});

const filterStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  chipGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipCount: {
    fontSize: 12,
    fontWeight: '600',
  },
});

const reorderToolStyles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

const menuStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    minWidth: 190,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  itemText: { fontSize: 15 },
  sep:      { height: StyleSheet.hairlineWidth },
  groupSep: { height: 3 },
});

