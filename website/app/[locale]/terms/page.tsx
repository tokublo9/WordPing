import type { Metadata } from 'next';
import LegalDocumentView from '@/components/legal/LegalDocumentView';
import { redirect } from '@/i18n/navigation';
import { legalLocale, termsDocuments } from '@/lib/legalContent';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = legalLocale((await params).locale);
  const document = termsDocuments[locale];
  return { title: `${document.title} | WordPing`, description: document.description };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const requestedLocale = (await params).locale;
  if (requestedLocale !== 'en' && requestedLocale !== 'ja') redirect({ href: '/terms', locale: 'en' });
  const locale = legalLocale(requestedLocale);
  return <LegalDocumentView locale={locale} slug="terms" document={termsDocuments[locale]} />;
}
