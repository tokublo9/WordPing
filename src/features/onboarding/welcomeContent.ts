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

/** Exactly eight, so a language cannot ship with an instruction missing. */
type TutorialTexts = readonly [string, string, string, string, string, string, string, string];

/**
 * The eight tutorial instructions, in the order the cards appear.
 *
 * One list per language, and every language carries all eight — a card never
 * mixes languages by falling back to English for a single entry. The only
 * fallback is a whole language the picker allows but this table does not cover
 * ('other'), which becomes English on that side of the card.
 *
 * Keys match the BCP-47 codes used in OnboardingModal's language list.
 */
const WELCOME_CARD_TEXTS: Record<string, TutorialTexts> = {
  'en-US': [
    'Test your words using the graduation-cap icon in the top-right corner.',
    'Tap a card to check its meaning.',
    'You can hide the word on the front from the word-editing screen.',
    'You can also register custom audio.',
    'Set notifications using the notification icon to review words automatically.',
    'Word cards and folders can be edited by swiping or long-pressing them.',
    'Upgrade your plan to access more than 20 themes and high-quality AI voices.',
    'Tap the three-dot icon in the top-right corner to reorder or delete cards.',
  ],
  'ja-JP': [
    '右上の帽子アイコンから、登録した単語をテストできます。',
    'カードをタップして意味を確認しましょう。',
    'カードの表の単語は、単語の編集画面から隠せます。',
    'お好みの音声を登録することもできます。',
    '通知アイコンから通知を設定して、単語を自動で復習しましょう。',
    '単語カードやフォルダーは、スワイプまたは長押しで編集できます。',
    'プランをアップグレードすると、20種類以上のテーマと高品質なAI音声を使えます。',
    '右上の3点アイコンから、カードの並べ替えや削除ができます。',
  ],
  'ko-KR': [
    '오른쪽 위의 학사모 아이콘으로 단어를 테스트해 보세요.',
    '카드를 탭하면 뜻을 확인할 수 있어요.',
    '카드 앞면의 단어는 단어 편집 화면에서 숨길 수 있어요.',
    '원하는 음성을 직접 등록할 수도 있어요.',
    '알림 아이콘으로 알림을 설정하면 단어를 자동으로 복습할 수 있어요.',
    '단어 카드와 폴더는 밀거나 길게 눌러 편집할 수 있어요.',
    '플랜을 업그레이드하면 20가지가 넘는 테마와 고품질 AI 음성을 사용할 수 있어요.',
    '오른쪽 위의 점 세 개 아이콘에서 카드를 정렬하거나 삭제할 수 있어요.',
  ],
  'zh-CN': [
    '点击右上角的学士帽图标即可测试单词。',
    '点击卡片即可查看它的含义。',
    '可以在单词编辑页面隐藏卡片正面的单词。',
    '还可以注册自定义音频。',
    '点击通知图标设置通知，自动复习单词。',
    '滑动或长按单词卡片和文件夹即可编辑。',
    '升级方案即可使用 20 多种主题和高音质 AI 语音。',
    '点击右上角的三点图标，可以为卡片排序或删除卡片。',
  ],
  'es-ES': [
    'Pon a prueba tus palabras con el icono del birrete de la esquina superior derecha.',
    'Toca una tarjeta para ver su significado.',
    'Puedes ocultar la palabra del anverso desde la pantalla de edición de la palabra.',
    'También puedes añadir tu propio audio.',
    'Activa las notificaciones desde el icono de notificaciones para repasar tus palabras automáticamente.',
    'Las tarjetas y las carpetas se editan deslizándolas o manteniéndolas pulsadas.',
    'Mejora tu plan para acceder a más de 20 temas y a voces de IA de alta calidad.',
    'Toca el icono de tres puntos de la esquina superior derecha para reordenar o eliminar tarjetas.',
  ],
  'fr-FR': [
    "Testez vos mots avec l'icône de chapeau de diplômé en haut à droite.",
    'Appuyez sur une carte pour voir sa signification.',
    "Vous pouvez masquer le mot au recto depuis l'écran de modification du mot.",
    'Vous pouvez aussi enregistrer votre propre audio.',
    "Configurez les notifications avec l'icône de notification pour réviser vos mots automatiquement.",
    "Les cartes et les dossiers se modifient d'un balayage ou d'un appui long.",
    'Passez à un forfait supérieur pour accéder à plus de 20 thèmes et aux voix IA haute qualité.',
    "Appuyez sur l'icône à trois points en haut à droite pour réorganiser ou supprimer des cartes.",
  ],
  'de-DE': [
    'Teste deine Wörter über das Doktorhut-Symbol oben rechts.',
    'Tippe auf eine Karte, um ihre Bedeutung zu sehen.',
    'Das Wort auf der Vorderseite kannst du im Bearbeitungsbildschirm des Wortes ausblenden.',
    'Du kannst auch eigene Audioaufnahmen hinterlegen.',
    'Richte über das Benachrichtigungssymbol Benachrichtigungen ein, um Wörter automatisch zu wiederholen.',
    'Wortkarten und Ordner lassen sich durch Wischen oder langes Drücken bearbeiten.',
    'Mit einem höheren Tarif erhältst du über 20 Designs und hochwertige KI-Stimmen.',
    'Tippe oben rechts auf das Drei-Punkte-Symbol, um Karten neu zu ordnen oder zu löschen.',
  ],
  'it-IT': [
    "Metti alla prova le tue parole con l'icona del tocco accademico in alto a destra.",
    'Tocca una carta per vederne il significato.',
    'Puoi nascondere la parola sul fronte dalla schermata di modifica della parola.',
    'Puoi anche registrare un audio personalizzato.',
    "Imposta le notifiche dall'icona delle notifiche per ripassare le parole automaticamente.",
    'Le carte e le cartelle si modificano scorrendo o tenendo premuto.',
    'Passa a un piano superiore per avere oltre 20 temi e voci IA di alta qualità.',
    "Tocca l'icona con tre punti in alto a destra per riordinare o eliminare le carte.",
  ],
  'pt-BR': [
    'Teste suas palavras no ícone do capelo no canto superior direito.',
    'Toque em um cartão para ver o significado.',
    'Você pode ocultar a palavra da frente na tela de edição da palavra.',
    'Você também pode adicionar um áudio personalizado.',
    'Configure as notificações no ícone de notificações para revisar as palavras automaticamente.',
    'Cartões e pastas podem ser editados deslizando ou tocando e segurando.',
    'Faça upgrade do seu plano para ter mais de 20 temas e vozes de IA de alta qualidade.',
    'Toque no ícone de três pontos no canto superior direito para reordenar ou excluir cartões.',
  ],
  'ru-RU': [
    'Проверяйте слова с помощью значка академической шапочки в правом верхнем углу.',
    'Нажмите на карточку, чтобы увидеть её значение.',
    'Слово на лицевой стороне можно скрыть на экране редактирования слова.',
    'Также можно добавить собственную аудиозапись.',
    'Настройте уведомления через значок уведомлений, чтобы повторять слова автоматически.',
    'Карточки слов и папки можно редактировать свайпом или долгим нажатием.',
    'Перейдите на более высокий тариф, чтобы открыть более 20 тем и качественные ИИ-голоса.',
    'Нажмите значок с тремя точками в правом верхнем углу, чтобы изменить порядок карточек или удалить их.',
  ],
  'ar': [
    'اختبر كلماتك من خلال أيقونة قبعة التخرج في الزاوية العلوية اليمنى.',
    'اضغط على البطاقة لعرض معناها.',
    'يمكنك إخفاء الكلمة الظاهرة في الوجه الأمامي من شاشة تعديل الكلمة.',
    'ويمكنك أيضاً إضافة مقطع صوتي خاص بك.',
    'اضبط الإشعارات من أيقونة الإشعارات لمراجعة كلماتك تلقائياً.',
    'يمكن تعديل بطاقات الكلمات والمجلدات بالسحب أو الضغط المطوّل.',
    'قم بترقية خطتك للحصول على أكثر من 20 سمة وأصوات ذكاء اصطناعي عالية الجودة.',
    'اضغط على أيقونة النقاط الثلاث في الزاوية العلوية اليمنى لإعادة ترتيب البطاقات أو حذفها.',
  ],
  'hi-IN': [
    'ऊपर दाईं ओर बने ग्रेजुएशन कैप आइकन से अपने शब्दों की परीक्षा लें।',
    'अर्थ देखने के लिए कार्ड पर टैप करें।',
    'सामने दिखने वाले शब्द को आप शब्द संपादन स्क्रीन से छिपा सकते हैं।',
    'आप अपनी पसंद का ऑडियो भी जोड़ सकते हैं।',
    'शब्दों को अपने आप दोहराने के लिए सूचना आइकन से सूचनाएं सेट करें।',
    'शब्द कार्ड और फ़ोल्डर को स्वाइप करके या देर तक दबाकर संपादित किया जा सकता है।',
    '20 से ज़्यादा थीम और उच्च गुणवत्ता वाली AI आवाज़ों के लिए अपना प्लान अपग्रेड करें।',
    'कार्ड का क्रम बदलने या उन्हें हटाने के लिए ऊपर दाईं ओर तीन बिंदु वाले आइकन पर टैप करें।',
  ],
  'tr-TR': [
    'Sağ üstteki mezuniyet şapkası ikonuyla kelimelerinizi test edin.',
    'Anlamını görmek için bir karta dokunun.',
    'Ön yüzdeki kelimeyi, kelime düzenleme ekranından gizleyebilirsiniz.',
    'Kendi ses kaydınızı da ekleyebilirsiniz.',
    'Kelimeleri otomatik olarak tekrar etmek için bildirim ikonundan bildirimleri ayarlayın.',
    'Kelime kartları ve klasörler kaydırarak veya basılı tutarak düzenlenebilir.',
    "20'den fazla temaya ve yüksek kaliteli yapay zekâ seslerine ulaşmak için planınızı yükseltin.",
    'Kartları yeniden sıralamak veya silmek için sağ üstteki üç nokta ikonuna dokunun.',
  ],
  'nl-NL': [
    'Test je woorden via het afstudeerhoed-pictogram rechtsboven.',
    'Tik op een kaart om de betekenis te zien.',
    'Je kunt het woord op de voorkant verbergen in het bewerkscherm van het woord.',
    'Je kunt ook je eigen audio toevoegen.',
    'Stel meldingen in via het meldingspictogram om woorden automatisch te herhalen.',
    'Woordkaarten en mappen bewerk je door te vegen of lang in te drukken.',
    "Upgrade je abonnement voor meer dan 20 thema's en AI-stemmen van hoge kwaliteit.",
    'Tik rechtsboven op het pictogram met drie puntjes om kaarten te ordenen of te verwijderen.',
  ],
  'vi-VN': [
    'Kiểm tra từ vựng bằng biểu tượng mũ tốt nghiệp ở góc trên bên phải.',
    'Nhấn vào thẻ để xem nghĩa của nó.',
    'Bạn có thể ẩn từ ở mặt trước trong màn hình chỉnh sửa từ.',
    'Bạn cũng có thể thêm âm thanh của riêng mình.',
    'Đặt thông báo bằng biểu tượng thông báo để tự động ôn lại từ vựng.',
    'Thẻ từ và thư mục có thể chỉnh sửa bằng cách vuốt hoặc nhấn giữ.',
    'Nâng cấp gói để dùng hơn 20 giao diện và giọng đọc AI chất lượng cao.',
    'Nhấn biểu tượng ba chấm ở góc trên bên phải để sắp xếp lại hoặc xóa thẻ.',
  ],
  'th-TH': [
    'ทดสอบคำศัพท์ได้จากไอคอนหมวกรับปริญญาที่มุมขวาบน',
    'แตะที่การ์ดเพื่อดูความหมาย',
    'คุณสามารถซ่อนคำที่อยู่ด้านหน้าได้จากหน้าจอแก้ไขคำศัพท์',
    'คุณยังเพิ่มเสียงของคุณเองได้ด้วย',
    'ตั้งค่าการแจ้งเตือนจากไอคอนแจ้งเตือนเพื่อทบทวนคำศัพท์โดยอัตโนมัติ',
    'การ์ดคำศัพท์และโฟลเดอร์แก้ไขได้ด้วยการปัดหรือกดค้าง',
    'อัปเกรดแผนเพื่อใช้ธีมมากกว่า 20 แบบและเสียง AI คุณภาพสูง',
    'แตะไอคอนสามจุดที่มุมขวาบนเพื่อจัดเรียงหรือลบการ์ด',
  ],
  'id-ID': [
    'Uji kosakatamu lewat ikon topi wisuda di pojok kanan atas.',
    'Ketuk kartu untuk melihat artinya.',
    'Kamu bisa menyembunyikan kata di sisi depan dari layar edit kata.',
    'Kamu juga bisa menambahkan audio buatanmu sendiri.',
    'Atur notifikasi lewat ikon notifikasi untuk mengulang kata secara otomatis.',
    'Kartu kata dan folder bisa diedit dengan menggeser atau menahannya.',
    'Tingkatkan paketmu untuk membuka lebih dari 20 tema dan suara AI berkualitas tinggi.',
    'Ketuk ikon tiga titik di pojok kanan atas untuk mengurutkan atau menghapus kartu.',
  ],
  'pl-PL': [
    'Sprawdź swoje słówka za pomocą ikony biretu w prawym górnym rogu.',
    'Naciśnij kartę, aby zobaczyć jej znaczenie.',
    'Słowo na przedniej stronie możesz ukryć na ekranie edycji słowa.',
    'Możesz też dodać własne nagranie audio.',
    'Ustaw powiadomienia ikoną powiadomień, aby automatycznie powtarzać słówka.',
    'Karty słówek i foldery edytujesz przesunięciem lub przytrzymaniem.',
    'Przejdź na wyższy plan, aby korzystać z ponad 20 motywów i wysokiej jakości głosów AI.',
    'Naciśnij ikonę trzech kropek w prawym górnym rogu, aby zmienić kolejność kart lub je usunąć.',
  ],
  'el-GR': [
    'Δοκιμάστε τις λέξεις σας από το εικονίδιο με το καπέλο αποφοίτησης πάνω δεξιά.',
    'Πατήστε μια κάρτα για να δείτε τη σημασία της.',
    'Μπορείτε να κρύψετε τη λέξη στην μπροστινή όψη από την οθόνη επεξεργασίας της λέξης.',
    'Μπορείτε επίσης να προσθέσετε δικό σας ηχητικό αρχείο.',
    'Ρυθμίστε ειδοποιήσεις από το εικονίδιο ειδοποιήσεων για αυτόματη επανάληψη των λέξεων.',
    'Οι κάρτες λέξεων και οι φάκελοι επεξεργάζονται με σύρσιμο ή παρατεταμένο πάτημα.',
    'Αναβαθμίστε το πρόγραμμά σας για πάνω από 20 θέματα και φωνές AI υψηλής ποιότητας.',
    'Πατήστε το εικονίδιο με τις τρεις τελείες πάνω δεξιά για αναδιάταξη ή διαγραφή καρτών.',
  ],
  'sv-SE': [
    'Testa dina ord med studentmösse-ikonen uppe till höger.',
    'Tryck på ett kort för att se dess betydelse.',
    'Du kan dölja ordet på framsidan från ordets redigeringsvy.',
    'Du kan även lägga till eget ljud.',
    'Ställ in aviseringar med aviseringsikonen för att repetera orden automatiskt.',
    'Ordkort och mappar redigerar du genom att svepa eller hålla in dem.',
    'Uppgradera din plan för över 20 teman och AI-röster med hög kvalitet.',
    'Tryck på ikonen med tre punkter uppe till höger för att ordna om eller ta bort kort.',
  ],
};

/**
 * Every id onboarding owns.
 *
 * The whole list is removed and rebuilt when onboarding completes, so it must
 * cover the largest set the builder can return — the eight cards of Language
 * Learning. Vocabulary & Terms returns four of the same ids, and the four it
 * leaves out are cleared by the same filter rather than lingering from the seed.
 */
export const WELCOME_CARD_IDS: string[] = [
  'wp-w1', 'wp-w2', 'wp-w3', 'wp-w4', 'wp-w5', 'wp-w6', 'wp-w7', 'wp-w8',
];

export function buildWelcomeCards(choices: OnboardingChoices): WordCard[] {
  // Language Learning: eight cards, front = learn lang, back = explanation lang,
  // both sides carrying the same instruction.
  // Vocabulary & Terms: four cards, both sides in the explanation language, each
  // card pairing two consecutive instructions.
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
    return [0, 1, 2, 3].map(i => ({
      id:          WELCOME_CARD_IDS[i],
      createdAt:   i + 1,
      word:        meaningTexts[i * 2],
      meaning:     meaningTexts[i * 2 + 1],
      note:        '',
      wordLang:    meaningLang,
      meaningLang,
      folderId:    WELCOME_FOLDER_ID,
    }));
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
