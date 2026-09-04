import type { OnboardingChoices, WordCard } from '../../types';
import { WELCOME_FOLDER_ID } from '../../lib/db';

/**
 * The two folders a brand-new install starts with.
 *
 * Both are seeded in English by `DEFAULT_FOLDERS` in `lib/db.ts` and renamed to
 * the language the user picks the moment onboarding completes — which on a
 * genuine first launch always happens before the folder list is visible.
 *
 * They are named after what they teach rather than after a greeting: the first
 * tells the user the gesture, the second tells them what the gesture leads to.
 * Existing installs keep whatever these folders are called now, including the
 * original "Welcome"; nothing here renames a folder that already exists.
 */
export const WELCOME_FOLDER_NAMES: Record<string, string> = {
  'en-US': 'Swipe or hold a folder',
  'ja-JP': 'フォルダーをスライドか長押し',
  'ko-KR': '폴더를 밀거나 길게 누르세요',
  'zh-CN': '滑动或长按文件夹',
  'es-ES': 'Desliza o mantén pulsada una carpeta',
  'fr-FR': 'Balayez ou maintenez un dossier',
  'de-DE': 'Wische oder halte einen Ordner',
  'it-IT': 'Scorri o tieni premuta una cartella',
  'pt-BR': 'Deslize ou segure uma pasta',
  'ru-RU': 'Проведите или удержите папку',
  'ar':    'اسحب المجلد أو اضغط عليه مطولاً',
  'hi-IN': 'फ़ोल्डर को स्वाइप करें या दबाए रखें',
  'tr-TR': 'Bir klasörü kaydırın veya basılı tutun',
  'nl-NL': 'Veeg of houd een map ingedrukt',
  'vi-VN': 'Vuốt hoặc giữ một thư mục',
  'th-TH': 'ปัดหรือกดค้างที่โฟลเดอร์',
  'id-ID': 'Geser atau tahan folder',
  'pl-PL': 'Przesuń lub przytrzymaj folder',
  'el-GR': 'Σύρετε ή κρατήστε πατημένο έναν φάκελο',
  'sv-SE': 'Svep eller håll in en mapp',
};

/** The second default folder — see the note on WELCOME_FOLDER_NAMES. */
export const TIPS_FOLDER_NAMES: Record<string, string> = {
  'en-US': 'You can change its name and icon',
  'ja-JP': '名前やアイコンを変更できるよ',
  'ko-KR': '이름과 아이콘을 바꿀 수 있어요',
  'zh-CN': '可以更改名称和图标',
  'es-ES': 'Puedes cambiar su nombre y su icono',
  'fr-FR': 'Vous pouvez changer son nom et son icône',
  'de-DE': 'Du kannst Name und Symbol ändern',
  'it-IT': 'Puoi cambiarne il nome e l’icona',
  'pt-BR': 'Você pode mudar o nome e o ícone',
  'ru-RU': 'Можно изменить название и значок',
  'ar':    'يمكنك تغيير الاسم والأيقونة',
  'hi-IN': 'आप इसका नाम और आइकन बदल सकते हैं',
  'tr-TR': 'Adını ve simgesini değiştirebilirsiniz',
  'nl-NL': 'Je kunt de naam en het pictogram wijzigen',
  'vi-VN': 'Bạn có thể đổi tên và biểu tượng',
  'th-TH': 'เปลี่ยนชื่อและไอคอนได้',
  'id-ID': 'Kamu bisa mengubah nama dan ikonnya',
  'pl-PL': 'Możesz zmienić jego nazwę i ikonę',
  'el-GR': 'Μπορείτε να αλλάξετε το όνομα και το εικονίδιο',
  'sv-SE': 'Du kan ändra namn och ikon',
};

