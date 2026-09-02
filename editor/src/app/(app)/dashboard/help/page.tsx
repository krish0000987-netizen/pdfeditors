import { AppShell } from "@/components/layout/app-shell";

const FAQ = [
  {
    q: "How do I edit text in a PDF?",
    a: "Open a document, select text in the viewer, then choose “Edit Text”. The engine rewrites the text run at the content-stream level while preserving the original font and layout. Every edit creates a new version — the original file is never modified.",
  },
  {
    q: "Are my documents private?",
    a: "Yes. PDFs are stored in a private bucket with row-level security. Files are only served through authenticated server routes, never public URLs. All access is recorded in the audit log.",
  },
  {
    q: "How does the AI work?",
    a: "The AI converts your natural-language request into a strict JSON list of operations (find, replace, highlight, redact, page ops…). The operations are validated server-side, shown to you as a preview, and only executed after you confirm. Bring your own OpenAI-compatible API key in Settings → AI.",
  },
  {
    q: "Is redaction real redaction?",
    a: "Yes. Confirming a redaction removes the underlying text content from the PDF and draws an opaque cover box in a new version. The original file stays untouched; the redacted version truly no longer contains the text.",
  },
  {
    q: "Can I use bank statements?",
    a: "Set the document type to “Bank Statement” when uploading to get transaction-oriented tooling: text search, date/amount search, highlighting and true redaction. The original financial document is always preserved as version 1.",
  },
  {
    q: "Where are my API keys stored?",
    a: "AI provider keys are encrypted with AES-256-GCM using a server-side key (APP_ENCRYPTION_KEY) before being stored. They are never sent to the browser and never appear in logs.",
  },
];

export default function HelpPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Help</h1>
        <p className="text-sm text-gray-500 mb-6">
          EDITOR — AI-Powered PDF Editor, built on the pdf-edit-engine for format-preserving editing.
        </p>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="bg-white rounded-xl border border-gray-200 p-4 open:shadow-sm"
            >
              <summary className="text-sm font-semibold text-gray-900 cursor-pointer">
                {item.q}
              </summary>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
