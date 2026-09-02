import { AppShell } from "@/components/layout/app-shell";
import { AIHubContent } from "./ai-hub-content";

export default function AIHubPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <AIHubContent />
      </div>
    </AppShell>
  );
}
