import { LandingHero } from "@/components/LandingHero";
import { getLandingGraphNodes } from "@/lib/landingGraph";

export default async function LandingPage() {
  const nodes = await getLandingGraphNodes();
  return <LandingHero nodes={nodes} />;
}
