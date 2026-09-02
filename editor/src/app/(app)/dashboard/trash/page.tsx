import { AppShell } from "@/components/layout/app-shell";
import { DocumentGrid } from "@/components/documents/document-grid";

export default function TrashPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <DocumentGrid
          filter="trash"
          title="Trash"
          showFilters={false}
          emptyMessage="Trash is empty."
        />
      </div>
    </AppShell>
  );
}
