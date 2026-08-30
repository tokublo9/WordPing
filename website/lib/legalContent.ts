export const LEGAL_OPERATOR = 'Daiki Tokumoto';
export const LEGAL_EMAIL = 'daiki.studio9@gmail.com';
export const LEGAL_EFFECTIVE_DATE_EN = 'August 20, 2026';
export const LEGAL_EFFECTIVE_DATE_JA = '2026年8月20日';

export type LegalLocale = 'en' | 'ja';
export type LegalSlug = 'privacy' | 'terms' | 'licenses';

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  description: string;
  effectiveDateLabel: string;
  effectiveDate: string;
  introduction: string[];
  sections: LegalSection[];
}

export interface ServiceDisclosure {
  name: string;
  purpose: string;
  information: string;
  policyUrl: string;
}

export const serviceDisclosures: Record<LegalLocale, ServiceDisclosure[]> = {
  en: [
    {
      name: 'Apple / App Store',
      purpose: 'App distribution, in-app purchase processing, subscription management, refunds, and device-level services such as local notifications.',
      information: 'Apple processes purchase, subscription, device, and account information under its own terms and privacy policy. WordPing does not receive complete payment-card details.',
      policyUrl: 'https://www.apple.com/legal/privacy/',
    },
    {
      name: 'RevenueCat',
      purpose: 'Subscription purchase orchestration, restoration, and verification of Basic and Premium entitlements.',
      information: 'A pseudonymous RevenueCat App User ID, app and device information, purchase receipts, product identifiers, and subscription status may be processed.',
      policyUrl: 'https://www.revenuecat.com/privacy/',
    },
    {
      name: 'Cloudflare',
      purpose: 'Hosting and protecting the WordPing API Worker, storing short-lived entitlement and abuse-prevention counters, and caching shared promotional voice clips.',
      information: 'Network information such as IP address, request metadata, pseudonymous salted hashes, request counters, entitlement tier cache entries, and operational logs may be processed. User text and authorization credentials are excluded from WordPing application logs.',
      policyUrl: 'https://www.cloudflare.com/privacypolicy/',
    },
    {
      name: 'OpenAI',
      purpose: 'Generating High-Quality AI Voice audio and any other server-assisted AI output that WordPing makes available.',
      information: 'The text submitted for generation and generation settings such as voice or language are sent through the WordPing API Worker. Pseudonymous WordPing identifiers are not intentionally included in the prompt sent to OpenAI.',
      policyUrl: 'https://openai.com/policies/privacy-policy/',
    },
    {
      name: 'Vercel',
      purpose: 'Hosting and delivering the WordPing public website and these legal pages.',
      information: 'IP address, browser and device information, requested URL, timestamps, and security or delivery logs may be processed when the website is visited.',
      policyUrl: 'https://vercel.com/legal/privacy-policy',
    },
  ],
  ja: [
    {
      name: 'Apple / App Store',
      purpose: 'アプリの配信、アプリ内購入の決済、サブスクリプション管理、返金、およびローカル通知等の端末機能の提供。',
      information: 'Appleは、同社の利用規約およびプライバシーポリシーに基づき、購入、サブスクリプション、端末およびアカウントに関する情報を取り扱います。WordPingがクレジットカード番号等の完全な決済情報を取得することはありません。',
      policyUrl: 'https://www.apple.com/jp/legal/privacy/',
    },
    {
      name: 'RevenueCat',
      purpose: 'サブスクリプション購入処理の補助、購入の復元、ならびにBasicおよびPremiumの利用資格の確認。',
      information: '仮名化されたRevenueCat App User ID、アプリ・端末情報、購入レシート、商品識別子およびサブスクリプション状態が取り扱われる場合があります。',
      policyUrl: 'https://www.revenuecat.com/privacy/',
    },
    {
      name: 'Cloudflare',
      purpose: 'WordPing API Workerのホスティングおよび保護、短期間の利用資格・不正利用防止カウンターの保存、ならびに共通のプロモーション音声のキャッシュ。',
      information: 'IPアドレス等のネットワーク情報、リクエストのメタデータ、ソルト付きハッシュによる仮名識別子、利用回数、利用資格の一時キャッシュおよび運用ログが取り扱われる場合があります。利用者が入力したテキストおよび認証情報は、WordPingのアプリケーションログには記録しない設計です。',
      policyUrl: 'https://www.cloudflare.com/ja-jp/privacypolicy/',
    },
    {
      name: 'OpenAI',
      purpose: '高品質AI音声、およびWordPingが提供するその他のサーバー経由AI出力の生成。',
      information: '生成対象として送信されたテキストと、音声・言語等の生成設定がWordPing API Workerを経由して送信されます。WordPingの仮名識別子をOpenAIへのプロンプトに意図的に含めることはありません。',
      policyUrl: 'https://openai.com/ja-JP/policies/privacy-policy/',
    },
    {
      name: 'Vercel',
      purpose: 'WordPing公式ウェブサイトおよび本リーガルページのホスティングと配信。',
      information: 'ウェブサイト閲覧時に、IPアドレス、ブラウザ・端末情報、閲覧URL、時刻およびセキュリティ・配信ログが取り扱われる場合があります。',
      policyUrl: 'https://vercel.com/legal/privacy-policy',
    },
  ],
};

