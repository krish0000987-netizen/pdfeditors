import { AppShell } from "@/components/layout/app-shell";
import { DashboardContent } from "./dashboard-content";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
        <DashboardContent />
      </div>
    </AppShell>
  );
}
