"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";

// App-wide replacement for the browser's alert() / confirm() / prompt(), in
// the app's own style:
//   toast(message, tone)   → small message in the corner that hides itself
//   await confirm({...})   → our confirm popup, resolves true/false
//   await prompt({...})    → our input popup, resolves the text or null
// Usage: const { toast, confirm, prompt } = useDialog();

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletes and other destructive actions. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: React.ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** When set, shows a picker of these values instead of a free-text field. */
  options?: string[];
  /** Return an error message to keep the popup open, or null when valid. */
  validate?: (value: string) => string | null;
}

interface DialogApi {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}

interface ToastItem { id: number; message: string; tone: ToastTone }
type ActiveDialog =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

const TOAST_MS = 4000;

const TOAST_STYLES: Record<ToastTone, { box: string; icon: React.ReactNode }> = {
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> },
  error: { box: "border-red-200 bg-red-50 text-red-800", icon: <XCircle className="h-4 w-4 text-red-600 shrink-0" /> },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-800", icon: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" /> },
  info: { box: "border-slate-200 bg-white text-slate-800", icon: <Info className="h-4 w-4 text-blue-600 shrink-0" /> }
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(1);

  useEffect(() => { setMounted(true); }, []);

  const dismissToast = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    setToasts(prev => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => dismissToast(id), TOAST_MS);
  }, [dismissToast]);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>(resolve => {
    setDialog({ kind: "confirm", opts, resolve });
  }), []);

  const prompt = useCallback((opts: PromptOptions) => new Promise<string | null>(resolve => {
    setDialog({ kind: "prompt", opts, resolve });
  }), []);

  const close = (result: boolean | string | null) => {
    if (!dialog) return;
    if (dialog.kind === "confirm") dialog.resolve(result === true);
    else dialog.resolve(typeof result === "string" ? result : null);
    setDialog(null);
  };

  return (
    <DialogContext.Provider value={{ toast, confirm, prompt }}>
      {children}
      {mounted && createPortal(
        <>
          {dialog && <DialogModal dialog={dialog} onClose={close} />}
          <div
            className="fixed z-[400] right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
            style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
            aria-live="polite"
          >
            {toasts.map(t => (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg animate-fade-in ${TOAST_STYLES[t.tone].box}`}
              >
                {TOAST_STYLES[t.tone].icon}
                <span className="flex-1 min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">{t.message}</span>
                <button type="button" onClick={() => dismissToast(t.id)} className="opacity-60 hover:opacity-100 shrink-0" aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </DialogContext.Provider>
  );
}

function DialogModal({ dialog, onClose }: { dialog: ActiveDialog; onClose: (result: boolean | string | null) => void }) {
  const isPrompt = dialog.kind === "prompt";
  const promptOpts = isPrompt ? dialog.opts : null;
  const [value, setValue] = useState(promptOpts?.defaultValue ?? promptOpts?.options?.[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement & HTMLSelectElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const cancel = () => onClose(isPrompt ? null : false);
  const submit = () => {
    if (!isPrompt) { onClose(true); return; }
    const v = value.trim();
    const problem = promptOpts?.validate ? promptOpts.validate(v) : v ? null : "Please enter a value.";
    if (problem) { setError(problem); return; }
    onClose(v);
  };

  const opts = dialog.opts;
  const danger = dialog.kind === "confirm" && dialog.opts.danger;
  const confirmLabel = opts.confirmLabel ?? (isPrompt ? "Save" : "Confirm");
  const cancelLabel = dialog.kind === "confirm" ? dialog.opts.cancelLabel ?? "Cancel" : "Cancel";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
    >
      <div className="fixed inset-0 bg-slate-900/40" onClick={cancel} />
      <form
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h3 className="text-lg font-extrabold text-slate-900">{opts.title}</h3>
        </div>
        <div className="px-6 py-5 space-y-3">
          {opts.message && <div className="text-sm text-slate-700 whitespace-pre-line">{opts.message}</div>}
          {promptOpts && (
            <div className="space-y-1.5">
              {promptOpts.label && <label className="block text-[11px] font-bold text-slate-500">{promptOpts.label}</label>}
              {promptOpts.options ? (
                <select
                  ref={inputRef}
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setError(null); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-brand-500"
                >
                  {promptOpts.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  ref={inputRef}
                  value={value}
                  placeholder={promptOpts.placeholder}
                  onChange={(e) => { setValue(e.target.value); setError(null); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-brand-500"
                />
              )}
              {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={cancel}
            className="px-5 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 text-sm hover:bg-slate-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={`px-5 py-2 rounded-xl font-bold text-sm text-white transition-colors ${danger ? "bg-red-600 hover:bg-red-700" : "bg-[#0B1E6E] hover:bg-[#081650]"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
