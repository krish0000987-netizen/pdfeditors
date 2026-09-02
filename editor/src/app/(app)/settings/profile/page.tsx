import { redirect } from "next/navigation";

export default function ProfileSettingsRedirect() {
  redirect("/dashboard/settings/profile");
}
