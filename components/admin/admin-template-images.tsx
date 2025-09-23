"use client";

import React from "react";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Check, Download } from "lucide-react";

type CreateModeProps = {
  mode: "create";
  adminPreviews: string[];
  selectedThumbAdminIndex: number | null;
  thumbPreview: string | null;
  onDropAdminFiles: (files: File[]) => void;
  onRemoveAdminIndex: (index: number) => void;
  onSetThumbFromAdminIndex: (index: number) => void;
  onDropThumbFile: (file: File | null) => void;
  onClearThumb: () => void;
  onDownloadThumb?: () => void;
};

type EditModeProps = {
  mode: "edit";
  adminExistingKeys: string[];
  adminExistingViews: Record<string, string | undefined>;
  onRemoveExistingKey: (key: string) => void;
  onDownloadExistingKey: (key: string) => void;
  adminNewPreviews: string[];
  onRemoveNewAdminIndex: (index: number) => void;
  onDropAdminFiles: (files: File[]) => void;
  selectedThumbExistingKey: string | null;
  selectedThumbAdminIndex: number | null;
  thumbPreview: string | null;
  thumbViewUrl: string | null;
  onSetThumbExisting: (key: string) => void;
  onSetThumbAdminIndex: (index: number) => void;
  onDropThumbFile: (file: File | null) => void;
  onClearThumb: () => void;
  onDownloadThumbExistingOrView: () => void;
};

export type AdminTemplateImagesProps = CreateModeProps | EditModeProps;

