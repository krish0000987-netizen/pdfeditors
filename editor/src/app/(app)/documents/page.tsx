"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentGrid } from "@/components/documents/document-grid";

export default function DocumentsPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <Suspense fallback={null}>
          <DocumentsWithQuery />
        </Suspense>
      </div>
    </AppShell>
  );
}

function DocumentsWithQuery() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  return (
    <DocumentGrid
      filter="all"
      initialQuery={q}
      title="Documents"
      emptyMessage="No documents found. Upload a PDF to get started."
    />
  );
}
