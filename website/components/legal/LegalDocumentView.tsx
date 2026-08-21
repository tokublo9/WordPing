import type { ReactNode } from 'react';
import LegalShell from './LegalShell';
import {
  LEGAL_EMAIL,
  legalNavigation,
  serviceDisclosures,
  type LegalDocument,
  type LegalLocale,
  type LegalSlug,
} from '@/lib/legalContent';

const LINK_PATTERN = /(https?:\/\/[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/giu;

function linkedText(text: string): ReactNode[] {
  return text.split(LINK_PATTERN).map((part, index) => {
    if (/^https?:\/\//u.test(part)) {
      return <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="break-all text-blue-500 underline decoration-blue-500/30 underline-offset-4 hover:decoration-blue-500">{part}</a>;
    }
    if (part.toLowerCase() === LEGAL_EMAIL) {
      return <a key={`${part}-${index}`} href={`mailto:${part}`} className="text-blue-500 underline decoration-blue-500/30 underline-offset-4 hover:decoration-blue-500">{part}</a>;
    }
    return part;
  });
}

interface Props {
  locale: LegalLocale;
  slug: Extract<LegalSlug, 'privacy' | 'terms'>;
  document: LegalDocument;
  showServices?: boolean;
}

export default function LegalDocumentView({ locale, slug, document, showServices = false }: Props) {
  const nav = legalNavigation[locale];
  return (
    <LegalShell locale={locale} slug={slug} title={document.title} description={document.description}>
      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl border border-theme bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-sub">{document.effectiveDateLabel}</p>
            <p className="mt-1 font-semibold">{document.effectiveDate}</p>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-sub">{nav.contents}</p>
            <ol className="mt-3 space-y-2 text-sm text-sub">
              {document.sections.map((section, index) => (
                <li key={section.heading}>
                  <a href={`#section-${index + 1}`} className="transition-colors hover:text-blue-500">
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <article className="min-w-0 rounded-3xl border border-theme bg-card p-6 shadow-sm sm:p-10">
          <div className="space-y-5 border-b border-theme pb-8 text-[15px] leading-8 text-sub sm:text-base">
            {document.introduction.map(paragraph => <p key={paragraph}>{linkedText(paragraph)}</p>)}
          </div>
          <div className="divide-y divide-[var(--border)]">
            {document.sections.map((section, index) => (
              <section id={`section-${index + 1}`} key={section.heading} className="scroll-mt-28 py-8 first:pt-10">
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{section.heading}</h2>
                {section.paragraphs && (
                  <div className="mt-4 space-y-4 text-[15px] leading-8 text-sub sm:text-base">
                    {section.paragraphs.map(paragraph => <p key={paragraph}>{linkedText(paragraph)}</p>)}
                  </div>
                )}
                {section.bullets && (
                  <ul className="mt-4 list-disc space-y-3 pl-6 text-[15px] leading-8 text-sub sm:text-base">
                    {section.bullets.map(item => <li key={item}>{linkedText(item)}</li>)}
                  </ul>
                )}
                {showServices && index === 4 && (
                  <div className="mt-7 space-y-4" aria-label={nav.services}>
                    {serviceDisclosures[locale].map(service => (
                      <section key={service.name} className="rounded-2xl border border-theme bg-alt p-5">
                        <h3 className="font-bold">{service.name}</h3>
                        <p className="mt-2 text-sm leading-7 text-sub">{service.purpose}</p>
                        <p className="mt-2 text-sm leading-7 text-sub">{service.information}</p>
                        <a href={service.policyUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-blue-500 hover:underline">
                          {nav.providerPolicy}
                        </a>
                      </section>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </article>
      </div>
    </LegalShell>
  );
}
