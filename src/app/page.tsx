import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TopUtilityStrip } from "@/components/sections/top-utility-strip";
import { HeroSection } from "@/components/sections/hero-section";
import { FeaturesSection } from "@/components/sections/features-section";
import { RecitationsSection } from "@/components/sections/recitations-section";
import { HowItWorksSection } from "@/components/sections/how-it-works-section";
import { RolesSection } from "@/components/sections/roles-section";
import { TeachersSection } from "@/components/sections/teachers-section";
import { CurriculumSection } from "@/components/sections/curriculum-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { AchievementsSection } from "@/components/sections/achievements-section";
import { FaqSection } from "@/components/sections/faq-section";
import { NewsletterSection } from "@/components/sections/newsletter-section";
import { ContactSection } from "@/components/sections/contact-section";
import { VerseSection } from "@/components/sections/verse-section";
import { MobileAppSection } from "@/components/sections/mobile-app-section";
import { TrustedSection } from "@/components/sections/trusted-section";
import { ResourcesSection } from "@/components/sections/resources-section";
import { FinalCtaSection } from "@/components/sections/final-cta-section";

export default function Home() {
  return (
    <>
      <TopUtilityStrip />
      <SiteHeader />
      <HeroSection />
      <FeaturesSection />
      <RecitationsSection />
      <HowItWorksSection />
      <RolesSection />
      <TeachersSection />
      <CurriculumSection />
      <TestimonialsSection />
      <PricingSection />
      <AchievementsSection />
      <FaqSection />
      <NewsletterSection />
      <ContactSection />
      <VerseSection />
      <MobileAppSection />
      <TrustedSection />
      <ResourcesSection />
      <FinalCtaSection />
      <SiteFooter />
    </>
  );
}
