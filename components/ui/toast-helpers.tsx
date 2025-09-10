"use client";

import React from "react";
import { toast } from "sonner";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  durationMs?: number | "infinite";
};

/**
 * Show a confirmation prompt using Sonner toast.
 * Resolves to true when confirmed, false when cancelled/closed.
 */
export function confirmToast(options: ConfirmOptions): Promise<boolean> {
  const { title, message, confirmText = "Confirm", cancelText = "Cancel", durationMs = "infinite" } = options;
  return new Promise<boolean>((resolve) => {
    const id = toast(title, {
      description: message,
      duration: durationMs === "infinite" ? Infinity : (typeof durationMs === "number" ? durationMs : Infinity),
      action: {
        label: confirmText,
        onClick: () => {
          try { toast.dismiss(id); } catch {}
          resolve(true);
        },
      },
      cancel: {
        label: cancelText,
        onClick: () => {
          try { toast.dismiss(id); } catch {}
          resolve(false);
        },
      },
      onDismiss: () => {
        // If closed by timeout or user, treat as cancel
        resolve(false);
      },
    });
  });
}

type PromptOptions = {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  cancelText?: string;
  validate?: (value: string) => string | null;
};

/**
 * Show an input prompt using Sonner custom toast.
 * Resolves to a string on confirm, or null on cancel/close.
 */
export function promptToast(options: PromptOptions): Promise<string | null> {
  const { title, message, placeholder, initialValue = "", confirmText = "Save", cancelText = "Cancel", validate } = options;
  return new Promise<string | null>((resolve) => {
    const Content: React.FC<{ toastId: string | number }> = ({ toastId }) => {
      const [value, setValue] = React.useState<string>(initialValue);
      const [error, setError] = React.useState<string | null>(null);
      const onConfirm = () => {
        const err = validate ? validate(value) : null;
        if (err) { setError(err); return; }
        try { toast.dismiss(toastId); } catch {}
        resolve(value);
      };
      const onCancel = () => { try { toast.dismiss(toastId); } catch {}; resolve(null); };
      return (
        <div className="w-[min(28rem,90vw)]">
          <div className="text-sm font-medium mb-1">{title}</div>
          {message ? <div className="text-xs text-muted-foreground mb-2">{message}</div> : null}
          <input
            autoFocus
            placeholder={placeholder}
            value={value}
            onChange={(e)=>setValue(e.target.value)}
            onKeyDown={(e)=>{ if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); }}
            className="w-full rounded-md px-3 py-2 text-sm bg-background border"
          />
          {error ? <div className="mt-1 text-[0.8rem] text-destructive">{error}</div> : null}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button onClick={onCancel} className="text-xs px-2 py-1 rounded border">{cancelText}</button>
            <button onClick={onConfirm} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground">{confirmText}</button>
          </div>
        </div>
      );
    };
    toast.custom((id) => <Content toastId={id} />, { duration: Infinity });
  });
}


