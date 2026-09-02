import { AppShell } from "@/components/layout/app-shell";
import { AISettingsContent } from "./ai-settings-content";

export default function AISettingsPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <AISettingsContent />
      </div>
    </AppShell>
  );
}
