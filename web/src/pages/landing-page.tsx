import { MotionConfig } from "motion/react";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { PipelineSection } from "@/components/landing/pipeline-section";
import { SecuritySection } from "@/components/landing/security-section";
import { CtaSection, SiteFooter } from "@/components/landing/cta-section";

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-dvh flex-col">
      <LandingNav />
      <main className="flex-1">
        <HeroSection />
        <HowItWorksSection />
        <PipelineSection />
        <SecuritySection />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
    </MotionConfig>
  );
}
