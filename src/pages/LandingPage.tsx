import DiscoveredSection from "../components/landing/DiscoveredSection";
import FinalCtaSection from "../components/landing/FinalCtaSection";
import HeroSection from "../components/landing/HeroSection";
import LandingBottomNav from "../components/landing/LandingBottomNav";
import LandingHeader from "../components/landing/LandingHeader";
import QuickStartSection from "../components/landing/QuickStartSection";
import WorkflowSection from "../components/landing/WorkflowSection";

function LandingPage() {
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased flex flex-col min-h-screen relative">
      <LandingHeader />

      <main className="flex-1 flex flex-col relative w-full pt-16 pb-20 bg-surface lg:pb-10">
        <div className="flex flex-col w-full">
          <HeroSection />
          <DiscoveredSection />
          <QuickStartSection />
          <WorkflowSection />
          <FinalCtaSection />
        </div>
      </main>

      <LandingBottomNav />
    </div>
  );
}

export default LandingPage;
