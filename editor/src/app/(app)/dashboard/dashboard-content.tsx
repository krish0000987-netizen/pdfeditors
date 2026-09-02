"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UploadZone } from "@/components/documents/upload-zone";
import { DocumentCard, type Doc } from "@/components/documents/document-card";

type Stats = {
  total_documents: number;
  edited_documents: number;
  total_pages: number;
  ai_operations: number;
};

export function DashboardContent() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [statsRes, recentRes] = await Promise.all([
      fetch("/api/dashboard/stats"),
      fetch("/api/dashboard/recent"),
    ]);
    const [statsData, recentData] = await Promise.all([statsRes.json(), recentRes.json()]);
    setStats(statsData);
    setRecent(recentData.documents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const cards = [
    { label: "Total Documents", value: stats?.total_documents ?? 0 },
    { label: "Edited Documents", value: stats?.edited_documents ?? 0 },
    { label: "PDF Pages", value: stats?.total_pages ?? 0 },
    { label: "AI Operations", value: stats?.ai_operations ?? 0 },
  ];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{card.label}</p>
            {loading ? (
              <div className="h-8 w-14 bg-gray-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Upload a PDF</h2>
          <UploadZone
            onUploaded={(id) => {
              load();
              router.push(`/editor/${id}`);
            }}
          />
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Documents</h2>
            <Link href="/dashboard/recent" className="text-xs text-gray-500 hover:text-gray-900">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              No documents yet. Upload your first PDF to get started.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
              {recent.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} onChanged={load} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
