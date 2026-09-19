import type { Metadata } from 'next';
import LegalShell from '@/components/legal/LegalShell';
import { redirect } from '@/i18n/navigation';
import { legalLocale, type LegalLocale } from '@/lib/legalContent';

interface DisclosureCopy {
  title: string;
  description: string;
  note: string;
  rows: Array<{ label: string; value: string }>;
}

const disclosure: Record<LegalLocale, DisclosureCopy> = {
  en: {
    title: 'Commercial Disclosure under Japan’s Specified Commercial Transactions Act',
    description: 'Information about purchases and subscriptions offered in WordCore to users in Japan.',
    note: 'This disclosure applies to purchases made by users in Japan through Apple’s App Store.',
    rows: [
      { label: 'Operator', value: 'Daiki Tokumoto' },
      { label: 'Telephone number', value: 'Telephone inquiries are not accepted. Please contact us by email.' },
      { label: 'Email address', value: 'daiki.studio9@gmail.com' },
      { label: 'Price of products and services', value: 'The tax-inclusive price displayed on the purchase screen for each product or service.' },
      { label: 'Additional charges', value: 'None. Users are responsible for internet access charges and any other telecommunications costs required to use the app.' },
      { label: 'Payment timing', value: 'Your Apple Account is charged when the purchase process is completed. Subscriptions are charged again at each renewal unless cancelled.' },
      { label: 'Payment method', value: 'Payment methods made available by the App Store.' },
      { label: 'Delivery or service commencement', value: 'Immediately after completion of payment has been confirmed.' },
      { label: 'Returns and cancellations', value: 'Because the products and services are digital, returns or cancellations after purchase are generally not accepted. Refunds and cancellations are governed by Apple’s terms and applicable law. Subscriptions can be cancelled before the next renewal in Apple Account settings.' },
      { label: 'System requirements', value: 'See the WordCore product page in the App Store for supported devices and operating-system requirements.' },
    ],
  },
  ja: {
    title: '特定商取引法に基づく表記',
    description: '日本国内の利用者に提供するWordCoreの商品およびサブスクリプションに関する表示です。',
    note: '本表記は、日本国内の利用者がAppleのApp Storeを通じて行う購入に適用されます。',
    rows: [
      { label: '運営者', value: '徳本大輝' },
      { label: '電話番号', value: '電話でのお問い合わせは受け付けていません。メールからお問い合わせください。' },
      { label: 'メールアドレス', value: 'daiki.studio9@gmail.com' },
      { label: '商品の販売価格・サービスの対価', value: '各商品・サービスの購入画面に表示する税込価格です。' },
      { label: '代金以外に必要となる費用', value: 'ありません。ただし、インターネット接続料金その他の電気通信回線の利用に関する費用は、利用者にて別途ご負担いただく必要があります。' },
      { label: '代金の支払時期', value: '購入手続きの完了時にApple Accountへ請求されます。サブスクリプションは、解約されない限り各利用期間の更新時に再度請求されます。' },
      { label: '支払方法', value: 'App Storeが定める支払方法によります。' },
      { label: '商品引渡しまたはサービス提供の時期', value: '代金決済手続きの完了を確認後、直ちに提供します。' },
      { label: '返品・キャンセルに関する特約', value: '本アプリで販売する商品・サービスはデジタルコンテンツ等の性質上、購入手続き完了後の返品またはキャンセルを原則としてお受けできません。返金およびキャンセルは、Appleの条件および適用法令に従います。サブスクリプションは、次回更新前にApple Accountの設定から解約できます。' },
      { label: '動作環境', value: '対応端末およびOSの要件は、App StoreのWordCore製品ページをご確認ください。' },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = legalLocale((await params).locale);
  const copy = disclosure[locale];
  return { title: `${copy.title} | WordCore`, description: copy.description };
}

export default async function CommercialTransactionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const requestedLocale = (await params).locale;
  if (requestedLocale !== 'en' && requestedLocale !== 'ja') {
    redirect({ href: '/commercial-transactions', locale: 'en' });
  }
  const locale = legalLocale(requestedLocale);
  const copy = disclosure[locale];

  return (
    <LegalShell
      locale={locale}
      slug="commercial-transactions"
      title={copy.title}
      description={copy.description}
    >
      <article className="rounded-3xl border border-theme bg-card p-6 shadow-sm sm:p-10">
        <p className="border-b border-theme pb-7 text-[15px] leading-8 text-sub sm:text-base">
          {copy.note}
        </p>
        <dl className="divide-y divide-[var(--border)]">
          {copy.rows.map(row => (
            <div key={row.label} className="grid gap-2 py-6 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-8">
              <dt className="font-bold">{row.label}</dt>
              <dd className="whitespace-pre-line text-[15px] leading-8 text-sub sm:text-base">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </article>
    </LegalShell>
  );
}
