"use client";
import React from "react";
import { FolderLock } from "lucide-react";
import { toast } from "sonner";
import { confirmToast } from "@/components/ui/toast-helpers";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface FileTreeItem {
  name: string;
  type: "folder" | "file";
  icon?: React.ComponentType;
}

interface FolderIconProps { isOpen: boolean }
interface ChevronIconProps { isOpen: boolean }
interface TreeIconProps { item: FileTreeItem; isOpen: boolean; isManaged?: boolean }

const FileIcon = () => (
  <svg className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);
const JsIcon = () => (
  <svg className="w-5 h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 48 48">
    <path fill="#ffd600" d="M6,42V6h36v36H6z"></path>
    <path fill="none" stroke="#000001" strokeMiterlimit="10" strokeWidth="3.3" d="M23.783,22.352v9.819 c0,3.764-4.38,4.022-6.283,0.802"></path>
    <path fill="none" stroke="#000001" strokeMiterlimit="10" strokeWidth="3.3" d="M34.69,25.343 c-1.739-2.727-5.674-2.345-5.84,0.558c-0.214,3.757,6.768,2.938,6.247,7.107c-0.365,2.92-4.874,3.858-7.193-0.065"></path>
  </svg>
);
const HtmlIcon = () => (
  <svg className="w-5 h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 48 48">
    <path fill="#E65100" d="M41,5H7l3,34l14,4l14-4L41,5L41,5z"></path>
    <path fill="#FF6D00" d="M24 8L24 39.9 35.2 36.7 37.7 8z"></path>
    <path fill="#FFF" d="M24,25v-4h8.6l-0.7,11.5L24,35.1v-4.2l4.1-1.4l0.3-4.5H24z M32.9,17l0.3-4H24v4H32.9z"></path>
    <path fill="#EEE" d="M24,30.9v4.2l-7.9-2.6L15.7,27h4l0.2,2.5L24,30.9z M19.1,17H24v-4h-9.1l0.7,12H24v-4h-4.6L19.1,17z"></path>
  </svg>
);
const CssIcon = () => (
  <svg className="w-5 h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 48 48">
    <path fill="#0277BD" d="M41,5H7l3,34l14,4l14-4L41,5L41,5z"></path>
    <path fill="#039BE5" d="M24 8L24 39.9 35.2 36.7 37.7 8z"></path>
    <path fill="#FFF" d="M33.1 13L24 13 24 17 28.9 17 28.6 21 24 21 24 25 28.4 25 28.1 29.5 24 30.9 24 35.1 31.9 32.5 32.6 21 32.6 21z"></path>
    <path fill="#EEE" d="M24,13v4h-8.9l-0.3-4H24z M19.4,21l0.2,4H24v-4H19.4z M19.8,27h-4l0.3,5.5l7.9,2.6v-4.2l-4.1-1.4L19.8,27z"></path>
  </svg>
);
const ReactIcon = () => (
  <svg className="w-5 h-5 mr-2 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <g>
      <ellipse cx="12" cy="12" rx="11" ry="4.2" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(60 12 12)" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(120 12 12)" stroke="currentColor" strokeWidth="1.5" />
    </g>
  </svg>
);

const FolderIcon: React.FC<FolderIconProps> = ({ isOpen }) => (
  <svg className="w-5 h-5 mr-2 text-indigo-300 dark:text-indigo-300 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    {isOpen ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    )}
  </svg>
);