// Translations for the tutorial messages in the Welcome folder.
// Keys match the BCP-47 codes used in OnboardingModal's language list.
const WELCOME_CARD_TEXTS: Record<string, [string, string, string, string]> = {
  'en-US': [
    'Tap the card to reveal its meaning.',
    'Switch between List Mode and Flip Mode in Settings.',
    'Tap the graduation cap icon to test yourself.',
    'Set up notifications to review your words automatically.',
  ],
  'ja-JP': [
    'カードをタップして意味を確認しましょう。',
    '設定画面で、リストモードと単語フリップモードを切り替えられます。',
    '右上の帽子アイコンから、登録した単語をテストできます。',
    '通知アイコンから通知を設定して、単語を自動で復習しましょう。',
  ],
  'ko-KR': [
    '카드를 탭하면 뜻이 나타납니다.',
    '설정 화면에서 목록 모드와 카드 뒤집기 모드를 전환할 수 있습니다.',
    '오른쪽 상단의 졸업 모자 아이콘을 탭하여 단어를 테스트해 보세요.',
    '알림을 설정하면 단어를 자동으로 복습할 수 있습니다.',
  ],
  'zh-CN': [
    '点击卡片以查看其含义。',
    '在设置中切换列表模式和卡片翻转模式。',
    '点击右上角的学士帽图标来测试自己。',
    '设置通知以自动复习单词。',
  ],
  'es-ES': [
    'Toca la tarjeta para ver su significado.',
    'Cambia entre el modo lista y el modo de tarjetas en Ajustes.',
    'Toca el icono del birrete para ponerte a prueba.',
    'Configura las notificaciones para repasar tus palabras automáticamente.',
  ],
  'fr-FR': [
    'Appuyez sur la carte pour révéler sa signification.',
    'Basculez entre le mode liste et le mode cartes dans les Réglages.',
    "Appuyez sur l'icône de chapeau de diplômé pour vous tester.",
    'Configurez les notifications pour réviser vos mots automatiquement.',
  ],
  'de-DE': [
    'Tippe auf die Karte, um ihre Bedeutung zu sehen.',
    'Wechsle in den Einstellungen zwischen Listen- und Karteikartenmodus.',
    'Tippe auf das Doktorhut-Symbol, um dich selbst zu testen.',
    'Richte Benachrichtigungen ein, um deine Wörter automatisch zu wiederholen.',
  ],
  'it-IT': [
    'Tocca la carta per rivelare il suo significato.',
    'Passa dalla modalità elenco alla modalità flip nelle Impostazioni.',
    "Tocca l'icona del tocco accademico per metterti alla prova.",
    'Imposta le notifiche per ripassare le parole automaticamente.',
  ],
  'pt-BR': [
    'Toque no cartão para revelar seu significado.',
    'Alterne entre o modo lista e o modo de cartão nos Ajustes.',
    'Toque no ícone do capelo para se testar.',
    'Configure as notificações para revisar suas palavras automaticamente.',
  ],
  'ru-RU': [
    'Нажмите на карточку, чтобы открыть её значение.',
    'Переключайтесь между режимом списка и режимом карточек в настройках.',
    'Нажмите на иконку академической шапочки, чтобы проверить себя.',
    'Настройте уведомления, чтобы автоматически повторять слова.',
  ],
  'ar': [
    'اضغط على البطاقة لعرض معناها.',
    'بدّل بين وضع القائمة ووضع البطاقات في الإعدادات.',
    'اضغط على أيقونة قبعة التخرج لاختبار نفسك.',
    'قم بإعداد الإشعارات لمراجعة كلماتك تلقائياً.',
  ],
  'hi-IN': [
    'अर्थ देखने के लिए कार्ड पर टैप करें।',
    'सेटिंग्स में सूची मोड और कार्ड फ्लिप मोड के बीच स्विच करें।',
    'खुद को परखने के लिए ग्रेजुएशन कैप आइकन पर टैप करें।',
    'अपने शब्दों को स्वचालित रूप से दोहराने के लिए सूचनाएं सेट करें।',
  ],
  'tr-TR': [
    'Anlamını görmek için kartın üzerine dokunun.',
    'Ayarlar bölümünde liste modu ile kart modu arasında geçiş yapın.',
    'Kendinizi test etmek için sağ üstteki mezuniyet şapkası ikonuna dokunun.',
    'Kelimelerinizi otomatik olarak tekrar etmek için bildirimleri ayarlayın.',
  ],
  'nl-NL': [
    'Tik op de kaart om de betekenis te onthullen.',
    'Wissel in Instellingen tussen lijstmodus en kaartmodus.',
    'Tik op het afstudeerhoed-pictogram om jezelf te testen.',
    'Stel meldingen in om je woorden automatisch te herhalen.',
  ],
  'vi-VN': [
    'Nhấn vào thẻ để xem nghĩa của nó.',
    'Chuyển đổi giữa chế độ danh sách và chế độ lật thẻ trong Cài đặt.',
    'Nhấn vào biểu tượng mũ tốt nghiệp để kiểm tra bản thân.',
    'Thiết lập thông báo để tự động ôn lại các từ của bạn.',
  ],
  'th-TH': [
    'แตะที่การ์ดเพื่อดูความหมาย',
    'สลับระหว่างโหมดรายการและโหมดพลิกการ์ดในการตั้งค่า',
    'แตะไอคอนหมวกรับปริญญาเพื่อทดสอบตัวเอง',
    'ตั้งค่าการแจ้งเตือนเพื่อทบทวนคำศัพท์โดยอัตโนมัติ',
  ],
  'id-ID': [
    'Ketuk kartu untuk melihat artinya.',
    'Beralih antara mode daftar dan mode balik kartu di Pengaturan.',
    'Ketuk ikon topi wisuda untuk menguji dirimu.',
    'Atur notifikasi untuk mengulang kata-kata secara otomatis.',
  ],
  'pl-PL': [
    'Naciśnij kartę, aby zobaczyć jej znaczenie.',
    'Przełączaj się między trybem listy a trybem kart w Ustawieniach.',
    'Naciśnij ikonę biretu, aby się przetestować.',
    'Skonfiguruj powiadomienia, aby automatycznie powtarzać słowa.',
  ],
  'el-GR': [
    'Πατήστε στην κάρτα για να δείτε τη σημασία της.',
    'Εναλλάξτε τη λειτουργία λίστας και καρτών στις Ρυθμίσεις.',
    'Πατήστε το εικονίδιο καπέλου αποφοίτησης για να δοκιμάσετε τον εαυτό σας.',
    'Ρυθμίστε ειδοποιήσεις για αυτόματη επανάληψη των λέξεών σας.',
  ],
  'sv-SE': [
    'Tryck på kortet för att se dess betydelse.',
    'Växla mellan listläge och kortläge i Inställningar.',
    'Tryck på ikonen för studentmössa för att testa dig själv.',
    'Ställ in aviseringar för att automatiskt repetera dina ord.',
  ],
};

