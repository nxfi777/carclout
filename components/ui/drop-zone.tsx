"use client";
import React from "react";

type DropZoneProps = {
  onDrop: (files: File[]) => void;
  accept?: string;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  cover?: boolean;
};

export function DropZone({ onDrop, children, className, accept, disabled, cover }: DropZoneProps) {
  const [isOver, setIsOver] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dragCountRef = React.useRef(0);

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
    const files = Array.from(filesLike || []);
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
      const files: File[] = [];
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
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
    ? `absolute inset-0 z-50 ${isOver ? 'bg-[color:var(--primary)]/10' : ''}`
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


