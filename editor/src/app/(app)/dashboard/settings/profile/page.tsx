import { AppShell } from "@/components/layout/app-shell";
import { ProfileContent } from "./profile-content";

export default function ProfileSettingsPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <ProfileContent />
      </div>
    </AppShell>
  );
}
