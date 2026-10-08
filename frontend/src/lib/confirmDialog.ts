"use client";

// Replaces native confirm() with an animated, in-app Yes/No dialog (see
// components/ui/ConfirmHost.tsx). Same plain-module pattern as toast.ts —
// `await confirmAction(...)` resolves true/false exactly like confirm() did.

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions (delete, disconnect, sign out). */
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  id: string;
  resolve: (ok: boolean) => void;
}

type Listener = (req: ConfirmRequest | null) => void;

let current: ConfirmRequest | null = null;
let listeners: Listener[] = [];

function emit(): void {
  listeners.forEach((l) => l(current));
}

export function subscribeConfirm(listener: Listener): () => void {
  listeners.push(listener);
  listener(current);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    current = { id: `confirm-${Date.now()}`, resolve, ...options };
    emit();
  });
}

export function resolveConfirm(ok: boolean): void {
  current?.resolve(ok);
  current = null;
  emit();
}
