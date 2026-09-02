import { AppShell } from "@/components/layout/app-shell";
import { DocumentGrid } from "@/components/documents/document-grid";

export default function FavoritesPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <DocumentGrid
          filter="favorites"
          title="Favorites"
          emptyMessage="No favorites yet. Star a document to pin it here."
        />
      </div>
    </AppShell>
  );
}
