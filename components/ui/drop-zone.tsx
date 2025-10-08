"use client";
import React from "react";

type DropZoneProps = {
  onDrop: (files: File[]) => void;
  accept?: string;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  cover?: boolean;
  maxFiles?: number;
};

export function DropZone({ onDrop, children, className, accept, disabled, cover, maxFiles }: DropZoneProps) {
  const [isOver, setIsOver] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dragCountRef = React.useRef(0);
  const focusedRef = React.useRef(false);
  const lastMousePosRef = React.useRef<{ x: number; y: number } | null>(null);

  function isPointerOverSelf(): boolean {
    const el = ref.current;
    const pos = lastMousePosRef.current;
    if (!el || !pos) return false;
    const r = el.getBoundingClientRect();
    return pos.x >= r.left && pos.x <= r.right && pos.y >= r.top && pos.y <= r.bottom;
  }

  function isAccepted(file: File, acceptStr?: string): boolean {
    if (!acceptStr || !acceptStr.trim()) return true;
    const tokens = acceptStr.split(",").map((t) => t.trim()).filter(Boolean);
    if (!tokens.length) return true;
    const fileType = (file.type || "").toLowerCase();
    const fileName = (file.name || "").toLowerCase();
    for (const tokenRaw of tokens) {
      const token = tokenRaw.toLowerCase();
      if (!token) continue;
      if (token.startsWith(".")) {
        if (fileName.endsWith(token)) return true;
      } else if (token.endsWith("/*") && token.includes("/")) {
        const prefix = token.slice(0, token.indexOf("/") + 1);
        if (fileType.startsWith(prefix)) return true;
      } else {
        if (fileType === token) return true;
      }
    }
    return false;
  }

  React.useEffect(() => {
    function prevent(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }
    function winEnter(e: DragEvent) {
      if (disabled) return;
      const types = e.dataTransfer?.types || [];
      const arr = Array.from(types as ArrayLike<string>);
      if (arr && (arr.includes("Files") || (types as unknown as { contains?: (t: string)=> boolean }).contains?.("Files"))) {
        dragCountRef.current += 1;
        setIsOver(true);
      }
    }
    function winLeave(_e: DragEvent) {
      dragCountRef.current = Math.max(0, dragCountRef.current - 1);
      if (dragCountRef.current === 0) setIsOver(false);
    }
    function winDrop(e: DragEvent) {
      prevent(e);
      dragCountRef.current = 0;
      setIsOver(false);
    }
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    window.addEventListener("dragenter", winEnter);
    window.addEventListener("dragleave", winLeave);
    window.addEventListener("drop", winDrop);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
      window.removeEventListener("dragenter", winEnter);
      window.removeEventListener("dragleave", winLeave);
      window.removeEventListener("drop", winDrop);
    };
  }, [disabled]);

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  React.useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (disabled) return;
      const shouldHandle = focusedRef.current || isPointerOverSelf();
      if (!shouldHandle) return;
      const dt = e.clipboardData;
      if (!dt) return;
      let files: File[] = [];
      try {
        if (dt.files && dt.files.length) {
          files = Array.from(dt.files as unknown as FileList);
        } else if (dt.items && dt.items.length) {
          for (let i = 0; i < dt.items.length; i++) {
            const it = dt.items[i];
            if (it.kind === 'file') {
              const f = it.getAsFile();
              if (f) files.push(f);
            }
          }
        }
      } catch {}
      if (!files.length) return;
      const accepted = files.filter((f) => isAccepted(f, accept));
      if (!accepted.length) return;
      e.preventDefault();
      e.stopPropagation();
      // Stop any other paste handlers when interacting with the drop zone
      try { (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.(); } catch {}
      // Respect maxFiles in our handler too before delegating
      let toHandle = accepted;
      if (typeof maxFiles === 'number' && Number.isFinite(maxFiles) && maxFiles > 0 && toHandle.length > maxFiles) {
        toHandle = toHandle.slice(0, Math.max(1, Math.floor(maxFiles)));
      }
      if (toHandle.length) onDrop(toHandle);
    }
    window.addEventListener('paste', onPaste, { capture: true });
    return () => {
      window.removeEventListener('paste', onPaste, true);
    };
  }, [accept, disabled, maxFiles, onDrop]);

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current += 1;
    setIsOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = Math.max(0, dragCountRef.current - 1);
    if (dragCountRef.current === 0) setIsOver(false);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; } catch {}
  }
  function handleFiles(filesLike: FileList | File[]) {
    let files = Array.from(filesLike || []);
    if (typeof maxFiles === 'number' && Number.isFinite(maxFiles) && maxFiles > 0 && files.length > maxFiles) {
      files = files.slice(0, Math.max(1, Math.floor(maxFiles)));
    }
    if (files.length) onDrop(files);
  }
  function onDropHandler(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = 0;
    setIsOver(false);
    if (disabled) return;
    const dt = e.dataTransfer;
    if (!dt) return;
    if (dt.items && dt.items.length) {
      let files: File[] = [];
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (typeof maxFiles === 'number' && Number.isFinite(maxFiles) && maxFiles > 0 && files.length > maxFiles) {
        files = files.slice(0, Math.max(1, Math.floor(maxFiles)));
      }
      if (files.length) onDrop(files);
    } else if (dt.files && dt.files.length) {
      handleFiles(dt.files);
    }
  }

  function onClick() {
    if (disabled) return;
    inputRef.current?.click();
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  const baseClasses = cover
    ? `absolute inset-0 z-5 ${isOver ? 'bg-[color:var(--primary)]/10' : ''}`
    : `relative rounded-md border border-[color:var(--border)] border-dashed p-4 text-sm ${disabled ? "opacity-60 pointer-events-none" : "cursor-pointer"} ${isOver ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10" : "hover:border-[color:var(--border)]"}`;
  const classes = `${baseClasses} ${className || ""}`;
  const overlayStyle: React.CSSProperties | undefined = cover ? { pointerEvents: isOver ? "auto" : "none" } : undefined;

  return (
    <div
      ref={ref}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDropHandler}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; }}
      role="button"
      tabIndex={0}
      aria-disabled={disabled ? true : undefined}
      className={classes}
      style={overlayStyle}
    >
      <input ref={inputRef} type="file" multiple accept={accept} className="hidden" onChange={(e)=>{ if (e.target.files) handleFiles(e.target.files); e.currentTarget.value = ""; }} />
      {children || null}
    </div>
  );
}


