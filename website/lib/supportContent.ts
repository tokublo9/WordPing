import {
  LEGAL_EFFECTIVE_DATE_EN,
  LEGAL_EFFECTIVE_DATE_JA,
  LEGAL_EMAIL,
  type LegalDocument,
  type LegalLocale,
} from './legalContent';

/**
 * The public Support page.
 *
 * Reuses `LegalDocument` — heading, paragraphs, bullets — so the page renders
 * through the same view as Privacy and Terms and inherits its layout, contents
 * sidebar, typography, dark mode and responsive behaviour without a second
 * design to maintain.
 *
 * The contact address is imported from `legalContent`, never written again
 * here: it is the address already published on the Privacy and Terms pages and
 * used by the app's own Contact link, so there is exactly one to keep correct.
 *
 * Written to describe what the app does rather than what any one plan includes
 * down to the number, so a pricing or allowance change does not silently make
 * this page wrong. The in-app Upgrade screen is the authority on what a plan
 * currently includes, and this page says so.
 */

export const supportDocuments: Record<LegalLocale, LegalDocument> = {
  en: {
    title: 'WordCore Support',
    description:
      'Help with WordCore: adding and reviewing words, notifications, AI Voice, subscriptions, individual theme purchases, restoring purchases, and how to contact support.',
    effectiveDateLabel: 'Last updated',
    effectiveDate: LEGAL_EFFECTIVE_DATE_EN,
    introduction: [
      'WordCore is a vocabulary app for iPhone and iPad. You add the words you want to learn, review them with flip cards and a multiple-choice test, and receive reminder notifications through the day so the words come back to you rather than waiting to be looked up.',
      'Your vocabulary is stored on your device. There is no account and no sign-in, and nothing is uploaded automatically — which also means this page needs no login to read, and neither does anything it describes.',
      `If something here does not answer your question, email ${LEGAL_EMAIL} and include your device model and iOS version.`,
    ],
    sections: [
      {
        heading: 'Adding, editing and deleting words',
        paragraphs: [
          'Words live inside folders. Open a folder to see its list, and use the add button to create a word.',
        ],
        bullets: [
          'Add: tap the add button in a folder. Enter the word and its meaning; a note is optional. You can set the language used to read each field aloud, and attach your own audio recording on a paid plan.',
          'Edit: tap a word to open it, or swipe the row to reveal the edit action.',
          'Delete: swipe the row and choose delete, or press and hold a row for the same actions. To remove several at once, use Select from the three-dots menu and then delete.',
          'Move to another folder: open the word and use Move, under the Note field.',
          'Reorder: choose Reorder cards from the three-dots menu and drag rows into the order you want.',
        ],
      },
      {
        heading: 'Importing several words at once',
        paragraphs: [
          'Bulk Import is in the header of the Add Word screen. Paste or type one entry per line and import them into the folder you choose.',
          'Duplicates already in that folder are skipped rather than added twice, and the import reports how many words were added and how many were skipped.',
        ],
      },
      {
        heading: 'Reviewing your words',
        bullets: [
          'Flip Mode: swipe through your cards one at a time and tap a card to turn it over.',
          'Test Mode: answer multiple-choice questions. Rate how well you knew each word and WordCore schedules it to come back sooner or later accordingly.',
          'Your progress and streak are shown in the analytics view on the Test screen.',
        ],
      },
      {
        heading: 'Notifications and troubleshooting',
        paragraphs: [
          'Notifications are set per folder. Open a folder, choose Notification from the three-dots menu, and pick an interval.',
          'Notifications are opt-in per word. A newly added word is not sent until you put it on the list, so if reminders are not arriving this is the most common reason.',
        ],
        bullets: [
          'Add a word to the list from the Add/Edit screen (“Add to Notifications”), the bell in Flip Mode, or the selection bar.',
          'Or turn on “Notify All Words” in the Notification screen to use every word in that folder.',
          'If the folder has no words on its list and “Notify All Words” is off, nothing is scheduled and the Notification screen says so.',
          'Check that notifications are allowed for WordCore in iOS Settings → Notifications, and that Focus or Do Not Disturb is not silencing them.',
          'Check that the folder’s interval is not set to Off.',
          'Use Send Test in the Notification screen to confirm delivery immediately.',
          'iOS limits how many notifications an app can schedule in advance, so reminders are spread across the folders that have an interval set.',
        ],
      },
      {
        heading: 'AI Voice and troubleshooting',
        paragraphs: [
          'Every plan can hear words read aloud. On the free plan this uses the voice built into your device. Paid plans add the high-quality AI voice, which is generated online and then cached on your device.',
          'Because generated audio is cached, playing the same word again works without a connection and without generating it a second time.',
        ],
        bullets: [
          'No sound at all: check the ring/silent switch and the volume, and that the word has text to read.',
          'The voice sounds like the standard device voice: the high-quality voice needs a paid plan and a connection. When it is unavailable the button falls back to the device voice rather than failing, so playback never goes dead.',
          '“Please try again later” or a service message: the AI service could not be reached. Check your connection and try again; your words and any audio already saved are unaffected.',
          'Just subscribed and the voice has not changed: use Restore Purchases (below), then reopen the app.',
          'To choose a voice, open Settings → Natural AI Voice. Changing the voice regenerates audio in the new voice in the background.',
          'To use your own recording for a word instead, attach audio in the Add/Edit screen. Attached audio is stored on your device and plays without a connection.',
        ],
      },
      {
        heading: 'Subscriptions and individual theme purchases',
        paragraphs: [
          'WordCore offers two subscriptions, Basic and Premium. Both unlock the paid themes and colours and the paid word-card voice features; Premium additionally includes the unrestricted high-quality AI voice and backup export and import. The Upgrade screen inside the app always shows what each plan currently includes, along with the price in your own currency as set by the App Store.',
          'Themes can also be bought individually. An individual theme is a one-time, non-consumable purchase — you pay once and it is yours permanently. It is not a subscription and it does not renew.',
          'A theme you bought individually stays available after a subscription ends. If you cancel Basic or Premium, the themes covered only by the subscription are locked again, but any theme you purchased outright remains usable and can still be applied.',
          'Prices are shown in your local currency exactly as the App Store reports them. Subscriptions are billed by Apple to your Apple Account and renew until cancelled; you can manage or cancel them in iOS Settings → your name → Subscriptions.',
        ],
      },
      {
        heading: 'Restoring purchases',
        paragraphs: [
          'If you reinstall WordCore, get a new device, or a purchase does not appear, restore it from inside the app.',
        ],
        bullets: [
          'Open Settings → App Info → Purchases → Restore Purchases.',
          'Restoring works for both subscriptions and individually purchased themes.',
          'Use the same Apple Account that made the original purchase — purchases cannot be moved between Apple Accounts.',
          'Restoring never affects your saved words, folders or progress.',
        ],
      },
      {
        heading: 'Your data and backups',
        bullets: [
          'Your words, folders, notes and progress are stored on your device. There is no account, and nothing is uploaded automatically.',
          'Because data is stored on the device, deleting the app deletes your vocabulary. Export a backup first if you want to keep it.',
          'Backup export and import are available on Premium, in Settings → Backup. A backup is a file you save yourself, and importing one can replace your current data, so the app asks you to confirm.',
        ],
      },
      {
        heading: 'Frequently asked questions',
        bullets: [
          'Do I need an account? No. WordCore has no sign-in, and your vocabulary never leaves the device except in a backup file you export yourself.',
          'Does WordCore work offline? Yes. Adding, editing, reviewing and notifications all work without a connection. Only generating new AI voice audio needs one; audio already cached plays offline.',
          'Why is a word not appearing in notifications? It has to be on that folder’s notification list, or the folder needs “Notify All Words” turned on. See the notifications section above.',
          'Can I use WordCore on more than one device? Yes, but vocabulary is stored per device and is not synced. Move it with a backup export and import. Purchases follow your Apple Account and can be restored on each device.',
          'How do I cancel a subscription? In iOS Settings → your name → Subscriptions. Cancelling stops future renewals; access continues until the current period ends.',
          'How do I get a refund? Refunds are handled by Apple, not by WordCore. Use reportaproblem.apple.com.',
          'Is my data used to train AI models? No. See the Privacy Policy for what is sent when you use an AI feature, and how to withdraw that permission in the app.',
        ],
      },
      {
        heading: 'Contact support',
        paragraphs: [
          `Email ${LEGAL_EMAIL}. Please include your device model, your iOS version, and what you were doing when the problem happened — that is usually enough to identify it without any further back and forth.`,
          'Support is provided in English and Japanese. Purchases, billing and refunds are handled by Apple; for those, use reportaproblem.apple.com.',
          'The Privacy Policy and Terms of Use are linked at the top of this page.',
        ],
      },
    ],
  },
  ja: {
    title: 'WordCore サポート',
    description:
      'WordCore のヘルプ: 単語の追加・復習、通知、AIボイス、サブスクリプション、テーマの個別購入、購入の復元、お問い合わせ方法について。',
    effectiveDateLabel: '最終更新',
    effectiveDate: LEGAL_EFFECTIVE_DATE_JA,
    introduction: [
      'WordCore は iPhone・iPad 向けの単語学習アプリです。覚えたい単語を登録し、めくるカードと選択式テストで復習し、1日を通してリマインダー通知を受け取ることで、調べて終わりにせず記憶に残していけます。',
      '単語データは端末内に保存されます。アカウント登録もログインもなく、自動でアップロードされることはありません。このページの閲覧にもログインは不要です。',
      `このページで解決しない場合は ${LEGAL_EMAIL} までメールでお問い合わせください。端末の機種と iOS のバージョンを添えていただけると助かります。`,
    ],
    sections: [
      {
        heading: '単語の追加・編集・削除',
        paragraphs: ['単語はフォルダーの中に保存されます。フォルダーを開くと単語一覧が表示されます。'],
        bullets: [
          '追加: フォルダー内の追加ボタンから、単語と意味を入力します（メモは任意）。読み上げに使う言語の指定や、有料プランでのオリジナル音声の添付もできます。',
          '編集: 単語をタップして開くか、行を横にスワイプして編集ボタンを表示します。',
          '削除: 行をスワイプして削除するか、長押しして同じ操作を選びます。複数まとめて削除する場合は、3点メニューの「選択」から行います。',
          '別のフォルダーへ移動: 単語を開き、メモ欄の下の「移動」から変更します。',
          '並べ替え: 3点メニューの「カードの並べ替え」からドラッグして順序を変更します。',
        ],
      },
      {
        heading: 'まとめて登録する（一括インポート）',
        paragraphs: [
          '「単語を追加」画面のヘッダーに一括インポートがあります。1行につき1件の形式で貼り付け、登録先のフォルダーを選んでインポートします。',
          '同じフォルダー内にすでにある単語は重複登録されず、追加件数とスキップ件数が結果として表示されます。',
        ],
      },
      {
        heading: '復習する',
        bullets: [
          'めくるモード: カードを1枚ずつスワイプし、タップして裏返します。',
          'テストモード: 選択式で解答し、理解度を選ぶと、その結果に応じて次に出題される間隔が調整されます。',
          '学習の記録と連続日数は、テスト画面の分析ビューで確認できます。',
        ],
      },
      {
        heading: '通知と、届かないときの確認',
        paragraphs: [
          '通知はフォルダーごとに設定します。フォルダーを開き、3点メニューの「通知」から間隔を選びます。',
          '通知は単語ごとのオプトインです。新しく登録した単語は、通知リストに追加するまで送信されません。通知が届かない場合、これが最も多い原因です。',
        ],
        bullets: [
          '追加/編集画面の「通知に追加」、めくるモードのベル、または選択バーから通知リストに追加できます。',
          'または通知画面の「すべての単語を通知」をオンにすると、そのフォルダーの全単語が対象になります。',
          '通知リストが空で「すべての単語を通知」もオフの場合は何も送信されず、通知画面にその旨が表示されます。',
          'iOS の設定 → 通知 で WordCore の通知が許可されているか、集中モードやおやすみモードで消音されていないかをご確認ください。',
          'フォルダーの間隔が「オフ」になっていないかご確認ください。',
          '通知画面の「テスト送信」で、その場で配信を確認できます。',
          'iOS には事前に予約できる通知数の上限があるため、間隔が設定されたフォルダー間で配分されます。',
        ],
      },
      {
        heading: 'AIボイスと、うまく動かないときの確認',
        paragraphs: [
          '読み上げはすべてのプランでご利用いただけます。無料プランでは端末内蔵の音声を使用します。有料プランでは、オンラインで生成され端末にキャッシュされる高品質なAIボイスが追加されます。',
          '生成した音声は端末にキャッシュされるため、同じ単語の再生はオフラインでも、再生成なしで動作します。',
        ],
        bullets: [
          'まったく音が出ない: 消音スイッチと音量、単語に読み上げるテキストがあるかをご確認ください。',
          '端末の標準音声に聞こえる: 高品質な音声には有料プランと通信が必要です。利用できないときは端末の音声に自動的に切り替わるため、再生自体が止まることはありません。',
          '「しばらくしてからお試しください」と表示される: AIサービスに接続できませんでした。通信環境をご確認のうえ再度お試しください。単語や保存済みの音声には影響しません。',
          '購入直後に音声が変わらない: 下記の「購入の復元」を実行し、アプリを開き直してください。',
          '音声の種類は 設定 → ナチュラルAIボイス から選べます。変更すると、新しい音声での生成がバックグラウンドで行われます。',
          '自分で録音した音声を使う場合は、追加/編集画面から音声を添付してください。添付した音声は端末に保存され、通信なしで再生できます。',
        ],
      },
      {
        heading: 'サブスクリプションとテーマの個別購入',
        paragraphs: [
          'WordCore にはベーシックとプレミアムの2つのサブスクリプションがあります。どちらも有料テーマとカラー、単語カードの有料音声機能をご利用いただけます。プレミアムではさらに、制限のない高品質AIボイスと、バックアップの書き出し・読み込みが利用できます。各プランに含まれる内容と、App Store が定めるお客様の通貨での価格は、アプリ内のアップグレード画面に常に表示されます。',
          'テーマは個別に購入することもできます。個別購入は一度きりの非消耗型（Non-Consumable）購入です。一度お支払いいただければ永続的にご利用いただけ、サブスクリプションのように更新されることはありません。',
          '個別購入したテーマは、サブスクリプション終了後もご利用いただけます。ベーシックまたはプレミアムを解約した場合、サブスクリプションのみで利用していたテーマは再びロックされますが、買い切りで購入したテーマは引き続き適用できます。',
          '価格は App Store が返す、お客様の地域の通貨で表示されます。サブスクリプションは Apple アカウントに課金され、解約するまで自動更新されます。管理・解約は iOS の設定 → お客様の名前 → サブスクリプション から行えます。',
        ],
      },
      {
        heading: '購入を復元する',
        paragraphs: ['再インストールした場合、端末を買い替えた場合、購入が反映されない場合は、アプリ内から復元してください。'],
        bullets: [
          '設定 → アプリ情報 → 購入 → 購入を復元 の順に開きます。',
          'サブスクリプションと個別購入したテーマの両方が復元されます。',
          '購入時と同じ Apple アカウントをご使用ください。購入を別のアカウントへ移すことはできません。',
          '復元しても、保存済みの単語・フォルダー・学習記録には影響しません。',
        ],
      },
      {
        heading: 'データとバックアップ',
        bullets: [
          '単語・フォルダー・メモ・学習記録は端末内に保存されます。アカウントはなく、自動でアップロードされることもありません。',
          '端末内に保存されるため、アプリを削除すると単語データも削除されます。残しておきたい場合は、事前にバックアップを書き出してください。',
          'バックアップの書き出しと読み込みはプレミアムでご利用いただけます（設定 → バックアップ）。バックアップはお客様自身が保存するファイルです。読み込むと現在のデータを置き換える場合があるため、確認が表示されます。',
        ],
      },
      {
        heading: 'よくあるご質問',
        bullets: [
          'アカウントは必要ですか: 必要ありません。ログインはなく、単語データはご自身で書き出したバックアップファイル以外で端末外に出ることはありません。',
          'オフラインでも使えますか: はい。登録・編集・復習・通知はすべて通信なしで動作します。通信が必要なのは新しいAI音声の生成のみで、キャッシュ済みの音声はオフラインで再生できます。',
          '特定の単語が通知されないのはなぜですか: そのフォルダーの通知リストに追加されているか、「すべての単語を通知」がオンになっている必要があります。上記の通知の項目をご確認ください。',
          '複数の端末で使えますか: ご利用いただけますが、単語データは端末ごとに保存され同期されません。バックアップの書き出しと読み込みで移行してください。購入は Apple アカウントに紐づくため、各端末で復元できます。',
          '解約方法を教えてください: iOS の設定 → お客様の名前 → サブスクリプション から行えます。解約後も、契約期間の終了までご利用いただけます。',
          '返金について: 返金は WordCore ではなく Apple が対応します。reportaproblem.apple.com をご利用ください。',
          'データはAIの学習に使われますか: いいえ。AI機能の利用時に送信される内容と、アプリ内で許可を取り消す方法については、プライバシーポリシーをご覧ください。',
        ],
      },
      {
        heading: 'お問い合わせ',
        paragraphs: [
          `${LEGAL_EMAIL} までメールでお問い合わせください。端末の機種、iOS のバージョン、問題が発生したときの操作を記載いただけると、やり取りを重ねずに原因を特定しやすくなります。`,
          '対応言語は日本語と英語です。購入・請求・返金は Apple が対応します。reportaproblem.apple.com をご利用ください。',
          'プライバシーポリシーと利用規約は、このページ上部からご確認いただけます。',
        ],
      },
    ],
  },
};
