import type { Metadata } from 'next';
import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { redirect } from '@/i18n/navigation';
import { legalLocale } from '@/lib/legalContent';
import { supportDocuments } from '@/lib/supportContent';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = legalLocale((await params).locale);
  const document = supportDocuments[locale];
  return { title: document.title, description: document.description };
}

/**
 * The public support page, at /support.
 *
 * Statically rendered with no data fetching and no session of any kind, so it
 * is reachable by App Review — and by anyone — without signing in. Follows the
 * legal pages' locale rule: written in English and Japanese, with every other
 * locale redirected to the English copy rather than shown an untranslated page.
 */
export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const requestedLocale = (await params).locale;
  if (requestedLocale !== 'en' && requestedLocale !== 'ja') redirect({ href: '/support', locale: 'en' });
  const locale = legalLocale(requestedLocale);
  return <LegalDocumentView locale={locale} slug="support" document={supportDocuments[locale]} />;
}