const ChevronIcon: React.FC<ChevronIconProps> = ({ isOpen }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? "rotate-90" : ""}`}>
    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
  </svg>
);

const TreeIcon: React.FC<TreeIconProps> = ({ item, isOpen, isManaged }) => {
  if (item.icon) {
    const IconComponent = item.icon;
    return <IconComponent />;
  }
  if (item.type === "folder") {
    if (isManaged) {
      return <FolderLock className="w-5 h-5 mr-2 text-indigo-300 dark:text-indigo-300 shrink-0" strokeWidth={1.75} />;
    }
    return <FolderIcon isOpen={isOpen} />;
  }
  if (item.name.endsWith(".js") || item.name.endsWith(".jsx")) return <JsIcon />;
  if (item.name.endsWith(".html")) return <HtmlIcon />;
  if (item.name.endsWith(".css")) return <CssIcon />;
  if (item.name.endsWith(".tsx") || item.name.endsWith(".ts") || item.name.endsWith(".jsx")) return <ReactIcon />;
  return <FileIcon />;
};

type MoveHandler = (sourceKey: string, targetFolderPath: string) => Promise<void> | void;

export function R2FileTree({
  onNavigate,
  onFileSelect,
  onOpenFile,
  onMove,
  refreshKey,
  scope,
  selectedKeys,
}: {
  onNavigate?: (path: string) => void;
  onFileSelect?: (key: string) => void;
  onOpenFile?: (key: string) => void;
  onMove?: MoveHandler;
  refreshKey?: number;
  scope?: 'user' | 'admin';
  selectedKeys?: Set<string> | string[];
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = React.useState<boolean>(false);
  const [childrenByPath, setChildrenByPath] = React.useState<Record<string, FileTreeItem[]>>({});
  const [etagByPath, setEtagByPath] = React.useState<Record<string, string | undefined>>({});
  const SESSION_PREFIX = "ignite:tree:list:";
  const scopeKey = React.useCallback((p: string) => `${scope === 'admin' ? 'admin' : 'user'}:${p}`, [scope]);
  const readSession = React.useCallback((p: string): { items: FileTreeItem[]; etag?: string } | null => {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_PREFIX + scopeKey(p)) : null;
      if (!raw) return null;
      const obj = JSON.parse(raw) as { items?: FileTreeItem[]; etag?: string };
      if (!obj || !Array.isArray(obj.items)) return null;
      return { items: obj.items, etag: obj.etag };
    } catch { return null; }
  }, [scopeKey]);
  const writeSession = React.useCallback((p: string, items: FileTreeItem[], etag?: string) => {
    try { if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_PREFIX + scopeKey(p), JSON.stringify({ items, etag })); } catch {}
  }, [scopeKey]);
  const selectedSet = React.useMemo(() => {
    if (!selectedKeys) return new Set<string>();
    // Normalize to Set<string>
    return selectedKeys instanceof Set ? new Set(Array.from(selectedKeys)) : new Set(selectedKeys);
  }, [selectedKeys]);

  const fetchChildren = React.useCallback(async (p: string) => {
    try {
      const scopeParam = scope === 'admin' ? `&scope=admin` : '';
      const existing = readSession(p);
      if (existing) {
        setChildrenByPath(prev => ({ ...prev, [p]: existing.items }));
        setEtagByPath(prev => ({ ...prev, [p]: existing.etag }));
      }
      const headers: Record<string, string> = {};
      const et = etagByPath[p] || existing?.etag;
      if (et && typeof et === 'string') {
        const clean = et.replace(/^W\//, '').replace(/\"/g, '');
        headers["If-None-Match"] = `W/"${clean}"`;
      }
      const res = await fetch(`/api/storage/list?path=${encodeURIComponent(p)}${scopeParam}`, { cache: "no-store", headers });
      let data: unknown = null;
      if (res.status === 304) {
        const etag = res.headers.get('etag') || et;
        if (existing) writeSession(p, existing.items, etag || undefined);
        setEtagByPath(prev => ({ ...prev, [p]: etag || undefined }));
        // Keep current items
      } else {
        try {
          data = await res.json();
        } catch {
          data = { items: [] } as unknown;
        }
        const items: FileTreeItem[] = Array.isArray((data as Record<string, unknown>)?.items)
          ? ((data as Record<string, unknown>).items as Array<unknown>).map((it) => {
              const obj = it as { name?: unknown; type?: unknown };
              const name = typeof obj.name === 'string' ? obj.name : '';
              const type = obj.type === 'folder' || obj.type === 'file' ? obj.type : 'file';
              return { name, type };
            })
          : [];
        const etagHeader = res.headers.get('etag');
        const etagBody = (data as Record<string, unknown> | null | undefined)?.etag;
        const etag = typeof etagHeader === 'string' ? etagHeader : (typeof etagBody === 'string' ? etagBody : undefined);
        setChildrenByPath(prev => ({ ...prev, [p]: items }));
        setEtagByPath(prev => ({ ...prev, [p]: etag || undefined }));
        writeSession(p, items, etag || undefined);
      }
    } catch {
      setChildrenByPath(prev => ({ ...prev, [p]: [] }));
    }
  }, [etagByPath, scope, readSession, writeSession]);

  React.useEffect(() => { fetchChildren(""); }, [fetchChildren]);

  React.useEffect(() => {
    if (refreshKey === undefined) return;
    // Refresh root and any expanded nodes
    fetchChildren("");
    Array.from(expanded).forEach((p) => fetchChildren(p));
  }, [refreshKey, fetchChildren, expanded]);

  function toggle(path: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
    if (!childrenByPath[path]) fetchChildren(path);
  }

  async function refreshTree() {
    await fetchChildren("");
    for (const p of Array.from(expanded)) {
      // Refresh expanded nodes to reflect rename/delete
      await fetchChildren(p);
    }
  }

  function isFolderPath(itemPath: string): boolean {
    const parts = itemPath.split('/');
    const name = parts.pop() || '';
    const parent = parts.join('/');
    const arr = childrenByPath[parent] || [];
    const entry = arr.find((it) => it.name === name);
    return entry?.type === 'folder';
  }

  async function handleBulkDelete(keys: string[]) {
    if (!keys.length) return;
    const prettyCount = keys.length;
    const ok = await confirmToast({ title: `Delete ${prettyCount} selected item${prettyCount>1?'s':''}?` });
    if (!ok) return;
    const prev = childrenByPath;
    // Optimistically remove items from tree view
    const next: Record<string, FileTreeItem[]> = { ...childrenByPath };
    for (const raw of keys) {
      const isFolder = raw.endsWith('/') || isFolderPath(raw);
      const normalized = isFolder && raw.endsWith('/') ? raw.slice(0, -1) : raw;
      const parts = normalized.split('/');
      const name = parts.pop() || '';
      const parent = parts.join('/');
      const arr = next[parent] || [];
      next[parent] = arr.filter((it) => it.name !== name);
    }
    setChildrenByPath(next);
    try {
      for (const raw of keys) {
        const isFolder = raw.endsWith('/') || isFolderPath(raw);
        const key = isFolder && !raw.endsWith('/') ? `${raw}/` : raw;
        const res = await fetch('/api/storage/delete', { method:'POST', body: JSON.stringify({ key, isFolder, scope }) });
        if (!res.ok) throw new Error('Delete failed');
      }
      toast.success(`Deleted ${prettyCount} item${prettyCount>1?'s':''}`);
      await refreshTree();
    } catch {
      setChildrenByPath(prev);
      toast.error('Failed to delete selected items');
    }
  }

  

  // handleDelete removed (unused)

  function handleDropOnFolder(folderPath: string, e: React.DragEvent) {
    const src = e.dataTransfer.getData('text/plain');
    if (!src) return;
    const name = src.split('/').pop() || '';
    if (onMove) onMove(src, folderPath ? `${folderPath}/${name}` : name);
  }

  function renderNode(item: FileTreeItem, parentPath: string) {
    const isFolder = item.type === 'folder';
    const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;
    const open = expanded.has(itemPath);
    const childrenRaw = childrenByPath[itemPath];
    const hasLoadedChildren = Array.isArray(childrenRaw);
    const children = childrenRaw || [];
    const isSelected = selectedSet.has(itemPath) || selectedSet.has(`${itemPath}/`);
    const topSeg = (itemPath || '').split('/')[0];
    const isManagedHere = topSeg === 'vehicles' || topSeg === 'designer_masks';
    const hasManagedSelected = selectedSet.size ? Array.from(selectedSet).some((k) => {
      const seg = String(k || '').replace(/\/+$/,'').split('/')[0];
      return seg === 'vehicles' || seg === 'designer_masks';
    }) : false;
    return (
      <div key={itemPath} className="text-gray-700 dark:text-gray-300 relative">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                "flex items-center py-1.5 px-2 rounded-md cursor-pointer transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-800",
                isSelected && "bg-white/10"
              )}
              onClick={() => {
                if (isFolder) {
                  toggle(itemPath);
                } else {
                  // Single click on a file: navigate to containing folder and optionally select
                  const parts = itemPath.split('/');
                  parts.pop();
                  const parent = parts.join('/');
                  onNavigate?.(parent);
                  onFileSelect?.(itemPath);
                }
              }}
              onDoubleClick={() => {
                if (!isFolder) {
                  // Double click on a file: open the file (image preview handled upstream)
                  onOpenFile?.(itemPath);
                }
              }}
              draggable={!isFolder}
              onDragStart={(e)=>{ if (!isFolder) e.dataTransfer.setData('text/plain', itemPath); }}
              onDragOver={(e)=>{ if (isFolder) e.preventDefault(); }}
              onDrop={(e)=>{ if (isFolder) { e.preventDefault(); handleDropOnFolder(itemPath, e); } }}
            >
              <div className="flex items-center flex-grow">
                {isFolder ? (<ChevronIcon isOpen={open} />) : (<div className="w-4 shrink-0"></div>)}
                <div className="flex items-center ml-1">
                  <TreeIcon item={item} isOpen={open} isManaged={isManagedHere} />
                  <span className={cn("text-sm ml-1.5 truncate", isSelected && "text-primary font-medium")}>{item.name}</span>
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuLabel>{item.name}</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={()=>{ if (isFolder) toggle(itemPath); else onFileSelect?.(itemPath); }}>Open</ContextMenuItem>
            <ContextMenuItem onSelect={()=>{ onFileSelect?.(itemPath); }}>Select</ContextMenuItem>
            <ContextMenuSeparator />
            {(isManagedHere || hasManagedSelected) ? (
              <ContextMenuItem disabled className="!cursor-default !pointer-events-none opacity-60">Managed folder</ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={()=>{
                const keys = selectedSet.size ? Array.from(selectedSet) : [itemPath];
                handleBulkDelete(keys);
              }} variant="destructive">Delete</ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
        {isFolder ? (
          <div className={`pl-4 relative overflow-hidden transition-all duration-300 ease-in-out ${open ? "max-h-[1000px]" : "max-h-0"}`}>
            <div className="absolute left-[13px] top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-800"></div>
            {open ? (
              !hasLoadedChildren ? (
                <div className="py-1 space-y-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`sk-${itemPath}-${i}`} className="flex items-center py-1.5 px-2 rounded-md">
                      <div className="w-4 shrink-0"></div>
                      <div className="flex items-center ml-1">
                        <Skeleton className="w-4 h-4 mr-2 rounded" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (children.length === 0 ? (
                <div className="py-1 pl-6 text-xs text-gray-500 dark:text-gray-400 italic">No items</div>
              ) : (
                children.map((child) => renderNode(child, itemPath))
              ))
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const rootChildren = childrenByPath[""];
  const rootLoaded = Array.isArray(rootChildren);

  return (
    <div className="font-mono">
      <div className="w-full">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">Files</div>
          <button
            className="text-xs px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => setCollapsed(v=>!v)}
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
        {collapsed ? null : (
          rootChildren === undefined ? (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`root-sk-${i}`} className="flex items-center py-1.5 px-2 rounded-md">
                  <Skeleton className="w-4 h-4 mr-2 rounded" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : (rootLoaded && rootChildren.length === 0) ? (
            <div className="py-2 px-2 text-xs text-gray-500 dark:text-gray-400 italic">No items</div>
          ) : (
            (rootChildren || []).map((item) => renderNode(item, ""))
          )
        )}
      </div>
    </div>
  );
}