export const WELCOME_CARD_IDS: string[] = ['wp-w1', 'wp-w2', 'wp-w3', 'wp-w4'];

export function buildWelcomeCards(choices: OnboardingChoices): WordCard[] {
  // Language Learning: front = learn lang, back = explanation lang.
  // Vocabulary & Terms: two cards, with both sides in the explanation language.
  // 'other' falls back to English on either side.
  const wordLang = (choices.purpose === 'language' && choices.learningLang && choices.learningLang !== 'other')
    ? choices.learningLang
    : 'en-US';
  const meaningLang = (choices.nativeLang && choices.nativeLang !== 'other')
    ? choices.nativeLang
    : 'en-US';

  const wordTexts    = WELCOME_CARD_TEXTS[wordLang]    ?? WELCOME_CARD_TEXTS['en-US'];
  const meaningTexts = WELCOME_CARD_TEXTS[meaningLang] ?? WELCOME_CARD_TEXTS['en-US'];

  if (choices.purpose === 'words') {
    return [
      {
        id:          WELCOME_CARD_IDS[0],
        createdAt:   1,
        word:        meaningTexts[0],
        meaning:     meaningTexts[1],
        note:        '',
        wordLang:    meaningLang,
        meaningLang,
        folderId:    WELCOME_FOLDER_ID,
      },
      {
        id:          WELCOME_CARD_IDS[1],
        createdAt:   2,
        word:        meaningTexts[2],
        meaning:     meaningTexts[3],
        note:        '',
        wordLang:    meaningLang,
        meaningLang,
        folderId:    WELCOME_FOLDER_ID,
      },
    ];
  }

  return WELCOME_CARD_IDS.map((id, i) => ({
    id,
    createdAt:   i + 1,
    word:        wordTexts[i],
    meaning:     meaningTexts[i],
    note:        '',
    wordLang,
    meaningLang,
    folderId:    WELCOME_FOLDER_ID,
  }));
}
