import type { Metadata } from 'next';
import LegalShell from '@/components/legal/LegalShell';
import { redirect } from '@/i18n/navigation';
import inventoryJson from '@/lib/generatedLicenseInventory.json';
import { legalLocale, legalNavigation, type LegalLocale } from '@/lib/legalContent';

interface InventoryPackage {
  name: string;
  version: string;
  license: string | null;
  homepage: string | null;
  repository: string | null;
  npm: string;
  usedBy: string[];
  noticeIds: string[];
}

interface InventoryNotice {
  id: string;
  fileName: string;
  text: string;
}

interface Inventory {
  packages: InventoryPackage[];
  notices: InventoryNotice[];
  unresolved: Array<{ name: string; version: string; reason: string }>;
}

const inventory = inventoryJson as Inventory;

const PRODUCT_GROUPS = [
  { id: 'ios', label: 'WordPing iOS App' },
  { id: 'worker', label: 'Cloudflare API Worker' },
  { id: 'website', label: 'WordPing Website' },
] as const;

type ProductGroupId = (typeof PRODUCT_GROUPS)[number]['id'];

const copy: Record<LegalLocale, {
  title: string;
  description: string;
  intro: string[];
  packageHelp: string;
  groupHelp: (total: number) => string;
  groupDescriptions: Record<ProductGroupId, string>;
  noticeHelp: string;
  usedBy: string;
  source: string;
  noUnresolved: string;
  unresolvedWarning: string;
  proprietary: string;
}> = {
  en: {
    title: 'Open Source Licences',
    description: 'Third-party software notices for the WordPing iOS App, Cloudflare API Worker, and public website.',
    intro: [
      'WordPing uses open-source and source-available software. Each component remains subject to its own licence. Nothing on this page changes or restricts rights granted by an applicable third-party licence.',
      'This inventory is generated from the production dependency graphs and checked-in lockfiles for the WordPing iOS App, Cloudflare API Worker, and WordPing Website. Build-only or optional packages can appear where they are part of a production lockfile graph.',
    ],
    packageHelp: 'Each record shows the installed version, declared licence, source link, products that reference it, and the associated notice text when included in the installed package.',
    groupHelp: total => `The inventory contains ${total} unique package/version records. A package referenced by more than one product appears in each applicable group, so the group counts can overlap. Worker and Website packages run in their separately deployed environments and are not embedded in the WordPing iOS binary.`,
    groupDescriptions: {
      ios: 'Packages referenced by the WordPing iOS App production dependency graph.',
      worker: 'Packages used by the separately deployed Cloudflare API Worker; these are not embedded in the iOS app.',
      website: 'Packages used by the separately deployed WordPing Website; these are not embedded in the iOS app.',
    },
    noticeHelp: 'Identical notice files are deduplicated. Expand a notice to read its complete text and see every package associated with it.',
    usedBy: 'Used by',
    source: 'Package source',
    noUnresolved: 'No unresolved licence metadata was found in the generated production inventory.',
    unresolvedWarning: 'These packages require manual licence resolution before deployment:',
    proprietary: 'The WordPing name, original app content, screenshots, illustrations, icons, videos, and other proprietary assets are not licensed under the third-party licences listed here unless expressly stated otherwise.',
  },
  ja: {
    title: 'オープンソースライセンス',
    description: 'WordPing iOSアプリ、Cloudflare API Workerおよび公式ウェブサイトで使用する第三者ソフトウェアの表示事項です。',
    intro: [
      'WordPingは、オープンソースおよびソース利用可能なソフトウェアを使用しています。各コンポーネントには、それぞれのライセンスが適用されます。本ページは、第三者ライセンスにより付与される権利を変更または制限するものではありません。',
      '本一覧は、WordPing iOS App、Cloudflare API WorkerおよびWordPing Websiteの本番依存関係グラフと固定済みロックファイルから生成されています。本番ロックファイルの依存関係に含まれる場合、ビルド専用または任意のパッケージが表示されることがあります。',
    ],
    packageHelp: '各項目には、導入バージョン、申告ライセンス、配布元、参照するWordPing製品、および導入パッケージに含まれる表示事項との対応を掲載しています。',
    groupHelp: total => `本一覧には、${total}件の重複しないパッケージ・バージョンの組合せが含まれます。複数の製品から参照されるパッケージは該当する各グループに表示されるため、グループ件数には重複があります。WorkerおよびWebsiteのパッケージは、それぞれ別個にデプロイされる環境で動作し、WordPingのiOSバイナリには組み込まれません。`,
    groupDescriptions: {
      ios: 'WordPing iOS Appの本番依存関係グラフから参照されるパッケージです。',
      worker: '別個にデプロイされるCloudflare API Workerで使用するパッケージであり、iOSアプリには組み込まれません。',
      website: '別個にデプロイされるWordPing Websiteで使用するパッケージであり、iOSアプリには組み込まれません。',
    },
    noticeHelp: '同一内容の表示事項は重複を除いています。項目を開くと全文および対応するパッケージを確認できます。',
    usedBy: '参照元',
    source: 'パッケージ配布元',
    noUnresolved: '生成された本番依存関係一覧に、未解決のライセンス情報はありません。',
    unresolvedWarning: '次のパッケージは、公開前に手動でライセンスを確認する必要があります。',
    proprietary: 'WordPingの名称、独自のアプリコンテンツ、スクリーンショット、イラスト、アイコン、動画その他の独自素材は、別途明示されない限り、本ページ記載の第三者ライセンスの対象ではありません。',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = legalLocale((await params).locale);
  return { title: `${copy[locale].title} | WordPing`, description: copy[locale].description };
}

export default async function LicensesPage({ params }: { params: Promise<{ locale: string }> }) {
  const requestedLocale = (await params).locale;
  if (requestedLocale !== 'en' && requestedLocale !== 'ja') redirect({ href: '/licenses', locale: 'en' });
  const locale = legalLocale(requestedLocale);
  const text = copy[locale];
  const nav = legalNavigation[locale];
  const productGroups = PRODUCT_GROUPS.map(group => ({
    ...group,
    packages: inventory.packages.filter(item => item.usedBy.includes(group.label)),
  }));
  const packagesByNotice = new Map<string, string[]>();
  for (const item of inventory.packages) {
    for (const noticeId of item.noticeIds) {
      const packages = packagesByNotice.get(noticeId) ?? [];
      packages.push(`${item.name}@${item.version}`);
      packagesByNotice.set(noticeId, packages);
    }
  }

  return (
    <LegalShell locale={locale} slug="licenses" title={text.title} description={text.description}>
      <article className="space-y-10">
        <section className="rounded-3xl border border-theme bg-card p-6 shadow-sm sm:p-10">
          <div className="space-y-4 text-[15px] leading-8 text-sub sm:text-base">
            {text.intro.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            <p>{text.proprietary}</p>
          </div>
          <div className={`mt-7 rounded-2xl border p-5 ${inventory.unresolved.length === 0 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
            <h2 className="font-bold">{nav.unresolved}: {inventory.unresolved.length}</h2>
            {inventory.unresolved.length === 0 ? (
              <p className="mt-2 text-sm leading-7 text-sub">{text.noUnresolved}</p>
            ) : (
              <>
                <p className="mt-2 text-sm leading-7 text-sub">{text.unresolvedWarning}</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-sub">
                  {inventory.unresolved.map(item => <li key={`${item.name}@${item.version}`}>{item.name}@{item.version}: {item.reason}</li>)}
                </ul>
              </>
            )}
          </div>
        </section>

        <section id="packages" className="scroll-mt-28 rounded-3xl border border-theme bg-card p-6 shadow-sm sm:p-10">
          <h2 className="text-2xl font-bold">{nav.packageInventory} ({inventory.packages.length})</h2>
          <p className="mt-3 text-sm leading-7 text-sub">{text.packageHelp}</p>
          <p className="mt-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm leading-7 text-sub">{text.groupHelp(inventory.packages.length)}</p>
          <div className="mt-8 space-y-10">
            {productGroups.map(group => (
              <div key={group.id} id={`packages-${group.id}`} className="scroll-mt-28">
                <h3 className="text-xl font-bold">{group.label} ({group.packages.length})</h3>
                <p className="mt-2 text-sm leading-7 text-sub">{text.groupDescriptions[group.id]}</p>
                <div className="mt-4 divide-y divide-[var(--border)] border-y border-theme">
                  {group.packages.map(item => {
                    const source = item.repository ?? item.homepage ?? item.npm;
                    return (
                      <div key={`${item.name}@${item.version}`} className="grid gap-2 py-4 text-sm md:grid-cols-[minmax(0,1fr)_190px_140px] md:items-start">
                        <div className="min-w-0">
                          <p className="break-all font-mono font-semibold text-primary">{item.name}@{item.version}</p>
                          <a href={source} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-xs text-blue-500 hover:underline">
                            {text.source}
                          </a>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-sub">{text.usedBy}</p>
                          <p className="mt-1 text-xs leading-5 text-sub">{item.usedBy.join(', ')}</p>
                        </div>
                        <div className="md:text-right">
                          <span className="inline-flex rounded-full border border-theme bg-alt px-3 py-1 font-mono text-xs">
                            {item.license ?? 'UNRESOLVED'}
                          </span>
                          {item.noticeIds.length > 0 && (
                            <p className="mt-1 text-xs text-sub">{item.noticeIds.length} notice{item.noticeIds.length === 1 ? '' : 's'}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="notices" className="scroll-mt-28 rounded-3xl border border-theme bg-card p-6 shadow-sm sm:p-10">
          <h2 className="text-2xl font-bold">{nav.notices} ({inventory.notices.length})</h2>
          <p className="mt-3 text-sm leading-7 text-sub">{text.noticeHelp}</p>
          <div className="mt-6 space-y-3">
            {inventory.notices.map(notice => (
              <details key={notice.id} className="group rounded-2xl border border-theme bg-alt">
                <summary className="cursor-pointer list-none px-5 py-4 font-mono text-sm font-semibold marker:hidden">
                  <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
                  {notice.fileName} · {notice.id}
                </summary>
                <div className="border-t border-theme px-5 py-5">
                  <p className="mb-4 text-xs leading-5 text-sub">{(packagesByNotice.get(notice.id) ?? []).join(', ')}</p>
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-sub">{notice.text}</pre>
                </div>
              </details>
            ))}
          </div>
        </section>
      </article>
    </LegalShell>
  );
}
