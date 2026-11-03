import { SiteHeader } from "@/components/layout/site-header";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { PipelineSection } from "@/components/landing/pipeline-section";
import { SecuritySection } from "@/components/landing/security-section";
import { CtaSection, SiteFooter } from "@/components/landing/cta-section";

export function LandingPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <PipelineSection />
        <SecuritySection />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
