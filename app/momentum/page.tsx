import { MomentumScreenTabs } from "@/components/MomentumScreenTabs";
import { getSectorCounts } from "@/lib/momentum-universe";

export default function MomentumPage() {
  return (
    <>
      <h1>Momentum &amp; quality screen</h1>
      <MomentumScreenTabs sectorCounts={getSectorCounts()} />
    </>
  );
}