export const privacyDocuments: Record<LegalLocale, LegalDocument> = {
  en: {
    title: 'Privacy Policy',
    description: 'How WordPing handles information in the iOS app and on the WordPing website.',
    effectiveDateLabel: 'Effective date',
    effectiveDate: LEGAL_EFFECTIVE_DATE_EN,
    introduction: [
      `This Privacy Policy explains how ${LEGAL_OPERATOR} (the “Operator,” “we,” “us,” or “our”) handles information in connection with the WordPing iOS application, the WordPing website, and related API services (collectively, “WordPing”).`,
      'WordPing is designed as a local-first vocabulary application. Most learning content stays on the user’s device. Information is sent to external services only when needed for a feature the user invokes, subscription verification, security, or delivery of the website.',
    ],
    sections: [
      {
        heading: '1. Information stored on your device',
        paragraphs: ['WordPing may store the following information locally on your device:'],
        bullets: [
          'Vocabulary entries, meanings, notes, folders, labels, learning progress, review history, card-visibility times, and notification preferences.',
          'App settings such as language, appearance, theme, selected AI voice, onboarding choices, and display preferences.',
          'Audio files that you attach and AI-generated audio cached for faster playback. Cached files may be removed by the operating system or when the app is removed.',
          'A randomly generated installation identifier stored in the iOS Keychain. It is not an advertising identifier and is used for abuse prevention and rate limiting.',
          'Locally scheduled notification content. Vocabulary reminders are scheduled on the device; WordPing does not operate a remote push-notification account system.',
        ],
      },
      {
        heading: '2. Information processed when you use online features',
        bullets: [
          'AI generation requests, and only after you have granted permission in the app (see section 3): text submitted for High-Quality AI Voice or another available server-assisted AI feature; requested language, voice, and generation settings; a random installation identifier; a pseudonymous RevenueCat App User ID; subscription tier; and request metadata such as endpoint, status, timing, input length, and request ID. The promotional clips in the Upgrade screen are the single exception and are described in section 3: they send none of this, including neither identifier.',
          'Subscription information: product identifiers, purchase and renewal status, entitlement status, and pseudonymous customer identifiers provided by Apple and RevenueCat. Complete payment-card details are not provided to WordPing.',
          'Support communications: your email address and any information you include when you contact support.',
          'Website information: IP address, browser and device information, requested pages, timestamps, and security or delivery logs ordinarily processed by the hosting provider.',
        ],
      },
      {
        heading: '3. AI features and your permission',
        paragraphs: [
          'WordPing’s AI features are provided using OpenAI. When you use one, the request is sent from your device to the WordPing API Worker, which runs on Cloudflare, and the Worker forwards the generation request to OpenAI’s API. WordPing has no other AI provider.',
          'WordPing asks for your permission in the app before the first such request, and sends nothing to OpenAI unless you grant it. Granting permission is a separate, explicit choice: accepting the Terms of Service, completing onboarding, or subscribing does not grant it, and an app update does not grant it for existing users. If you dismiss the request without answering, nothing is sent and you are asked again the next time you use an AI feature.',
        ],
        bullets: [
          'What is sent to OpenAI: the word or text you submit to an AI feature, together with the language, voice and output format that feature uses. For High-Quality AI Voice, this is the text of the card you asked to hear. Nothing else from your vocabulary, and no identifier, is included in the request to OpenAI.',
          'What the WordPing API Worker additionally receives: a randomly generated installation identifier stored in your device’s Keychain, and your pseudonymous RevenueCat App User ID. They are used to verify your subscription tier and to apply abuse-prevention and usage limits. They are not forwarded to OpenAI.',
          'What the Worker does with the request: it verifies your entitlement with RevenueCat, applies rate and usage limits, and passes the generation request to OpenAI. Generated audio is streamed back to your device without being stored on the Worker. Submitted text is not written to the Worker’s application logs or to its key-value store; those logs record only non-content values such as the endpoint, status, request ID, timing, input length, selected voice and format. Cloudflare processes network-level information, including your IP address, as part of delivering and protecting the service; WordPing uses the IP address only to derive a salted hash for rate-limit counters and does not log or store it.',
          'Voice previews in the voice picker are a subscriber feature and are covered by your permission like any other AI request, even though the sentence they speak is written by WordPing rather than by you.',
          'The promotional clips in the Upgrade screen are the one exception, and are available without permission and without a subscription. Their request carries no text field and no voice field: the app sends only which of two fixed WordPing-authored samples to play, a language code that selects one of a fixed set of WordPing translations, and a build version used to refresh the shared cache. It carries none of your vocabulary and neither of the identifiers described above — no installation identifier and no RevenueCat App User ID — and the app does not create an installation identifier in order to play one. The clips are generated once and cached on our Worker for all users, so playing one ordinarily reaches the cache rather than OpenAI. Playing one does not grant AI data-sharing permission and does not enable any other AI feature.',
          'On-device speech is not an AI feature in this sense: free-plan pronunciation uses your device’s built-in text-to-speech, and an audio file you attach to a card is played locally. Neither is sent anywhere, and both keep working if you do not grant permission.',
        ],
      },
      {
        heading: '4. Withdrawing your permission',
        paragraphs: [
          'You can withdraw permission at any time in the app under Settings → Privacy → AI Data Sharing. The setting shows the current state and can be switched off there.',
          'Withdrawing takes effect immediately: WordPing stops sending anything for AI features from that point, including background preparation of audio for words you already have. It does not delete any of your data — your words, folders, notes, notification settings and previously generated audio already stored on your device are untouched — and it does not affect any non-AI feature. If you later use an AI feature again, WordPing asks for permission again rather than resuming silently.',
          'Because generation is only performed while permission is granted, withdrawing it does not, by itself, cause deletion of anything OpenAI may hold under its own retention practices. Requests already completed were governed by OpenAI’s terms and privacy policy at the time they were made.',
        ],
      },
      {
        heading: '5. Backup and data transfer',
        paragraphs: [
          'Backup & Restore is a Premium feature that creates a file on the device at the user’s request. The user chooses whether and where to share or store that file. WordPing does not automatically upload or retain a server copy.',
          'A backup may contain vocabulary, meanings, notes, folders, labels, learning progress, review history, visibility timestamps, notification settings, and transferable app preferences. It excludes device-local audio files, installation identifiers, RevenueCat identifiers, credentials, and purchase entitlements. Anyone who receives a backup file may be able to read its contents, so users should store and share it carefully.',
        ],
      },
      {
        heading: '6. How we use information',
        bullets: [
          'To provide vocabulary study, local reminders, backup and restore, subscription features, and requested AI-generated output.',
          'To authenticate paid entitlements, apply the Basic monthly AI Voice allowance, and restore purchases.',
          'To prevent abuse, enforce request and usage limits, diagnose failures, protect service availability, and control operating costs.',
          'To respond to support requests and legal obligations.',
          'To operate, secure, and improve the WordPing app and website.',
        ],
      },
      {
        heading: '7. Third-party services and disclosure',
        paragraphs: [
          'WordPing uses the service providers listed below. Information is disclosed only as reasonably necessary for their stated functions, to comply with law, to protect rights and safety, or in connection with a lawful business transfer. Their own terms and privacy policies govern their processing.',
          'WordPing does not sell personal information, does not use third-party advertising SDKs, and does not use third-party analytics SDKs in the current release.',
        ],
      },
      {
        heading: '8. Retention',
        bullets: [
          'Device data remains until you delete it, clear relevant content, remove the app, or the operating system removes cache files.',
          'The WordPing API does not intentionally place submitted user text in application logs or the Worker KV store. It is transmitted to the relevant AI provider to fulfill the request.',
          'Entitlement cache entries are generally retained for approximately 30 seconds to 5 minutes. Minute rate-limit counters are generally retained for up to 2 minutes, and daily counters for up to 48 hours.',
          'Basic monthly-usage counters use a salted hash of the RevenueCat App User ID and expire after the relevant UTC monthly quota period and a limited operational buffer.',
          'Shared voice-preview and promotional audio caches may be retained for approximately 30 days. These shared clips contain fixed WordPing-authored text, not user-submitted text.',
          'Operational logs and support communications are retained only for as long as reasonably necessary for security, troubleshooting, support, legal compliance, and dispute handling, subject to provider settings and legal obligations.',
        ],
      },
      {
        heading: '9. Website storage',
        paragraphs: [
          'The website uses necessary local browser storage to remember light or dark theme and may use a functional locale cookie to remember language routing. The current website does not use advertising or third-party analytics cookies.',
        ],
      },
      {
        heading: '10. Security',
        paragraphs: [
          'We use reasonable technical and organizational safeguards, including encrypted network transport, server-side secret storage, input limits, pseudonymous salted identifiers for server counters, restricted logging, and device Keychain storage for the installation identifier. No system is completely secure, and users should protect their devices and backup files.',
        ],
      },
      {
        heading: '11. International processing',
        paragraphs: [
          'WordPing’s providers may process information in Japan, the United States, and other countries where they operate. Those countries may have different data-protection laws. We use providers and safeguards reasonably appropriate to the services being supplied.',
        ],
      },
      {
        heading: '12. Your choices and rights',
        bullets: [
          'You can edit or delete vocabulary and other local content in the app and can remove local app data by deleting the app, subject to iOS behavior and any backup copies you created.',
          'You can decline notification permission or disable notifications in iOS Settings.',
          'You can decline AI data sharing when asked, and can withdraw permission at any time under Settings → Privacy → AI Data Sharing. See sections 3 and 4.',
          'You can manage or cancel subscriptions through your Apple account settings.',
          `To request access, correction, deletion, restriction, objection, or information about personal data handled by the Operator, contact ${LEGAL_EMAIL}. Applicable rights vary by jurisdiction. We may need to verify the request and may retain information where legally permitted or required.`,
        ],
      },
      {
        heading: '13. Children',
        paragraphs: [
          `WordPing does not knowingly request a child’s name, address, or direct contact information through an account-registration system. If a parent or guardian believes a child has sent personal information to the Operator, please contact ${LEGAL_EMAIL}.`,
        ],
      },
      {
        heading: '14. Changes to this policy',
        paragraphs: [
          'We may update this Privacy Policy to reflect changes in WordPing, service providers, law, or operating practices. The updated policy will be posted on this page with a revised effective date. Where legally required, additional notice or consent will be provided.',
        ],
      },
      {
        heading: '15. Contact',
        paragraphs: [
          `Operator: ${LEGAL_OPERATOR}`,
          `Privacy and support email: ${LEGAL_EMAIL}`,
        ],
      },
    ],
  },
  ja: {
    title: 'プライバシーポリシー',
    description: 'WordPing iOSアプリおよび公式ウェブサイトにおける情報の取扱いについて説明します。',
    effectiveDateLabel: '施行日',
    effectiveDate: LEGAL_EFFECTIVE_DATE_JA,
    introduction: [
      `本プライバシーポリシーは、${LEGAL_OPERATOR}（以下「運営者」または「当方」といいます）が提供するWordPing iOSアプリ、WordPing公式ウェブサイトおよび関連APIサービス（総称して「WordPing」といいます）における情報の取扱いを定めるものです。`,
      'WordPingは、端末内での保存を基本とする単語学習アプリです。学習内容の大部分は利用者の端末内に保存されます。外部サービスへの情報送信は、利用者が実行した機能、サブスクリプションの確認、セキュリティ確保、またはウェブサイト配信に必要な場合に限って行われます。',
    ],
    sections: [
      {
        heading: '1. 端末内に保存される情報',
        paragraphs: ['WordPingは、次の情報を利用者の端末内に保存する場合があります。'],
        bullets: [
          '単語、意味、メモ、フォルダ、ラベル、学習進捗、復習履歴、カードの非表示期限、通知設定。',
          '言語、外観、テーマ、選択したAI音声、オンボーディングの選択内容、表示設定等のアプリ設定。',
          '利用者が添付した音声ファイル、および高速再生のため端末内にキャッシュされたAI生成音声。キャッシュはOSまたはアプリ削除により消去される場合があります。',
          'iOSキーチェーンに保存されるランダムなインストール識別子。この識別子は広告識別子ではなく、不正利用防止およびレート制限のために使用されます。',
          '端末内で予約される通知内容。単語リマインダーは端末上でローカルに予約され、WordPingはリモートプッシュ通知用のアカウントシステムを運用していません。',
        ],
      },
      {
        heading: '2. オンライン機能利用時に取り扱う情報',
        bullets: [
          'AI生成リクエスト（アプリ内で許可を与えた場合に限ります。第3項を参照）：高品質AI音声または提供中のその他のサーバー経由AI機能に送信されたテキスト、指定言語・音声・生成設定、ランダムなインストール識別子、仮名化されたRevenueCat App User ID、サブスクリプション区分、エンドポイント、ステータス、処理時間、入力文字数、リクエストID等のリクエスト情報。ただし、アップグレード画面のプロモーション音声のみは例外であり（第3項を参照）、上記のいずれも送信されません。前述の2種類の識別子も送信されません。',
          'サブスクリプション情報：AppleおよびRevenueCatから提供される商品識別子、購入・更新状態、利用資格、仮名化された顧客識別子。クレジットカード番号等の完全な決済情報がWordPingに提供されることはありません。',
          'サポート連絡：利用者のメールアドレス、および問い合わせ時に利用者が記載した情報。',
          'ウェブサイト情報：ホスティング事業者が通常取り扱うIPアドレス、ブラウザ・端末情報、閲覧ページ、時刻、セキュリティおよび配信ログ。',
        ],
      },
      {
        heading: '3. AI機能と利用者の許可',
        paragraphs: [
          'WordPingのAI機能は、OpenAIを利用して提供されます。AI機能を利用すると、リクエストは端末からCloudflare上で稼働するWordPing API Workerへ送信され、Workerが生成リクエストをOpenAIのAPIへ転送します。WordPingは、これ以外のAI事業者を利用していません。',
          'WordPingは、最初の当該リクエストの前にアプリ内で許可を求め、許可が与えられない限りOpenAIへ何も送信しません。この許可は独立した明示的な選択であり、利用規約への同意、オンボーディングの完了、サブスクリプションの購入によって与えられることはなく、アプリの更新によって既存の利用者に自動的に付与されることもありません。回答せずにダイアログを閉じた場合、データは送信されず、次にAI機能を利用する際にあらためて確認します。',
        ],
        bullets: [
          'OpenAIへ送信される情報：AI機能に入力した単語またはテキストと、当該機能が使用する言語、音声および出力形式。高品質AI音声の場合は、再生を指示したカードのテキストです。これ以外の単語データや識別子が、OpenAIへのリクエストに含まれることはありません。',
          'WordPing API Workerが追加で受け取る情報：端末のキーチェーンに保存されたランダムなインストール識別子、および仮名化されたRevenueCat App User ID。サブスクリプション区分の確認、不正利用防止および利用上限の適用に使用され、OpenAIへ転送されることはありません。',
          'Workerにおける取扱い：RevenueCatで利用資格を確認し、レート制限および利用上限を適用したうえで、生成リクエストをOpenAIへ渡します。生成された音声はWorkerに保存されることなく端末へ送出されます。送信されたテキストは、Workerのアプリケーションログおよびキーバリューストアには記録されません。ログに記録されるのは、エンドポイント、ステータス、リクエストID、処理時間、入力文字数、選択された音声および形式等、内容を含まない値のみです。Cloudflareは、サービスの提供および保護のため、IPアドレスを含むネットワーク情報を取り扱います。WordPingは、IPアドレスをレート制限用のソルト付きハッシュの生成にのみ使用し、記録または保存しません。',
          '音声選択画面のプレビューはサブスクリプション向けの機能であり、読み上げる文がWordPingの用意した固定テキストである場合も、他のAIリクエストと同様に利用者の許可の対象となります。',
          'アップグレード画面のプロモーション音声のみが例外であり、サブスクリプションおよび許可なしで再生できます。そのリクエストにはテキスト欄も音声欄も存在せず、アプリが送信するのは、WordPingが用意した2種類の固定サンプルのいずれを再生するかという指定、固定の翻訳一覧から1つを選ぶための言語コード、および共通キャッシュを更新するためのビルド版数のみです。利用者の単語データは含まれず、前述の識別子（インストール識別子およびRevenueCat App User ID）も送信されません。プロモーション音声の再生のためにインストール識別子を新たに作成することもありません。これらの音声は一度生成された後、全利用者共通のものとしてWorkerにキャッシュされるため、通常はOpenAIではなくキャッシュから配信されます。再生してもAIデータ共有の許可が与えられることはなく、他のAI機能が有効になることもありません。',
          '端末内での読み上げは、ここでいうAI機能には含まれません。無料プランの読み上げは端末内蔵の音声合成を使用し、カードに添付した音声ファイルは端末内で再生されます。いずれも外部へ送信されず、許可がない場合でもこれまでどおり利用できます。',
        ],
      },
      {
        heading: '4. 許可の取消し',
        paragraphs: [
          '許可は、アプリの「設定」→「プライバシー」→「AIデータ共有」からいつでも取り消せます。同設定では現在の状態を確認でき、その場でオフにできます。',
          '取消しは直ちに反映され、以後、登録済みの単語に対する音声の事前生成を含め、AI機能のためのデータ送信は行われません。取消しによってデータが削除されることはなく、単語、フォルダ、メモ、通知設定および既に端末内に保存されている生成済み音声は保持されます。AI機能以外の機能にも影響しません。その後あらためてAI機能を利用する場合は、自動的に再開するのではなく、再度許可を求めます。',
          '生成は許可が有効な間にのみ行われるため、許可の取消しそれ自体によって、OpenAIが自社の保存方針に基づき保持する情報が削除されるものではありません。既に完了したリクエストには、実行時点におけるOpenAIの利用規約およびプライバシーポリシーが適用されます。',
        ],
      },
      {
        heading: '5. バックアップおよびデータ移行',
        paragraphs: [
          'バックアップと復元はPremium機能であり、利用者の操作により端末上でファイルを作成します。保存先または共有先は利用者が選択します。WordPingがバックアップを自動的にアップロードしたり、サーバー上にコピーを保管したりすることはありません。',
          'バックアップには、単語、意味、メモ、フォルダ、ラベル、学習進捗、復習履歴、非表示期限、通知設定、および移行可能なアプリ設定が含まれる場合があります。端末内の音声ファイル、インストール識別子、RevenueCat識別子、認証情報および購入資格は含まれません。バックアップを受け取った者は内容を閲覧できる可能性があるため、安全な方法で保存・共有してください。',
        ],
      },
      {
        heading: '6. 利用目的',
        bullets: [
          '単語学習、ローカル通知、バックアップと復元、サブスクリプション機能、および利用者が要求したAI生成結果を提供するため。',
          '有料利用資格の確認、Basicの月間AI音声上限の適用、および購入の復元を行うため。',
          '不正利用の防止、リクエスト・利用上限の適用、障害調査、サービス可用性の保護、および運用費用の管理のため。',
          '問い合わせへの対応および法的義務の履行のため。',
          'WordPingアプリおよびウェブサイトの運営、保護および改善のため。',
        ],
      },
      {
        heading: '7. 外部サービスおよび第三者提供',
        paragraphs: [
          'WordPingは、下記の外部サービスを利用します。情報は、各サービスの機能提供に合理的に必要な範囲、法令遵守、権利・安全の保護、または適法な事業承継に必要な範囲でのみ提供されます。各事業者による取扱いには、各事業者の利用規約およびプライバシーポリシーが適用されます。',
          '現在のリリースにおいて、WordPingは個人情報を販売せず、第三者広告SDKおよび第三者分析SDKを使用していません。',
        ],
      },
      {
        heading: '8. 保存期間',
        bullets: [
          '端末内データは、利用者が削除・消去するまで、アプリを削除するまで、またはOSがキャッシュを削除するまで保存されます。',
          'WordPing APIは、利用者が送信したテキストをアプリケーションログまたはWorker KVへ意図的に保存しません。当該テキストは、リクエストを実行するために必要なAI事業者へ送信されます。',
          '利用資格のキャッシュは通常約30秒から5分、分単位のレート制限カウンターは通常最大2分、日単位のカウンターは通常最大48時間保存されます。',
          'Basicの月間利用回数は、RevenueCat App User IDのソルト付きハッシュを用いて記録され、対象となるUTC基準の月間上限期間および限定的な運用上の猶予期間の終了後に失効します。',
          '共通の音声プレビューおよびプロモーション音声キャッシュは、約30日保存される場合があります。これらはWordPingが固定した共通テキストであり、利用者が入力したテキストではありません。',
          '運用ログおよびサポート連絡は、セキュリティ、障害調査、サポート、法令遵守および紛争対応のため合理的に必要な期間に限り、各事業者の設定および法的義務に従って保存されます。',
        ],
      },
      {
        heading: '9. ウェブサイトの保存機能',
        paragraphs: [
          'ウェブサイトは、ライト・ダークテーマを記憶するために必要なブラウザのローカルストレージを利用し、言語ルーティングを記憶するための機能的なロケールCookieを使用する場合があります。現在のウェブサイトは、広告Cookieまたは第三者分析Cookieを使用していません。',
        ],
      },
      {
        heading: '10. 安全管理措置',
        paragraphs: [
          '当方は、通信の暗号化、サーバー秘密情報の分離保管、入力制限、サーバーカウンターにおけるソルト付き仮名識別子、ログ項目の制限、インストール識別子の端末キーチェーン保存等、合理的な技術上・組織上の安全管理措置を講じます。ただし、完全に安全なシステムは存在しないため、利用者も端末およびバックアップファイルを適切に管理してください。',
        ],
      },
      {
        heading: '11. 国外での取扱い',
        paragraphs: [
          'WordPingの外部事業者は、日本、米国その他当該事業者が事業を行う国で情報を取り扱う場合があります。これらの国では日本と異なる個人情報保護法制が適用される場合があります。当方は、提供されるサービスに照らして合理的に適切な事業者および保護措置を利用します。',
        ],
      },
      {
        heading: '12. 利用者の選択および権利',
        bullets: [
          'アプリ内で単語その他のローカルデータを編集・削除できます。また、利用者が作成したバックアップを除き、iOSの仕様に従ってアプリを削除することでローカルデータを削除できます。',
          '通知権限を許可しないこと、またはiOS設定で通知を無効にすることができます。',
          'AIデータ共有の許可を求められた際に拒否することができ、「設定」→「プライバシー」→「AIデータ共有」からいつでも許可を取り消せます。第3項および第4項を参照してください。',
          'Appleアカウントの設定からサブスクリプションを管理または解約できます。',
          `運営者が取り扱う個人情報について、開示、訂正、削除、利用制限、異議申立てまたは取扱いに関する説明を希望する場合は、${LEGAL_EMAIL}までご連絡ください。適用される権利は地域により異なります。本人確認をお願いする場合があり、法令上認められる場合または必要な場合には情報を保持することがあります。`,
        ],
      },
      {
        heading: '13. 子どもの情報',
        paragraphs: [
          `WordPingは、アカウント登録システムを通じて子どもの氏名、住所または直接の連絡先を故意に求めるものではありません。保護者が、子どもが運営者へ個人情報を送信したと考える場合は、${LEGAL_EMAIL}までご連絡ください。`,
        ],
      },
      {
        heading: '14. 本ポリシーの変更',
        paragraphs: [
          'WordPing、外部サービス、法令または運用方法の変更を反映するため、本ポリシーを変更する場合があります。変更後のポリシーは、改定後の施行日とともに本ページへ掲載します。法令上必要な場合は、追加の通知または同意取得を行います。',
        ],
      },
      {
        heading: '15. お問い合わせ先',
        paragraphs: [
          `運営者：${LEGAL_OPERATOR}`,
          `プライバシーおよびサポート窓口：${LEGAL_EMAIL}`,
        ],
      },
    ],
  },
};

