import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            EDITOR
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-medium bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight">
              Edit PDFs with{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                AI precision
              </span>
            </h1>
            <p className="mt-6 text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
              AI-Powered PDF Editor. Format-preserving text editing, intelligent annotations,
              true redaction, and AI-assisted operations — all in one platform.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/signup"
                className="text-base font-medium bg-gray-900 text-white px-8 py-3 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Start Editing Free
              </Link>
              <Link
                href="/login"
                className="text-base font-medium text-gray-600 px-8 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="mt-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                title: "Format-Preserving Editing",
                desc: "Edit text while preserving original fonts, layout, and visual fidelity. No re-rendering artifacts.",
              },
              {
                title: "AI-Powered Operations",
                desc: "Use any OpenAI-compatible AI to find, replace, summarize, and analyze documents with natural language.",
              },
              {
                title: "True PDF Redaction",
                desc: "Permanently remove sensitive information. Not a cover — the underlying content is actually deleted.",
              },
              {
                title: "Smart Annotations",
                desc: "Highlights, notes, stamps, and drawings. All metadata stored alongside the PDF.",
              },
              {
                title: "Version History",
                desc: "Every edit creates a version. Original documents are never overwritten. Compare any two versions.",
              },
              {
                title: "Audit Logging",
                desc: "Full audit trail of every operation — who, what, when. Compliance-ready logging for sensitive documents.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
              >
                <h3 className="text-base font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-between">
            <p className="text-sm text-gray-400">EDITOR — AI-Powered PDF Editor</p>
            <p className="text-sm text-gray-400">
              Powered by{" "}
              <a
                href="https://github.com/AryanBV/pdf-edit-engine"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600"
              >
                pdf-edit-engine
              </a>
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
