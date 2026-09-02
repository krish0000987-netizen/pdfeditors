"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileCheck, AlertCircle } from "lucide-react";

const DOC_TYPES = [
  { value: "general", label: "General PDF" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "invoice", label: "Invoice" },
  { value: "contract", label: "Contract" },
  { value: "form", label: "Form" },
  { value: "other", label: "Other" },
];

export function UploadZone({ onUploaded }: { onUploaded?: (docId: string) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [docType, setDocType] = useState("general");

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setSuccess(null);

      // client-side pre-validation (server re-validates everything)
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Only PDF files are accepted.");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError("File is too large (max 100MB).");
        return;
      }

      setProgress(5);
      const form = new FormData();
      form.append("file", file);
      form.append("document_type", docType);

      try {
        // XHR for real upload progress
        const xhr = new XMLHttpRequest();
        const result = await new Promise<{ ok: boolean; data: any }>((resolve) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              setProgress(Math.max(5, Math.round((e.loaded / e.total) * 70)));
            }
          });
          xhr.addEventListener("load", () => {
            let data: any = {};
            try {
              data = JSON.parse(xhr.responseText);
            } catch {}
            resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
          });
          xhr.addEventListener("error", () => resolve({ ok: false, data: { error: "Network error" } }));
          xhr.open("POST", "/api/docs/upload");
          xhr.send(form);
        });

        setProgress(85);
        if (!result.ok) {
          setError(result.data.error || "Upload failed.");
          setProgress(null);
          return;
        }

        setProgress(100);
        setSuccess(`Uploaded “${file.name}” — ${result.data.document.page_count} pages.`);
        onUploaded?.(result.data.document.id);
        setTimeout(() => {
          setProgress(null);
          router.refresh();
        }, 900);
      } catch {
        setError("Upload failed unexpectedly.");
        setProgress(null);
      }
    },
    [docType, onUploaded, router]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500">Document Type</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="text-xs rounded-lg border border-gray-200 px-2 py-1"
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
        <UploadCloud className="mx-auto text-gray-400 mb-3" size={36} />
        <p className="text-sm font-medium text-gray-900">Drop PDF here</p>
        <p className="text-xs text-gray-400 mt-1">or click to browse files — PDF only, max 100MB</p>
      </div>

      {progress !== null && (
        <div className="space-y-1">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <FileCheck size={13} />
            {progress < 100 ? `Uploading… ${progress}%` : "Processing…"}
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
          <FileCheck size={15} /> {success}
        </p>
      )}
    </div>
  );
}
