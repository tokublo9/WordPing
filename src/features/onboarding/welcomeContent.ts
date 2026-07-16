import type { OnboardingChoices, WordCard } from '../../types';
import { WELCOME_FOLDER_ID } from '../../lib/db';

export const WELCOME_FOLDER_NAMES: Record<string, string> = {
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
    "Appuyez sur l'icône de chapeau de diplômé pour vous tester.",
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
    "Tocca l'icona del tocco accademico per metterti alla prova.",
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

export const WELCOME_CARD_IDS: string[] = ['wp-w1', 'wp-w2', 'wp-w3', 'wp-w4'];

export function buildWelcomeCards(choices: OnboardingChoices): WordCard[] {
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