export const termsDocuments: Record<LegalLocale, LegalDocument> = {
  en: {
    title: 'Terms of Service',
    description: 'Terms governing use of the WordPing iOS application, website, subscriptions, and AI services.',
    effectiveDateLabel: 'Effective date',
    effectiveDate: LEGAL_EFFECTIVE_DATE_EN,
    introduction: [
      `These Terms of Service (“Terms”) form an agreement between you and ${LEGAL_OPERATOR} (the “Operator,” “we,” “us,” or “our”) concerning your use of the WordPing iOS application, website, and related services (collectively, “WordPing”).`,
      'By downloading, accessing, purchasing, or using WordPing, you agree to these Terms. If you do not agree, do not use WordPing.',
    ],
    sections: [
      {
        heading: '1. Eligibility and authority',
        paragraphs: [
          'You must have the legal capacity to agree to these Terms. If applicable law requires consent from a parent, guardian, or other authorized person, you may use WordPing only with that consent. If you use WordPing for an organization, you represent that you have authority to bind that organization.',
        ],
      },
      {
        heading: '2. WordPing service',
        paragraphs: [
          'WordPing provides local vocabulary storage, study cards, review and visibility tools, local reminders, optional data transfer, subscription features, and certain AI-assisted audio or text functions. Features may vary by version, plan, device, region, language, and service availability.',
          'WordPing is a study aid. It does not guarantee learning results, accuracy, completeness, pronunciation, translation quality, or suitability for any academic, professional, medical, legal, financial, safety-critical, or other particular purpose.',
        ],
      },
      {
        heading: '3. Licence to use WordPing',
        paragraphs: [
          'Subject to these Terms and the applicable Apple terms, the Operator grants you a limited, personal, non-exclusive, non-transferable, non-sublicensable, revocable licence to use WordPing on Apple devices that you own or control for lawful personal use. No ownership interest in WordPing is transferred to you.',
          'Apple’s Licensed Application End User License Agreement applies to the extent required by the App Store and is incorporated where applicable. If these Terms conflict with mandatory Apple terms, the mandatory Apple terms control for that subject.',
        ],
      },
      {
        heading: '4. Your content and backups',
        paragraphs: [
          'You retain rights you have in vocabulary, notes, audio, and other content that you enter into WordPing (“User Content”). You grant the Operator and necessary service providers a limited right to process User Content only to provide features you request, secure and operate the service, and comply with law.',
          'You are responsible for ensuring that your User Content is lawful, that you have the necessary rights to use it, and that it does not violate another person’s rights. Do not submit confidential, regulated, or highly sensitive information to AI features unless you accept that it must be transmitted to the disclosed service providers.',
          'WordPing is local-first and does not maintain an automatic server backup of your vocabulary. Premium users may create a backup file and choose where to store or share it. You are responsible for maintaining appropriate backups and protecting exported files. The Operator is not responsible for data loss caused by device loss, deletion, operating-system behavior, failed transfers, corrupted files, or failure to maintain a usable backup, except to the extent liability cannot legally be excluded.',
        ],
      },
      {
        heading: '5. Plans, purchases, renewal, and cancellation',
        bullets: [
          'Paid subscriptions are offered through Apple’s App Store. Available plans, billing periods, prices, taxes, trials, and localized terms are displayed by Apple before purchase.',
          'Unless Apple states otherwise, subscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period. Apple charges the payment method associated with your Apple account.',
          'You can manage or cancel a subscription in your Apple account settings. Deleting WordPing does not cancel a subscription.',
          'Billing, payment processing, refund eligibility, and App Store transaction disputes are administered by Apple under Apple’s applicable terms and law. The Operator cannot directly issue an App Store refund.',
          'WordPing uses RevenueCat to verify subscription entitlements. A temporary verification outage may delay access or purchase restoration.',
          'The Operator may change future prices or plan features as permitted by Apple and applicable law. Any price change requiring consent will follow Apple’s process. Rights already accrued under applicable law are not affected.',
        ],
      },
      {
        heading: '6. AI Voice allowances and limits',
        bullets: [
          'Free: High-Quality AI Voice generation for arbitrary word-card text is unavailable. Promotional voice samples remain available subject to abuse limits.',
          'Basic: up to 200 new High-Quality AI Voice word-card generations per UTC calendar month. The allowance resets at the start of the next UTC month.',
          'Premium: no monthly product quota for High-Quality AI Voice generation. Reasonable per-request, per-minute, per-day, character, safety, technical, and abuse-prevention limits continue to apply.',
          'Playback from an existing device cache and promotional or voice-picker samples do not consume the Basic monthly allowance. A generation accepted for upstream processing may count even if the upstream provider later fails to return usable audio.',
          'Limits may be temporarily tightened where reasonably necessary to prevent abuse, protect availability, comply with provider restrictions, or control exceptional cost. This does not guarantee uninterrupted or unlimited throughput.',
        ],
      },
      {
        heading: '7. AI output',
        paragraphs: [
          'AI-generated audio and text may be inaccurate, incomplete, unexpected, or unsuitable. You must review output before relying on it. AI output is not professional advice. Similar or identical output may be generated for other users, and the Operator does not represent that output is unique or eligible for intellectual-property protection.',
        ],
      },
      {
        heading: '8. Acceptable use',
        paragraphs: ['You must not, and must not assist another person to:'],
        bullets: [
          'Use WordPing unlawfully, fraudulently, to infringe intellectual-property or privacy rights, or to generate or distribute harmful or illegal content.',
          'Circumvent subscriptions, quotas, rate limits, entitlement checks, security controls, or technical restrictions.',
          'Probe, disrupt, overload, scrape, reverse engineer, or attempt unauthorized access to WordPing or its providers, except where applicable law expressly permits an activity that cannot be restricted by contract.',
          'Use automated requests in a manner that materially burdens the service or resell, sublicense, or provide the service as an API to others.',
          'Transmit malware, malicious code, stolen credentials, or content designed to manipulate or attack an AI or infrastructure provider.',
        ],
      },
      {
        heading: '9. Intellectual property and open source',
        paragraphs: [
          'WordPing, including its software, design, branding, text, graphics, and original media, is owned by the Operator or its licensors and is protected by applicable law. These Terms do not grant permission to use the WordPing name, logo, or proprietary assets outside normal use of the service.',
          'WordPing includes third-party open-source and source-available components governed by their own licence terms. Those terms control for the applicable component. Notices are available on the Open Source Licences page.',
        ],
      },
      {
        heading: '10. Third-party services',
        paragraphs: [
          'WordPing relies on Apple, RevenueCat, Cloudflare, OpenAI, Vercel, and open-source software. Third-party services may be changed, interrupted, restricted, or discontinued independently of the Operator. Your use of those services may also be subject to their terms and privacy policies.',
        ],
      },
      {
        heading: '11. Changes, suspension, and termination',
        paragraphs: [
          'We may maintain, modify, add, hide, or discontinue features; correct defects; or suspend access where reasonably necessary for security, legal compliance, abuse prevention, provider changes, or service operation. We will provide notice where required by law.',
          'We may restrict or terminate access to online features if you materially or repeatedly violate these Terms, create security or cost risk, or use the service unlawfully. You may stop using WordPing at any time. Provisions that by nature should survive termination—including intellectual property, disclaimers, liability limits, and dispute terms—will survive.',
        ],
      },
      {
        heading: '12. Disclaimers',
        paragraphs: [
          'To the maximum extent permitted by law, WordPing is provided “as is” and “as available.” The Operator disclaims implied warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, availability, and uninterrupted or error-free operation. Nothing in these Terms excludes a warranty or consumer right that cannot lawfully be excluded.',
        ],
      },
      {
        heading: '13. Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by applicable law, the Operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, profits, revenue, opportunities, goodwill, or business interruption arising out of or relating to WordPing, its unavailability, or reliance on its output.',
          'Nothing in these Terms excludes or limits liability where exclusion or limitation is prohibited by applicable law. In particular, these limitations do not apply to the Operator’s intentional misconduct or gross negligence, and they do not restrict any non-waivable rights or remedies under the Consumer Contract Act of Japan or other mandatory consumer-protection laws.',
        ],
      },
      {
        heading: '14. Changes to these Terms',
        paragraphs: [
          'We may update these Terms for changes to WordPing, providers, law, security, or business practices. Updated Terms will be posted with a revised effective date. Where required by law, we will provide additional notice or obtain consent. Continuing to use WordPing after an update takes effect constitutes acceptance only to the extent permitted by applicable law.',
        ],
      },
      {
        heading: '15. Governing law and jurisdiction',
        paragraphs: [
          'These Terms are governed by the laws of Japan, without regard to conflict-of-law rules. The Kumamoto District Court shall be the agreed court of first instance for disputes arising from or relating to WordPing or these Terms, subject to any mandatory consumer-protection laws or jurisdiction rules that apply.',
        ],
      },
      {
        heading: '16. General provisions',
        paragraphs: [
          'If a provision is held invalid or unenforceable, it will be enforced to the maximum lawful extent and the remaining provisions will continue in effect. Failure to enforce a provision is not a waiver. You may not assign these Terms without the Operator’s consent; the Operator may assign them as part of a lawful transfer of the service, subject to applicable law. These Terms, the Privacy Policy, applicable Apple terms, and any purchase terms shown at checkout constitute the agreement concerning WordPing.',
        ],
      },
      {
        heading: '17. Contact',
        paragraphs: [
          `Operator: ${LEGAL_OPERATOR}`,
          `Contact and support: ${LEGAL_EMAIL}`,
        ],
      },
    ],
  },
  ja: {
    title: '利用規約',
    description: 'WordPing iOSアプリ、ウェブサイト、サブスクリプションおよびAIサービスの利用条件です。',
    effectiveDateLabel: '施行日',
    effectiveDate: LEGAL_EFFECTIVE_DATE_JA,
    introduction: [
      `本利用規約（以下「本規約」といいます）は、利用者と${LEGAL_OPERATOR}（以下「運営者」または「当方」といいます）との間で、WordPing iOSアプリ、ウェブサイトおよび関連サービス（総称して「WordPing」といいます）の利用条件を定めるものです。`,
      'WordPingをダウンロード、閲覧、購入または利用することにより、利用者は本規約に同意したものとみなされます。同意しない場合は、WordPingを利用しないでください。',
    ],
    sections: [
      {
        heading: '1. 利用資格および権限',
        paragraphs: [
          '利用者は、本規約に同意するために必要な法的能力を有していなければなりません。適用法令上、親権者、保護者その他の権限を有する者の同意が必要な場合、その同意を得た場合に限りWordPingを利用できます。組織のためにWordPingを利用する場合、利用者は当該組織を本規約に拘束する権限を有することを表明するものとします。',
        ],
      },
      {
        heading: '2. WordPingの内容',
        paragraphs: [
          'WordPingは、端末内の単語保存、学習カード、復習・表示管理、ローカル通知、任意のデータ移行、サブスクリプション機能、および一部のAI音声・AIテキスト機能を提供します。機能は、バージョン、プラン、端末、地域、言語およびサービス提供状況により異なる場合があります。',
          'WordPingは学習補助ツールです。学習成果、正確性、完全性、発音、翻訳品質、ならびに学術、業務、医療、法律、金融、安全上重要な用途その他特定目的への適合性を保証するものではありません。',
        ],
      },
      {
        heading: '3. 利用許諾',
        paragraphs: [
          '本規約および適用されるAppleの条件に従うことを条件として、運営者は、利用者が所有または管理するApple端末上で、適法な個人利用のためにWordPingを使用する、限定的、個人的、非独占的、譲渡不能、再許諾不能かつ取消可能な権利を許諾します。WordPingの所有権が利用者へ移転することはありません。',
          'App Storeにより要求される範囲で、Appleの「Licensed Application End User License Agreement」が適用されます。本規約と強行的なAppleの条件が抵触する場合、当該事項については強行的なAppleの条件が優先します。',
        ],
      },
      {
        heading: '4. 利用者コンテンツおよびバックアップ',
        paragraphs: [
          '利用者がWordPingへ入力した単語、メモ、音声その他の情報（以下「利用者コンテンツ」といいます）について、利用者が有する権利は利用者に留保されます。利用者は、要求した機能の提供、サービスの安全な運営および法令遵守に必要な範囲に限り、運営者および必要な外部事業者が利用者コンテンツを取り扱うことを許諾します。',
          '利用者は、利用者コンテンツが適法であり、その利用に必要な権利を有し、第三者の権利を侵害しないことについて責任を負います。外部事業者への送信が必要となることを了承できない機密情報、規制対象情報または高度に機微な情報をAI機能へ送信しないでください。',
          'WordPingは端末内保存を基本としており、単語データを自動的にサーバーへバックアップしません。Premium利用者はバックアップファイルを作成し、保存先または共有先を選択できます。利用者は、適切なバックアップの維持および書き出したファイルの保護について責任を負います。法令上免責できない場合を除き、端末の紛失、削除、OSの動作、移行の失敗、ファイル破損または利用可能なバックアップを維持しなかったことによるデータ損失について、運営者は責任を負いません。',
        ],
      },
      {
        heading: '5. プラン、購入、更新および解約',
        bullets: [
          '有料サブスクリプションはAppleのApp Storeを通じて提供されます。利用可能なプラン、請求期間、価格、税、無料トライアルおよび地域別条件は、購入前にAppleが表示する内容に従います。',
          'Appleが別途表示する場合を除き、サブスクリプションは、現在の利用期間が終了する24時間前までに解約されない限り自動更新されます。料金はAppleアカウントに登録された支払方法へAppleから請求されます。',
          'サブスクリプションはAppleアカウントの設定から管理または解約できます。WordPingを削除してもサブスクリプションは解約されません。',
          '請求、決済処理、返金の可否およびApp Store上の取引紛争は、Appleの条件および適用法令に基づきAppleが取り扱います。運営者がApp Storeの返金を直接行うことはできません。',
          'WordPingは、サブスクリプション利用資格の確認にRevenueCatを利用します。確認サービスの一時的な障害により、利用資格の反映または購入復元が遅れる場合があります。',
          '運営者は、Appleおよび適用法令が認める範囲で、将来の価格またはプラン内容を変更する場合があります。同意を要する価格変更についてはAppleの手続に従います。適用法令に基づき既に発生した権利には影響しません。',
        ],
      },
      {
        heading: '6. AI音声の利用枠および制限',
        bullets: [
          'Free：任意の単語カードテキストに対する高品質AI音声の生成は利用できません。プロモーション音声サンプルは、不正利用防止上限の範囲で利用できます。',
          'Basic：UTC基準の暦月ごとに、新規の高品質AI音声（単語カード）を最大200回生成できます。利用枠は次のUTC月の開始時にリセットされます。',
          'Premium：高品質AI音声の月間商品上限はありません。ただし、1回、1分、1日、文字数、安全性、技術上および不正利用防止上の合理的な制限は引き続き適用されます。',
          '端末内キャッシュからの再生、プロモーションサンプルおよび音声選択画面のサンプルは、Basicの月間利用枠を消費しません。上流サービスで処理が開始された生成は、その後利用可能な音声を返せなかった場合でも利用回数に算入される場合があります。',
          '不正利用の防止、可用性の保護、外部事業者の制限遵守または例外的な費用管理のため合理的に必要な場合、上限を一時的に厳格化することがあります。中断のない、または処理量が完全に無制限の利用を保証するものではありません。',
        ],
      },
      {
        heading: '7. AI生成結果',
        paragraphs: [
          'AI生成音声およびテキストは、不正確、不完全、予期しない、または用途に適さない場合があります。利用者は、結果へ依拠する前に自ら確認してください。AI生成結果は専門的助言ではありません。他の利用者に類似または同一の結果が生成される場合があり、運営者は、生成結果の独自性または知的財産権による保護可能性を表明しません。',
        ],
      },
      {
        heading: '8. 禁止事項',
        paragraphs: ['利用者は、自らまたは第三者を通じて、次の行為をしてはなりません。'],
        bullets: [
          '違法または詐欺的な目的、知的財産権・プライバシー権の侵害、または有害・違法なコンテンツの生成・配布のためにWordPingを利用する行為。',
          'サブスクリプション、利用枠、レート制限、利用資格確認、セキュリティ制御または技術的制限を回避する行為。',
          '適用法令が契約で制限できない行為として明示的に認める場合を除き、WordPingまたは外部事業者への調査、妨害、過負荷、スクレイピング、リバースエンジニアリングまたは不正アクセスを試みる行為。',
          'サービスに重大な負荷を与える自動リクエスト、またはサービスをAPIとして第三者へ再販売、再許諾もしくは提供する行為。',
          'マルウェア、悪意あるコード、盗用された認証情報、またはAI・インフラ事業者を操作・攻撃するためのコンテンツを送信する行為。',
        ],
      },
      {
        heading: '9. 知的財産権およびオープンソース',
        paragraphs: [
          'WordPingのソフトウェア、デザイン、ブランド、文章、画像および独自メディアは、運営者または正当な権利者に帰属し、適用法令により保護されます。本規約は、通常のサービス利用を超えてWordPingの名称、ロゴまたは独自素材を利用する許可を与えるものではありません。',
          'WordPingには、それぞれのライセンス条件が適用される第三者のオープンソースまたはソース利用可能なコンポーネントが含まれます。当該コンポーネントについては各ライセンス条件が優先します。表示事項は「オープンソースライセンス」ページで確認できます。',
        ],
      },
      {
        heading: '10. 外部サービス',
        paragraphs: [
          'WordPingは、Apple、RevenueCat、Cloudflare、OpenAI、Vercelおよびオープンソースソフトウェアを利用します。外部サービスは、運営者とは独立して変更、中断、制限または終了される場合があります。各外部サービスの利用には、当該事業者の利用規約およびプライバシーポリシーが適用される場合があります。',
        ],
      },
      {
        heading: '11. 変更、停止および利用終了',
        paragraphs: [
          '当方は、保守、機能の変更・追加・非表示・終了、不具合修正、セキュリティ、法令遵守、不正利用防止、外部事業者の変更またはサービス運営のため合理的に必要な停止を行う場合があります。法令上必要な場合は通知します。',
          '利用者が本規約に重大または反復して違反した場合、セキュリティ・費用上の危険を生じさせた場合、または違法にサービスを利用した場合、オンライン機能へのアクセスを制限または終了する場合があります。利用者はいつでも利用を中止できます。知的財産権、免責、責任制限、紛争条項等、その性質上存続すべき条項は利用終了後も存続します。',
        ],
      },
      {
        heading: '12. 保証の否認',
        paragraphs: [
          '法令で認められる最大限の範囲で、WordPingは「現状有姿」かつ「提供可能な範囲」で提供されます。運営者は、商品性、特定目的適合性、権利非侵害、正確性、可用性、および中断・エラーのない動作に関する黙示の保証を否認します。本規約は、法令上排除できない保証または消費者の権利を排除するものではありません。',
        ],
      },
      {
        heading: '13. 責任の制限',
        paragraphs: [
          '適用法令で認められる最大限の範囲で、運営者は、WordPing、その利用不能、または生成結果への依拠に起因または関連する間接損害、付随的損害、特別損害、結果的損害、懲罰的損害、ならびにデータ、利益、売上、機会、信用の喪失または事業中断について責任を負いません。',
          '本規約のいかなる定めも、適用法令上排除または制限することが認められない責任を排除または制限するものではありません。特に、上記の制限は、運営者の故意または重大な過失による責任には適用されず、日本の消費者契約法その他の消費者保護に関する強行法規に基づく、放棄できない権利または救済を制限しません。',
        ],
      },
      {
        heading: '14. 本規約の変更',
        paragraphs: [
          'WordPing、外部事業者、法令、セキュリティまたは事業運営の変更に応じて、本規約を変更する場合があります。変更後の規約は、改定後の施行日とともに掲載します。法令上必要な場合は、追加の通知または同意取得を行います。変更後もWordPingを利用したことによる同意は、適用法令で認められる範囲に限り効力を有します。',
        ],
      },
      {
        heading: '15. 準拠法および合意管轄',
        paragraphs: [
          '本規約は、法の抵触に関する規則を除き、日本法に準拠します。WordPingまたは本規約に起因または関連する紛争については、適用される強行的な消費者保護法または管轄規則に従うことを条件として、熊本地方裁判所を第一審の合意管轄裁判所とします。',
        ],
      },
      {
        heading: '16. 一般条項',
        paragraphs: [
          '本規約の一部が無効または執行不能と判断された場合、当該条項は適法な最大限の範囲で適用され、その他の条項は引き続き有効とします。権利を行使しないことは放棄を意味しません。利用者は運営者の同意なく本規約上の地位を譲渡できません。運営者は、適用法令に従い、サービスの適法な承継に伴い本規約を譲渡できます。本規約、プライバシーポリシー、適用されるAppleの条件および購入時に表示される条件は、WordPingに関する合意を構成します。',
        ],
      },
      {
        heading: '17. お問い合わせ先',
        paragraphs: [
          `運営者：${LEGAL_OPERATOR}`,
          `お問い合わせ・サポート：${LEGAL_EMAIL}`,
        ],
      },
    ],
  },
};

export const legalNavigation = {
  en: {
    home: 'Home',
    privacy: 'Privacy',
    terms: 'Terms',
    licenses: 'Licences',
    contents: 'Contents',
    services: 'Service providers',
    providerPolicy: 'Provider privacy policy',
    language: 'Language',
    packageInventory: 'Package inventory',
    notices: 'Licence and notice texts',
    unresolved: 'Unresolved licences',
  },
  ja: {
    home: 'ホーム',
    privacy: 'プライバシー',
    terms: '利用規約',
    licenses: 'ライセンス',
    contents: '目次',
    services: '外部サービス一覧',
    providerPolicy: '事業者のプライバシーポリシー',
    language: '言語',
    packageInventory: 'パッケージ一覧',
    notices: 'ライセンス・表示事項全文',
    unresolved: '未解決ライセンス',
  },
} as const;

export function legalLocale(locale: string): LegalLocale {
  return locale === 'ja' ? 'ja' : 'en';
}
