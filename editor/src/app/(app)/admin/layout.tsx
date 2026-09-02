"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, FileText, Sparkles, ScrollText } from "lucide-react";

const TABS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/documents", label: "Documents", icon: FileText },
  { href: "/admin/ai", label: "AI Usage", icon: Sparkles },
  { href: "/admin/audit", label: "Audit Logs", icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setRole(d.user?.role ?? null))
      .finally(() => setChecked(true));
  }, []);

  if (checked && role !== "admin") {
    return (
      <div className="p-10 text-center">
        <p className="text-sm font-semibold text-red-600">403 — Admin access required</p>
        <p className="text-xs text-gray-500 mt-1">
          Your account does not have the admin role. Ask an administrator to grant access.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Admin</h1>
          <p className="text-xs text-gray-400">
            Platform administration. All administrative access is logged.
          </p>
        </div>
      </div>

      <nav className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active
                  ? "border-gray-900 text-gray-900 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
