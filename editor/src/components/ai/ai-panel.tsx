"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const SUGGESTIONS = [
  "Find all dates & update period",
  "Format and prefix amounts ($ / ₹ / €)",
  "Mask account numbers (e.g. XXXX-1234)",
  "Summarize key balances and totals",
  "Find and fix spelling mistakes",
  "Add verified bank stamp",
  "Redact all sensitive PII",
];

type Proposal = {
  intent: string;
  confidence: number;
  explanation: string;
  operations: Array<Record<string, any>>;
  requires_confirmation: boolean;
};

type ProviderInfo = { id: string; name: string; model: string };

type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      proposal?: Proposal | null;
      requestId?: string;
      operationId?: string | null;
      applied?: boolean;
    };

export function AIPanel({
  documentId,
  selectedText,
  currentPage,
  onApplied,
  onFindMatches,
  externalPrompt,
}: {
  documentId: string;
  selectedText: string;
  currentPage: number;
  onApplied: () => void;
  onFindMatches: (find: string) => void;
  externalPrompt?: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "What would you like to do with this PDF?" },
  ]);
  const [input, setInput] = useState("");
  const [context, setContext] = useState<"selected" | "page" | "document">(
    selectedText ? "selected" : "page"
  );
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai/providers")
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers ?? []);
        setActiveProviderId(d.activeProviderId ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (externalPrompt) {
      send(externalPrompt);
    }
  }, [externalPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (promptText?: string) => {
    const prompt = (promptText ?? input).trim();
    if (!prompt || loading) return;
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    setLoading(true);
    setLastFailedPrompt(null);

    // Smart context resolution: fallback to 'page' if selectedText is empty
    const resolvedContext =
      context === "selected" && !selectedText ? "page" : context;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          documentId,
          context: resolvedContext,
          pages: [currentPage - 1],
          selectedText: selectedText || undefined,
          providerId: activeProviderId ?? undefined,
        }),
      });
      const data = await res.json();

      if (data.proposal) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.explanation || "Here is my proposed change.",
            proposal: data.proposal,
            requestId: data.requestId,
            operationId: data.operationId,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.explanation || "No response." },
        ]);
        setLastFailedPrompt(prompt);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Network error — the AI request could not be sent." },
      ]);
      setLastFailedPrompt(prompt);
    } finally {
      setLoading(false);
    }
  };

  const apply = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (msg.role !== "assistant" || !msg.proposal || !msg.requestId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: msg.requestId,
          operationId: msg.operationId,
          documentId,
          proposal: msg.proposal,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((m) =>
          m.map((m2, i) =>
            i === msgIndex && m2.role === "assistant" ? { ...m2, applied: true } : m2
          )
        );
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `✓ Applied ${data.applied} operation(s)${
              data.failed ? `, ${data.failed} failed` : ""
            }. New version created.`,
          },
        ]);
        onApplied();
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `✕ Apply failed: ${data.error || "unknown error"}` },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <span className="text-indigo-600">✦</span> EDITOR AI
          </h3>
          {providers.length > 0 ? (
            <select
              value={activeProviderId ?? ""}
              onChange={(e) => setActiveProviderId(e.target.value)}
              className="text-xs rounded border border-gray-200 px-1.5 py-1 max-w-[130px] truncate"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <Link href="/dashboard/settings/ai" className="text-xs text-indigo-600 hover:underline">
              Configure AI
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Context:</span>
          <select
            value={context}
            onChange={(e) => setContext(e.target.value as typeof context)}
            className="text-xs rounded border border-gray-200 px-1.5 py-1 flex-1"
          >
            <option value="selected">Selected text</option>
            <option value="page">Current page ({currentPage + 1})</option>
            <option value="document">Entire document</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            index={i}
            message={m}
            busy={loading}
            onApply={apply}
            onFind={(f) => onFindMatches(f)}
          />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3 h-3 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="px-3 pb-2">
          <p className="text-xs font-medium text-gray-400 mb-1.5">Suggestions</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 px-2.5 py-1 rounded-full text-gray-600 transition-colors cursor-pointer text-left"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 p-3">
        {lastFailedPrompt && !loading && (
          <button
            onClick={() => {
              const p = lastFailedPrompt;
              setLastFailedPrompt(null);
              send(p);
            }}
            className="w-full mb-2 text-xs border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 text-gray-600"
          >
            ↻ Retry last request
          </button>
        )}
        <div className="flex items-start gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask AI or tell it how to edit this PDF…"
            rows={2}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-50"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 self-end transition-colors cursor-pointer"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  index,
  busy,
  onApply,
  onFind,
}: {
  index: number;
  message: Message;
  busy: boolean;
  onApply: (index: number) => void;
  onFind: (find: string) => void;
}) {
  if (message.role === "system") {
    return <p className="text-xs text-gray-400 italic text-center pt-2">{message.content}</p>;
  }
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-indigo-600 text-white text-sm rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="bg-gray-100 text-gray-900 text-sm rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%]">
        {message.content}
      </div>
      {message.proposal && message.proposal.operations.length > 0 && (
        <div className="bg-white border border-indigo-200 rounded-xl p-3 max-w-[95%] space-y-2 w-full">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-700">AI PROPOSED CHANGE</p>
            <span className="text-[10px] text-gray-400">
              confidence {Math.round((message.proposal.confidence ?? 0) * 100)}%
            </span>
          </div>
          <div className="space-y-1">
            {message.proposal.operations.map((op: any, i: number) => (
              <div key={i} className="text-xs bg-gray-50 rounded px-2 py-1 flex items-center justify-between gap-2">
                <span className="font-medium text-gray-700 uppercase">{String(op.type)}</span>
                <span className="text-gray-500 truncate">
                  {op.find ? `“${String(op.find).slice(0, 24)}”` : ""}
                  {op.replace !== undefined ? ` → “${String(op.replace).slice(0, 24)}”` : ""}
                  {op.page !== undefined ? ` · p${Number(op.page) + 1}` : ""}
                </span>
                {op.type === "find_text" && op.find && (
                  <button
                    onClick={() => onFind(String(op.find))}
                    className="text-indigo-600 hover:underline flex-shrink-0"
                  >
                    show
                  </button>
                )}
              </div>
            ))}
          </div>
          {message.applied ? (
            <p className="text-xs text-green-700 font-medium">✓ Applied — see version history</p>
          ) : (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onApply(index)}
                disabled={busy}
                className="flex-1 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
              >
                {message.proposal.requires_confirmation ? "Confirm & Apply" : "Apply"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
