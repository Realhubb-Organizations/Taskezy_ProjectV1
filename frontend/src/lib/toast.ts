"use client";

// Replaces native alert()/confirm()-style popups with an animated, non-blocking
// toast (see components/ui/ToastHost.tsx). Plain module + listeners, not a
// React context — any file can call toast.success(...)/toast.error(...)
// without being wrapped in a provider, and it carries none of the hooks-order
// risk a context would.

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  duration: number;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let listeners: Listener[] = [];

function emit(): void {
  listeners.forEach((l) => l(toasts));
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener);
  listener(toasts);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function showToast(kind: ToastKind, title: string, message?: string, duration = 5000): string {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  toasts = [...toasts, { id, kind, title, message, duration }];
  emit();
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
  return id;
}

export const toast = {
  success: (title: string, message?: string) => showToast("success", title, message),
  // Errors stay a little longer — they usually need a fix, not just a glance.
  error: (title: string, message?: string) => showToast("error", title, message, 7000),
  warning: (title: string, message?: string) => showToast("warning", title, message, 6000),
  info: (title: string, message?: string) => showToast("info", title, message)
};
