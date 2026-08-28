import { messages } from "@/lib/i18n/messages";

/**
 * JsonLd — server component emitting JSON-LD structured data for SEO.
 *
 * Includes:
 *  - EducationalOrganization (the academy)
 *  - FAQPage (the 5 FAQ items)
 *  - BreadcrumbList (top-level site)
 *
 * Uses the Arabic messages as the canonical source (default locale), since
 * search engines will index the SSR HTML which defaults to AR.
 */
export function JsonLd() {
  const ar = messages.ar;

  const org = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: ar.common.brand,
    description: ar.meta.description,
    slogan: ar.hero.badge,
    url: "https://kottaby.academy",
    logo: "https://kottaby.academy/logo.svg",
    sameAs: [
      "https://twitter.com/kottaby",
      "https://youtube.com/@kottaby",
      "https://instagram.com/kottaby",
      "https://t.me/kottaby",
      "https://facebook.com/kottaby",
    ],
    areaServed: "Worldwide",
    knowsAbout: [
      "Quran",
      "Tajweed",
      "Qira'at",
      "Hifz",
      "Ijazah",
      "Islamic education",
    ],
    department: ar.teachers.items.map((teacher) => ({
      "@type": "Person",
      name: teacher.name,
      jobTitle: "Quran Teacher",
      knowsAbout: teacher.specialty,
      address: {
        "@type": "PostalAddress",
        addressLocality: teacher.location,
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: teacher.rating,
        reviewCount: teacher.sessions,
      },
    })),
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: ar.faq.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: ar.common.brand,
        item: "https://kottaby.academy",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: ar.nav.features,
        item: "https://kottaby.academy#features",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: ar.nav.pricing,
        item: "https://kottaby.academy#pricing",
      },
      {
        "@type": "ListItem",
        position: 4,
        name: ar.nav.faq,
        item: "https://kottaby.academy#faq",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
