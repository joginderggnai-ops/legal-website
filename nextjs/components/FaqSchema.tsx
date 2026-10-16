// Reusable FAQPage JSON-LD for the Next.js (App Router) build.
// Render it on any page that shows FAQs, passing the same list the page displays:
//
//   import FaqSchema from '@/components/FaqSchema';
//   import { practiceFaqs } from '@/data/practiceFaqs';
//
//   const faqs = practiceFaqs['insolvency-bankruptcy'];
//   <FaqSchema faqs={faqs} url="https://www.resurgentlegal.com/practice-areas/insolvency-bankruptcy" />
//
// Google only accepts FAQPage markup when every question and answer is also visible on the page.

export type Faq = { question: string; answer: string };

type Props = {
  faqs: Faq[];
  /** Canonical URL of the page; used to give the FAQ block a stable @id. */
  url?: string;
};

export default function FaqSchema({ faqs, url }: Props) {
  if (!faqs.length) return null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(url ? { '@id': `${url}#faq` } : {}),
    mainEntity: faqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Escape "<" so answer text can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
    />
  );
}
