"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Clock,
  Star,
  Sparkles,
  FolderOpen,
  Trash2,
  Settings,
  HelpCircle,
  LogOut,
  Search,
  Upload,
  Shield,
  X,
  Menu,
} from "lucide-react";

type User = { id: string; name: string; email: string; role: string };

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { divider: true as const },
  { href: "/dashboard/recent", label: "Recent Files", icon: Clock },
  { href: "/dashboard/favorites", label: "Favorites", icon: Star },
  { href: "/dashboard/ai", label: "AI Assistant", icon: Sparkles },
  { href: "/dashboard/templates", label: "Templates", icon: FolderOpen },
  { href: "/dashboard/trash", label: "Trash", icon: Trash2 },
  { divider: true as const },
  { href: "/dashboard/settings/profile", label: "Settings", icon: Settings },
  { href: "/dashboard/help", label: "Help", icon: HelpCircle },
];

const TITLES: Array<[string, string]> = [
  ["/dashboard/recent", "Recent Files"],
  ["/dashboard/favorites", "Favorites"],
  ["/dashboard/ai", "AI Assistant"],
  ["/dashboard/ai/history", "AI History"],
  ["/dashboard/templates", "Templates"],
  ["/dashboard/trash", "Trash"],
  ["/dashboard/help", "Help"],
  ["/dashboard/settings/profile", "Profile Settings"],
  ["/dashboard/settings/ai", "AI Settings"],
  ["/documents", "Documents"],
  ["/dashboard", "Dashboard"],
];

export function AppShell({
  children,
  actions,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => d.user && setUser(d.user))
      .catch(() => {});
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) router.push(`/documents?q=${encodeURIComponent(search.trim())}`);
  };

  const isAdmin = user?.role === "admin";
  const title =
    TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"))?.[1] ??
    "EDITOR";

  const navItem = (item: (typeof NAV)[number], i: number) => {
    if ("divider" in item) return <div key={i} className="border-t border-gray-100 my-2" />;
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={i}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          active
            ? "bg-gray-100 text-gray-900 font-medium"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        <Icon size={17} className="flex-shrink-0" />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gray-900 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">E</span>
            </div>
            <span className="font-bold tracking-tight">EDITOR</span>
          </Link>
          <button className="lg:hidden p-1" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {NAV.map(navItem)}
          {isAdmin && (
            <>
              <div className="border-t border-gray-100 my-2" />
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-gray-900 text-white font-medium"
                    : "text-indigo-700 hover:bg-indigo-50"
                }`}
              >
                <Shield size={17} className="flex-shrink-0" />
                <span>Admin</span>
              </Link>
            </>
          )}
        </nav>

        <div className="p-3 border-t border-gray-100">
          {user && (
            <div className="px-3 pb-2">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-red-600 w-full"
          >
            <LogOut size={17} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 h-14 flex items-center gap-3">
          <button className="lg:hidden p-2 -ml-2" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <form onSubmit={submitSearch} className="hidden sm:block flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </form>
          <div className="flex-1 sm:hidden" />
          <h1 className="sm:hidden text-sm font-medium">{title}</h1>
          <div className="flex items-center gap-2">
            {actions ?? (
              <>
                <label className="flex items-center gap-1.5 bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-800">
                  <Upload size={14} />
                  Upload PDF
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const form = new FormData();
                      form.append("file", file);
                      fetch("/api/docs/upload", { method: "POST", body: form }).then((r) => {
                        if (r.ok) router.push("/documents");
                        else r.json().then((d) => alert(d.error || "Upload failed"));
                      });
                    }}
                  />
                </label>
                <Link
                  href="/dashboard/ai"
                  className="hidden sm:flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50"
                >
                  <Sparkles size={14} />
                  AI Assistant
                </Link>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
