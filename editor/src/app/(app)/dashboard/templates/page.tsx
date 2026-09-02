"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, FileText, Landmark, ReceiptText, FileSignature, FormInput, File } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

const TEMPLATES = [
  { type: "general", label: "Blank Document", desc: "A fresh multi-page PDF.", icon: FileText },
  { type: "bank_statement", label: "Bank Statement Review", desc: "Classified for transaction search, extraction and redaction.", icon: Landmark },
  { type: "invoice", label: "Invoice", desc: "Classified for amount and date search.", icon: ReceiptText },
  { type: "contract", label: "Contract", desc: "Classified for clause review and annotation.", icon: FileSignature },
  { type: "form", label: "Form", desc: "Classified for field extraction.", icon: FormInput },
  { type: "other", label: "Other", desc: "Unclassified working document.", icon: File },
];

export default function TemplatesPage() {
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);

  const create = async (type: string, label: string) => {
    setCreating(type);
    const res = await fetch("/api/docs/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${label}.pdf`, document_type: type, pages: 1 }),
    });
    const data = await res.json();
    setCreating(null);
    if (res.ok) router.push(`/editor/${data.document.id}`);
    else alert(data.error || "Could not create document");
  };

  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Templates</h1>
        <p className="text-sm text-gray-500 mb-6">
          Start a new document with the right classification. The PDF engine creates a real blank PDF
          you can annotate and edit immediately.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.type}
                onClick={() => create(t.type, t.label)}
                disabled={creating !== null}
                className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-gray-400 transition-colors disabled:opacity-50"
              >
                <Icon className="text-gray-400 mb-3" size={26} />
                <p className="text-sm font-semibold text-gray-900">{t.label}</p>
                <p className="text-xs text-gray-500 mt-1">{t.desc}</p>
                <p className="text-xs text-indigo-600 mt-3 flex items-center gap-1">
                  <FilePlus2 size={13} />
                  {creating === t.type ? "Creating…" : "Create document"}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
