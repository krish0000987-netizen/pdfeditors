"use client";

import { useState, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Image as ImageIcon,
  Stamp,
  Eraser,
  PenTool,
  Sparkles,
  Calendar,
  DollarSign,
  Undo2,
  Redo2,
  Trash2,
  Plus,
  CheckCircle2,
  Search,
  FileText,
  ShieldCheck,
  Building2,
  CreditCard,
  Layers,
} from "lucide-react";
import type { ActiveTool, CanvasTextElement } from "./types";

const FONT_FAMILIES = [
  { label: "Helvetica / Arial", value: "Helvetica, Arial, sans-serif" },
  { label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { label: "Courier (Monospace)", value: "Courier New, Courier, monospace" },
  { label: "Roboto / Sans", value: "Roboto, Inter, sans-serif" },
  { label: "Georgia (Serif)", value: "Georgia, serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, sans-serif" },
  { label: "Impact", value: "Impact, sans-serif" },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

const COLOR_PALETTE = [
  "#000000",
  "#1e293b",
  "#475569",
  "#2563eb",
  "#1d4ed8",
  "#059669",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#ffffff",
];

const HIGHLIGHT_PALETTE = [
  "transparent",
  "#fef08a",
  "#bbf7d0",
  "#bae6fd",
  "#fbcfe8",
  "#fed7aa",
  "#ffffff",
];

const BANK_STAMPS = [
  { title: "VERIFIED & APPROVED", color: "#059669", border: "#059669", bg: "#ecfdf5" },
  { title: "OFFICIAL BANK COPY", color: "#1d4ed8", border: "#1d4ed8", bg: "#eff6ff" },
  { title: "PAYMENT RECEIVED", color: "#059669", border: "#059669", bg: "#ecfdf5" },
  { title: "AUDITED & CERTIFIED", color: "#7c3aed", border: "#7c3aed", bg: "#f5f3ff" },
  { title: "ORIGINAL CERTIFICATE", color: "#b45309", border: "#b45309", bg: "#fffbeb" },
  { title: "CONFIDENTIAL", color: "#dc2626", border: "#dc2626", bg: "#fef2f2" },
];

export function EditorRibbon({
  activeTool,
  setActiveTool,
  selectedTextElement,
  onUpdateSelectedText,
  onAddText,
  onAddImage,
  onAddWhiteout,
  onAddStamp,
  onAddSignature,
  onOpenAI,
  onQuickAiPrompt,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDeleteSelected,
  hasSelection,
}: {
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  selectedTextElement: CanvasTextElement | null;
  onUpdateSelectedText: (updates: Partial<CanvasTextElement>) => void;
  onAddText: () => void;
  onAddImage: (dataUrl: string, width?: number, height?: number) => void;
  onAddWhiteout: () => void;
  onAddStamp: (title: string, color: string, bg: string) => void;
  onAddSignature: (dataUrl: string) => void;
  onOpenAI: () => void;
  onQuickAiPrompt: (prompt: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"home" | "insert" | "bank" | "ai">("home");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showStampModal, setShowStampModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [sigCanvasData, setSigCanvasData] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingSig = useRef(false);

  // Fallback defaults if no text box is actively selected
  const fontFam = selectedTextElement?.fontFamily || "Helvetica, Arial, sans-serif";
  const fontSize = selectedTextElement?.fontSize || 12;
  const isBold = selectedTextElement?.fontWeight === "bold";
  const isItalic = selectedTextElement?.fontStyle === "italic";
  const isUnderline = selectedTextElement?.underline ?? false;
  const textColor = selectedTextElement?.color || "#000000";
  const bgColor = selectedTextElement?.backgroundColor || "transparent";
  const textAlign = selectedTextElement?.textAlign || "left";

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const img = new Image();
        img.onload = () => {
          const maxDim = 200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = (h / w) * maxDim;
              w = maxDim;
            } else {
              w = (w / h) * maxDim;
              h = maxDim;
            }
          }
          onAddImage(dataUrl, Math.round(w), Math.round(h));
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Signature canvas handlers
  const startDrawingSig = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawingSig.current = true;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const drawSig = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingSig.current) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e3a8a"; // Navy signature ink
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawingSig = () => {
    isDrawingSig.current = false;
    if (sigCanvasRef.current) {
      setSigCanvasData(sigCanvasRef.current.toDataURL("image/png"));
    }
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigCanvasData(null);
  };

  const saveSignature = () => {
    if (sigCanvasData) {
      onAddSignature(sigCanvasData);
      setShowSignatureModal(false);
      clearSignature();
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 select-none shadow-xs">
      {/* Hidden File Input for Image Insertion */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
      />

      {/* Ribbon Top Tabs (MS Word Style) */}
      <div className="flex items-center px-4 pt-1 border-b border-gray-100 bg-gray-50/80 text-xs font-medium text-gray-600 gap-1">
        <button
          onClick={() => setActiveTab("home")}
          className={`px-3 py-1.5 rounded-t-md transition-colors ${
            activeTab === "home"
              ? "bg-white text-blue-600 font-semibold border-t-2 border-blue-600 shadow-xs"
              : "hover:bg-gray-200/60 text-gray-700"
          }`}
        >
          Home
        </button>
        <button
          onClick={() => setActiveTab("insert")}
          className={`px-3 py-1.5 rounded-t-md transition-colors ${
            activeTab === "insert"
              ? "bg-white text-blue-600 font-semibold border-t-2 border-blue-600 shadow-xs"
              : "hover:bg-gray-200/60 text-gray-700"
          }`}
        >
          Insert
        </button>
        <button
          onClick={() => setActiveTab("bank")}
          className={`px-3 py-1.5 rounded-t-md transition-colors flex items-center gap-1 ${
            activeTab === "bank"
              ? "bg-white text-blue-600 font-semibold border-t-2 border-blue-600 shadow-xs"
              : "hover:bg-gray-200/60 text-gray-700"
          }`}
        >
          <Building2 className="w-3.5 h-3.5 text-blue-500" />
          Bank &amp; Document Tools
        </button>
        <button
          onClick={() => {
            setActiveTab("ai");
            onOpenAI();
          }}
          className={`px-3 py-1.5 rounded-t-md transition-colors flex items-center gap-1.5 ${
            activeTab === "ai"
              ? "bg-white text-purple-600 font-semibold border-t-2 border-purple-600 shadow-xs"
              : "hover:bg-purple-50 text-purple-700 font-medium"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          AI Copilot
        </button>

        <div className="ml-auto flex items-center gap-1 pb-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1 rounded hover:bg-gray-200 text-gray-600 disabled:opacity-35"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1 rounded hover:bg-gray-200 text-gray-600 disabled:opacity-35"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          {hasSelection && (
            <button
              onClick={onDeleteSelected}
              title="Delete Element (Delete)"
              className="p-1 rounded hover:bg-red-50 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Ribbon Command Strip */}
      <div className="px-4 py-2 flex items-center gap-3 overflow-x-auto text-xs min-h-[52px]">
        {/* ── HOME TAB: MS WORD TYPOGRAPHY & FORMATTING ── */}
        {activeTab === "home" && (
          <>
            {/* Direct Tool Activator */}
            <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
              <button
                onClick={onAddText}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium text-xs transition-colors ${
                  activeTool === "text"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
                title="Click anywhere on PDF to type"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Text Box</span>
              </button>
              <button
                onClick={onAddWhiteout}
                className={`p-1.5 rounded-md text-gray-700 transition-colors ${
                  activeTool === "whiteout" ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                }`}
                title="Whiteout / Cover Area"
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>

            {/* Font Family Dropdown */}
            <div className="flex items-center gap-1">
              <select
                value={fontFam}
                onChange={(e) => onUpdateSelectedText({ fontFamily: e.target.value })}
                className="rounded border border-gray-300 px-2 py-1 text-xs bg-white text-gray-800 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none w-36"
                title="Font Family"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              {/* Font Size Dropdown */}
              <select
                value={fontSize}
                onChange={(e) => onUpdateSelectedText({ fontSize: Number(e.target.value) })}
                className="rounded border border-gray-300 px-2 py-1 text-xs bg-white text-gray-800 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none w-14"
                title="Font Size"
              >
                {FONT_SIZES.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </div>

            {/* Bold, Italic, Underline */}
            <div className="flex items-center gap-0.5 px-2 border-x border-gray-200">
              <button
                onClick={() =>
                  onUpdateSelectedText({ fontWeight: isBold ? "normal" : "bold" })
                }
                className={`p-1.5 rounded transition-colors ${
                  isBold ? "bg-blue-100 text-blue-700 font-bold" : "hover:bg-gray-100 text-gray-700"
                }`}
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  onUpdateSelectedText({ fontStyle: isItalic ? "normal" : "italic" })
                }
                className={`p-1.5 rounded transition-colors ${
                  isItalic ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-700"
                }`}
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onUpdateSelectedText({ underline: !isUnderline })}
                className={`p-1.5 rounded transition-colors ${
                  isUnderline ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-700"
                }`}
                title="Underline (Ctrl+U)"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Text Color & Highlight Color Pickers */}
            <div className="flex items-center gap-1.5 pr-2 border-r border-gray-200 relative">
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="flex items-center gap-1 p-1 rounded hover:bg-gray-100 border border-gray-200"
                  title="Font Color"
                >
                  <span className="font-bold text-xs">A</span>
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-gray-300"
                    style={{ backgroundColor: textColor }}
                  />
                </button>
                {showColorPicker && (
                  <div className="absolute top-8 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1.5 w-36">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          onUpdateSelectedText({ color: c });
                          setShowColorPicker(false);
                        }}
                        className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowBgPicker(!showBgPicker)}
                  className="flex items-center gap-1 p-1 rounded hover:bg-gray-100 border border-gray-200 text-gray-700"
                  title="Highlight / Background Fill"
                >
                  <Type className="w-3.5 h-3.5" />
                  <span
                    className="w-3.5 h-3.5 rounded border border-gray-300"
                    style={{ backgroundColor: bgColor === "transparent" ? "#fff" : bgColor }}
                  />
                </button>
                {showBgPicker && (
                  <div className="absolute top-8 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-4 gap-1.5 w-32">
                    {HIGHLIGHT_PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          onUpdateSelectedText({ backgroundColor: c });
                          setShowBgPicker(false);
                        }}
                        className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform text-[9px] flex items-center justify-center font-bold"
                        style={{ backgroundColor: c === "transparent" ? "#ffffff" : c }}
                      >
                        {c === "transparent" ? "∅" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Text Alignment */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onUpdateSelectedText({ textAlign: "left" })}
                className={`p-1.5 rounded ${
                  textAlign === "left" ? "bg-gray-200 text-gray-900" : "hover:bg-gray-100 text-gray-600"
                }`}
                title="Align Left"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onUpdateSelectedText({ textAlign: "center" })}
                className={`p-1.5 rounded ${
                  textAlign === "center" ? "bg-gray-200 text-gray-900" : "hover:bg-gray-100 text-gray-600"
                }`}
                title="Align Center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onUpdateSelectedText({ textAlign: "right" })}
                className={`p-1.5 rounded ${
                  textAlign === "right" ? "bg-gray-200 text-gray-900" : "hover:bg-gray-100 text-gray-600"
                }`}
                title="Align Right"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}

        {/* ── INSERT TAB: IMAGES, STAMPS, SIGNATURES, SHAPES ── */}
        {activeTab === "insert" && (
          <div className="flex items-center gap-3">
            <button
              onClick={onAddText}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-800 font-medium"
            >
              <Type className="w-4 h-4 text-blue-600" />
              <span>Text Box</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-800 font-medium"
            >
              <ImageIcon className="w-4 h-4 text-emerald-600" />
              <span>Insert Image / Logo</span>
            </button>

            <button
              onClick={() => setShowSignatureModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-800 font-medium"
            >
              <PenTool className="w-4 h-4 text-indigo-600" />
              <span>Signature</span>
            </button>

            <button
              onClick={() => setShowStampModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-800 font-medium"
            >
              <Stamp className="w-4 h-4 text-amber-600" />
              <span>Bank / Approval Stamp</span>
            </button>

            <button
              onClick={onAddWhiteout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-800 font-medium"
            >
              <Eraser className="w-4 h-4 text-rose-600" />
              <span>Whiteout Box</span>
            </button>
          </div>
        )}

        {/* ── BANK & DOCUMENT TOOLS TAB ── */}
        {activeTab === "bank" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50/70 border border-blue-200 rounded-lg">
              <DollarSign className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-semibold text-blue-900 text-xs">Currencies:</span>
              {["$", "₹", "€", "£", "AED", "¥"].map((cur) => (
                <button
                  key={cur}
                  onClick={() => onQuickAiPrompt(`Format and prefix all monetary amounts with ${cur}`)}
                  className="px-1.5 py-0.5 bg-white border border-blue-200 hover:bg-blue-100 rounded text-xs font-bold text-gray-800"
                >
                  {cur}
                </button>
              ))}
            </div>

            <button
              onClick={() =>
                onQuickAiPrompt("Update statement period dates to current month and adjust dates accordingly")
              }
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-800"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span>Statement Period</span>
            </button>

            <button
              onClick={() =>
                onQuickAiPrompt("Mask bank account number showing only last 4 digits (e.g. XXXX-XXXX-1234)")
              }
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-800"
            >
              <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
              <span>Mask Account No.</span>
            </button>

            <button
              onClick={() => setShowStampModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Add Verified Stamp</span>
            </button>
          </div>
        )}

        {/* ── AI COPILOT TAB: SMART PROMPTS & ACTIONS ── */}
        {activeTab === "ai" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-purple-900 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              AI Shortcuts:
            </span>
            <button
              onClick={() => onQuickAiPrompt("Find and fix any spelling or grammar mistakes")}
              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-md text-xs font-medium"
            >
              Fix Spelling
            </button>
            <button
              onClick={() =>
                onQuickAiPrompt("Summarize the key information and totals from this bank statement / document")
              }
              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-md text-xs font-medium"
            >
              Summarize Statement
            </button>
            <button
              onClick={() =>
                onQuickAiPrompt("Identify and redact all sensitive personal data (SSN, Phone, Full Address)")
              }
              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-md text-xs font-medium"
            >
              Redact PII
            </button>
            <button
              onClick={onOpenAI}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center gap-1"
            >
              Open AI Chat ➔
            </button>
          </div>
        )}
      </div>

      {/* ── MODAL: BANK STAMP SELECTION ── */}
      {showStampModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <Stamp className="w-4 h-4 text-amber-600" />
                Select Official Bank / Approval Stamp
              </h3>
              <button
                onClick={() => setShowStampModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 max-h-72 overflow-y-auto">
              {BANK_STAMPS.map((st) => (
                <button
                  key={st.title}
                  onClick={() => {
                    onAddStamp(st.title, st.color, st.bg);
                    setShowStampModal(false);
                  }}
                  className="p-3 rounded-lg border-2 text-center transition-transform hover:scale-102 flex flex-col items-center justify-center gap-1"
                  style={{ borderColor: st.border, backgroundColor: st.bg }}
                >
                  <ShieldCheck className="w-5 h-5" style={{ color: st.color }} />
                  <span className="font-black text-xs tracking-wider" style={{ color: st.color }}>
                    {st.title}
                  </span>
                  <span className="text-[9px] font-medium text-gray-500">
                    {new Date().toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DRAW / INSERT SIGNATURE ── */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <PenTool className="w-4 h-4 text-indigo-600" />
                Draw Digital Signature
              </h3>
              <button
                onClick={() => {
                  setShowSignatureModal(false);
                  clearSignature();
                }}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50/50">
              <canvas
                ref={sigCanvasRef}
                width={400}
                height={160}
                onMouseDown={startDrawingSig}
                onMouseMove={drawSig}
                onMouseUp={stopDrawingSig}
                onMouseLeave={stopDrawingSig}
                className="cursor-crosshair w-full block bg-white"
              />
            </div>
            <p className="text-[11px] text-gray-500">
              Draw your signature above using mouse or touchpad. It will be placed as a transparent vector overlay.
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <button
                onClick={clearSignature}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Clear
              </button>
              <button
                onClick={saveSignature}
                disabled={!sigCanvasData}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40"
              >
                Insert Signature
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
