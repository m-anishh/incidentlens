import { DemoBanner } from "@/components/layout/DemoBanner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner />
      {children}
    </>
  );
}