export function AdminTemplateImages(props: AdminTemplateImagesProps) {
  const isCreate = props.mode === "create";

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm mb-1">Admin images</div>
        <DropZone accept="image/*" onDrop={(files) => props.onDropAdminFiles(files)}>
          <div className="p-2 text-xs text-white/70">Drop images or click to select</div>
        </DropZone>
        {isCreate ? (
          props.adminPreviews.length ? (
            <ul className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {props.adminPreviews.map((u, i) => (
                <li key={`${u}-${i}`} className="relative">
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="admin" className="w-full h-36 sm:h-40 md:h-44 object-contain bg-black/20 rounded" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-1.5 right-1.5 h-8 px-2 text-base rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
                          onClick={() => props.onRemoveAdminIndex(i)}
                        >
                          ×
                        </Button>
                        <div className="absolute bottom-1 left-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => props.onSetThumbFromAdminIndex(i)}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" /> Set thumb
                          </Button>
                        </div>
                        {props.selectedThumbAdminIndex === i ? (
                          <div className="absolute top-1 left-1 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">Thumbnail</div>
                        ) : null}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); props.onRemoveAdminIndex(i); }}>Remove</ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </li>
              ))}
            </ul>
          ) : null
        ) : (
          <>
            {(props as EditModeProps).adminExistingKeys.length ? (
              <ul className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {(props as EditModeProps).adminExistingKeys.map((k) => (
                  <li key={k} className="relative">
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={(props as EditModeProps).adminExistingViews[k] || undefined} alt="admin" className="w-full h-36 sm:h-40 md:h-44 object-contain bg-black/20 rounded" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-1.5 left-1.5 h-8 w-8 p-0 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 grid place-items-center"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); (props as EditModeProps).onDownloadExistingKey(k); }}
                            aria-label="Download"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-1.5 right-1.5 h-8 px-2 text-base rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
                            onClick={() => (props as EditModeProps).onRemoveExistingKey(k)}
                          >
                            ×
                          </Button>
                          <div className="absolute bottom-1 left-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => (props as EditModeProps).onSetThumbExisting(k)}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" /> Set thumb
                            </Button>
                          </div>
                          {(props as EditModeProps).selectedThumbExistingKey === k ? (
                            <div className="absolute top-1 left-1 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">Thumbnail</div>
                          ) : null}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                        <ContextMenuItem onSelect={async (e) => { e.preventDefault(); (props as EditModeProps).onDownloadExistingKey(k); }}>Download</ContextMenuItem>
                        <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); (props as EditModeProps).onRemoveExistingKey(k); }}>Remove</ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </li>
                ))}
              </ul>
            ) : null}
            {(props as EditModeProps).adminNewPreviews.length ? (
              <ul className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {(props as EditModeProps).adminNewPreviews.map((u, i) => (
                  <li key={`${u}-${i}`} className="relative">
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="admin" className="w-full h-36 sm:h-40 md:h-44 object-contain bg-black/20 rounded" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-1.5 right-1.5 h-8 px-2 text-base rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
                            onClick={() => (props as EditModeProps).onRemoveNewAdminIndex(i)}
                          >
                            ×
                          </Button>
                          <div className="absolute bottom-1 left-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => (props as EditModeProps).onSetThumbAdminIndex(i)}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" /> Set thumb
                            </Button>
                          </div>
                          {(props as EditModeProps).selectedThumbAdminIndex === i ? (
                            <div className="absolute top-1 left-1 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">Thumbnail</div>
                          ) : null}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                        <ContextMenuItem onSelect={(e)=>{ e.preventDefault(); (props as EditModeProps).onRemoveNewAdminIndex(i); }}>Remove</ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        <div className="text-xs text-white/60">User image(s) will be appended last automatically.</div>
      </div>
      <div>
        <div className="text-sm mb-1">Thumbnail</div>
        <DropZone accept="image/*" onDrop={(files) => {
          const file = Array.isArray(files) ? files[0] : (files as unknown as File[])[0];
          const cb = isCreate ? props.onDropThumbFile : (props as EditModeProps).onDropThumbFile;
          cb(file || null);
        }}>
          <div className="relative h-40">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="relative h-40 grid place-items-center text-xs text-white/70">
                  {props.thumbPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={props.thumbPreview} alt="thumbnail" className="max-h-32 object-contain" />
                  ) : (!isCreate && (props as EditModeProps).selectedThumbExistingKey) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(props as EditModeProps).adminExistingViews[(props as EditModeProps).selectedThumbExistingKey!] || undefined} alt="thumbnail" className="max-h-32 object-contain" />
                  ) : (!isCreate && (props as EditModeProps).selectedThumbAdminIndex !== null && (props as EditModeProps).adminNewPreviews[(props as EditModeProps).selectedThumbAdminIndex!]) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(props as EditModeProps).adminNewPreviews[(props as EditModeProps).selectedThumbAdminIndex!]!} alt="thumbnail" className="max-h-32 object-contain" />
                  ) : (isCreate && props.selectedThumbAdminIndex !== null && props.adminPreviews[props.selectedThumbAdminIndex!]) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={props.adminPreviews[props.selectedThumbAdminIndex!]!} alt="thumbnail" className="max-h-32 object-contain" />
                  ) : (!isCreate && (props as EditModeProps).thumbViewUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(props as EditModeProps).thumbViewUrl!} alt="thumbnail" className="max-h-32 object-contain" />
                  ) : (
                    <span>Drop an image or click to select</span>
                  )}
                  {(props.thumbPreview || (!isCreate && ((props as EditModeProps).selectedThumbExistingKey || (props as EditModeProps).thumbViewUrl)) || (isCreate && props.selectedThumbAdminIndex !== null)) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1.5 left-1.5 h-8 w-8 p-0 rounded-full bg-black/60 text-white"
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (isCreate) {
                          if (props.onDownloadThumb) props.onDownloadThumb();
                        } else {
                          (props as EditModeProps).onDownloadThumbExistingOrView();
                        }
                      }}
                      aria-label="Download thumbnail"
                      title="Download thumbnail"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  ) : null}
                  {(props.thumbPreview || (!isCreate && ((props as EditModeProps).selectedThumbExistingKey !== null || (props as EditModeProps).selectedThumbAdminIndex !== null || (props as EditModeProps).thumbViewUrl)) || (isCreate && props.selectedThumbAdminIndex !== null)) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1.5 right-1.5 h-8 px-3 text-base rounded-full bg-black/60 text-white"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); (isCreate ? props.onClearThumb : (props as EditModeProps).onClearThumb)(); }}
                    >
                      ×
                    </Button>
                  ) : null}
                </div>
              </ContextMenuTrigger>
              {!isCreate && (((props as EditModeProps).selectedThumbExistingKey) || (props as EditModeProps).thumbViewUrl) ? (
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onSelect={(e) => { e.preventDefault(); (props as EditModeProps).onDownloadThumbExistingOrView(); }}>Download thumbnail</ContextMenuItem>
                  <ContextMenuItem onSelect={(e) => { e.preventDefault(); (props as EditModeProps).onClearThumb(); }}>Remove</ContextMenuItem>
                </ContextMenuContent>
              ) : isCreate && (props.thumbPreview || props.selectedThumbAdminIndex !== null) ? (
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onSelect={(e) => { e.preventDefault(); props.onClearThumb(); }}>Remove</ContextMenuItem>
                </ContextMenuContent>
              ) : null}
            </ContextMenu>
          </div>
        </DropZone>
      </div>
    </div>
  );
}
