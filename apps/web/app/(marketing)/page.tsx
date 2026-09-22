import {
  FoundationsSection,
  HubCostSection,
  LandingFooter,
  LandingHero,
  LandingNav,
  ModesSection,
  PipelineSection,
} from '@/components/landing';

export default function LandingPage() {
  return (
    <div className="relative">
      <LandingNav />
      <main>
        <LandingHero />
        <FoundationsSection />
        <ModesSection />
        <PipelineSection />
        <HubCostSection />
      </main>
      <LandingFooter />
    </div>
  );
}
