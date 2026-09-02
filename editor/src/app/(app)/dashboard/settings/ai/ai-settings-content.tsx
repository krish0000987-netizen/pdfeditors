"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

type Provider = {
  id: string;
  name: string;
  provider_type: string;
  base_url: string;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
  retry_count: number;
  is_active: boolean;
  is_enabled: boolean;
  last_test_ok: boolean | null;
  usage_requests: number;
};

type TestState = { status: "idle" | "testing" | "ok" | "fail"; message?: string };

const TYPE_LABELS: Record<string, string> = {
  openai_compatible: "OpenAI Compatible",
  anthropic_compatible: "Anthropic Compatible",
  gemini_compatible: "Gemini Compatible",
  custom: "Custom REST",
};

const EMPTY_FORM = {
  name: "",
  provider_type: "openai_compatible",
  base_url: "",
  api_key: "",
  model: "",
  temperature: 0.2,
  max_tokens: 4096,
  timeout_seconds: 60,
  retry_count: 1,
};

export function AISettingsContent() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [perProviderTest, setPerProviderTest] = useState<Record<string, TestState>>({});
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/ai/providers");
    const data = await res.json();
    setProviders(data.providers ?? []);
    setActiveProviderId(data.activeProviderId ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const startAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setTest({ status: "idle" });
    setModels([]);
    setShowForm(true);
  };

  const startEdit = (p: Provider) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      provider_type: p.provider_type,
      base_url: p.base_url,
      api_key: "", // never echo stored keys
      model: p.model,
      temperature: p.temperature,
      max_tokens: p.max_tokens,
      timeout_seconds: p.timeout_seconds,
      retry_count: p.retry_count,
    });
    setTest({ status: "idle" });
    setModels([]);
    setShowForm(true);
  };

  const fetchModels = async () => {
    if (!form.base_url || !form.api_key) return;
    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_url: form.base_url, api_key: form.api_key }),
      });
      const data = await res.json();
      setModels(data.models ?? []);
      if (!data.models?.length) alert(data.detail || "Provider did not return a model list — enter the model ID manually.");
    } catch {
      alert("Could not fetch model list — enter the model ID manually.");
    }
  };

  const testDraft = async () => {
    if (!form.base_url || !form.api_key || !form.model) {
      setTest({ status: "fail", message: "Fill base URL, API key and model first." });
      return;
    }
    setTest({ status: "testing" });
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: form.base_url,
          api_key: form.api_key,
          model: form.model,
          provider_type: form.provider_type,
        }),
      });
      const data = await res.json();
      setTest({ status: data.success ? "ok" : "fail", message: data.detail });
    } catch {
      setTest({ status: "fail", message: "Network error" });
    }
  };

  const save = async () => {
    if (!form.name || !form.base_url || !form.model) {
      setTest({ status: "fail", message: "Name, base URL and model are required." });
      return;
    }
    if (!editingId && !form.api_key) {
      setTest({ status: "fail", message: "API key is required for a new provider." });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        provider_type: form.provider_type,
        base_url: form.base_url,
        model: form.model,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        timeout_seconds: form.timeout_seconds,
        retry_count: form.retry_count,
      };
      if (form.api_key) payload.api_key = form.api_key;

      const res = await fetch("/api/ai/providers", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setTest({ status: "fail", message: data.error || "Save failed" });
        return;
      }
      setShowForm(false);
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const testStored = async (p: Provider) => {
    setPerProviderTest((s) => ({ ...s, [p.id]: { status: "testing" } }));
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: p.id }),
      });
      const data = await res.json();
      setPerProviderTest((s) => ({
        ...s,
        [p.id]: { status: data.success ? "ok" : "fail", message: data.detail },
      }));
      load();
    } catch {
      setPerProviderTest((s) => ({ ...s, [p.id]: { status: "fail", message: "Network error" } }));
    }
  };

  const setActive = async (id: string) => {
    await fetch("/api/ai/providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", provider_id: id }),
    });
    load();
  };

  const toggleEnabled = async (p: Provider) => {
    await fetch("/api/ai/providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, is_enabled: !p.is_enabled }),
    });
    load();
  };

  const remove = async (p: Provider) => {
    if (!confirm(`Delete provider “${p.name}”? Its API key will be discarded.`)) return;
    await fetch("/api/ai/providers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    load();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-base font-semibold">AI Providers</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Connect any OpenAI-compatible (or Anthropic / Gemini style) API. Keys are encrypted
              server-side and never sent to your browser.
            </p>
          </div>
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 bg-gray-900 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex-shrink-0"
          >
            <Plus size={15} /> Add Provider
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border-2 border-gray-900 p-6 space-y-4">
          <h3 className="text-sm font-semibold">
            {editingId ? "Edit provider (leave key blank to keep current)" : "New AI provider"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Provider Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My AI Provider"
                className="input"
              />
            </Field>
            <Field label="API Type">
              <select
                value={form.provider_type}
                onChange={(e) => setForm({ ...form, provider_type: e.target.value })}
                className="input"
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Base URL (include /v1 only if your provider requires it)">
                <input
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://provider.example.com/v1"
                  className="input"
                />
              </Field>
            </div>
            <Field label={editingId ? "API Key (blank = unchanged)" : "API Key"}>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder="••••••••"
                className="input"
              />
            </Field>
            <Field label="Model">
              <div className="flex gap-1.5">
                {models.length > 0 ? (
                  <select
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="input"
                  >
                    <option value="">Select model…</option>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="model-id"
                    className="input"
                  />
                )}
                <button
                  onClick={fetchModels}
                  title="Fetch available models"
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 flex-shrink-0"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </Field>
            <Field label="Temperature">
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })}
                className="input"
              />
            </Field>
            <Field label="Max Tokens">
              <input
                type="number"
                value={form.max_tokens}
                onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })}
                className="input"
              />
            </Field>
            <Field label="Timeout (s)">
              <input
                type="number"
                value={form.timeout_seconds}
                onChange={(e) =>
                  setForm({ ...form, timeout_seconds: parseInt(e.target.value) || 60 })
                }
                className="input"
              />
            </Field>
            <Field label="Retries">
              <input
                type="number"
                min="1"
                max="3"
                value={form.retry_count}
                onChange={(e) => setForm({ ...form, retry_count: parseInt(e.target.value) || 1 })}
                className="input"
              />
            </Field>
          </div>

          {test.status !== "idle" && (
            <div
              className={`text-sm rounded-lg px-3 py-2 flex items-center gap-2 ${
                test.status === "ok"
                  ? "bg-green-50 text-green-700"
                  : test.status === "fail"
                    ? "bg-red-50 text-red-700"
                    : "bg-gray-50 text-gray-600"
              }`}
            >
              {test.status === "testing" && <Loader2 size={15} className="animate-spin" />}
              {test.status === "ok" && <CheckCircle2 size={15} />}
              {test.status === "fail" && <XCircle size={15} />}
              {test.status === "testing"
                ? "Testing connection…"
                : test.status === "ok"
                  ? `Connection successful — ${test.message ?? ""}`
                  : test.message ?? "Connection failed"}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={testDraft}
              disabled={test.status === "testing"}
              className="border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Test Connection
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Save Changes" : "Save Provider"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 px-3 py-2 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 bg-white border border-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
          No AI providers configured. Add one to enable the AI assistant.
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => {
            const t = perProviderTest[p.id];
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-gray-900">{p.name}</h3>
                      {activeProviderId === p.id && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                          Active
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {TYPE_LABELS[p.provider_type] ?? p.provider_type}
                      </span>
                      {!p.is_enabled && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                          disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">{p.base_url}</p>
                    <p className="text-xs text-gray-500">
                      Model: {p.model} · {p.usage_requests} request(s) used
                    </p>
                    {t?.message && (
                      <p
                        className={`text-xs mt-1 ${
                          t.status === "ok" ? "text-green-600" : t.status === "fail" ? "text-red-600" : "text-gray-500"
                        }`}
                      >
                        {t.status === "ok" ? "✓ " : t.status === "fail" ? "✕ " : ""}
                        {t.message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {activeProviderId !== p.id && (
                      <button
                        onClick={() => setActive(p.id)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      onClick={() => testStored(p)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => startEdit(p)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => toggleEnabled(p)}
                      className="text-xs px-2 py-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                      title={p.is_enabled ? "Disable" : "Enable"}
                    >
                      {p.is_enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => remove(p)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-600 space-y-2">
        <h3 className="font-medium text-gray-900">About provider types</h3>
        <p>
          <strong>OpenAI Compatible</strong> covers OpenAI, OpenRouter, DeepSeek, Groq, Mistral,
          Together, OpenCode-style gateways, and self-hosted proxies exposing
          <code className="mx-1 text-xs bg-gray-100 px-1 rounded">/chat/completions</code>.
        </p>
        <p>
          <strong>Anthropic Compatible</strong> uses the
          <code className="mx-1 text-xs bg-gray-100 px-1 rounded">/v1/messages</code> wire format.
          <strong> Gemini Compatible</strong> uses the
          <code className="mx-1 text-xs bg-gray-100 px-1 rounded">generateContent</code> format.
        </p>
        <p className="text-xs text-gray-400">
          No particular provider or model is guaranteed to remain available or free — you bring your
          own account and key, and EDITOR never proxies your key anywhere except the provider you
          configure.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
