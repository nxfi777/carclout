"use client";

import React from "react";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Check, Download, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  onReorderAdminImages: (oldIndex: number, newIndex: number) => void;
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
  onReorderExistingKeys: (oldIndex: number, newIndex: number) => void;
  onReorderNewAdminImages: (oldIndex: number, newIndex: number) => void;
};

export type AdminTemplateImagesProps = CreateModeProps | EditModeProps;

// Sortable item component for admin images
type SortableImageItemProps = {
  id: string;
  index: number;
  imageUrl: string;
  isSelected: boolean;
  onRemove: () => void;
  onSetThumb: () => void;
  onDownload?: () => void;
  showDownload?: boolean;
};

function SortableImageItem({
  id,
  imageUrl,
  isSelected,
  onRemove,
  onSetThumb,
  onDownload,
  showDownload,
}: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="relative flex-shrink-0 w-48 sm:w-56 md:w-64">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="relative group">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="admin" className="w-full h-36 sm:h-40 md:h-44 object-contain bg-black/20 rounded" />
            ) : (
              <div className="w-full h-36 sm:h-40 md:h-44 bg-black/20 rounded grid place-items-center text-white/50 text-xs">Loading...</div>
            )}
            
            {/* Drag Handle */}
            <div
              {...attributes}
              {...listeners}
              className="absolute top-1.5 left-1.5 h-8 w-8 p-0 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 grid place-items-center cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              <GripVertical className="w-4 h-4" />
            </div>

            {showDownload && onDownload && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1.5 left-11 h-8 w-8 p-0 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 grid place-items-center"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownload(); }}
                aria-label="Download"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1.5 right-1.5 h-8 px-2 text-base rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
              onClick={onRemove}
            >
              ×
            </Button>
            
            <div className="absolute bottom-1 left-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="secondary"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onSetThumb}
              >
                <Check className="w-3.5 h-3.5 mr-1" /> Thumb
              </Button>
            </div>
            
            {isSelected && (
              <div className="absolute top-1 right-11 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">Thumbnail</div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {showDownload && onDownload && (
            <ContextMenuItem onSelect={(e) => { e.preventDefault(); onDownload(); }}>Download</ContextMenuItem>
          )}
          <ContextMenuItem onSelect={(e) => { e.preventDefault(); onRemove(); }}>Remove</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

export function AdminTemplateImages(props: AdminTemplateImagesProps) {
  const isCreate = props.mode === "create";
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEndCreate = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = parseInt(String(active.id).replace("admin-", ""), 10);
      const newIndex = parseInt(String(over.id).replace("admin-", ""), 10);
      if (isCreate) {
        props.onReorderAdminImages(oldIndex, newIndex);
      }
    }
  };

  const handleDragEndEditExisting = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && !isCreate) {
      const editProps = props as EditModeProps;
      const oldIndex = editProps.adminExistingKeys.indexOf(String(active.id));
      const newIndex = editProps.adminExistingKeys.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1) {
        editProps.onReorderExistingKeys(oldIndex, newIndex);
      }
    }
  };

  const handleDragEndEditNew = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && !isCreate) {
      const editProps = props as EditModeProps;
      const oldIndex = parseInt(String(active.id).replace("new-", ""), 10);
      const newIndex = parseInt(String(over.id).replace("new-", ""), 10);
      editProps.onReorderNewAdminImages(oldIndex, newIndex);
    }
  };

  return (
    <div className="space-y-3">
      <div className="max-w-full">
        <div className="text-sm mb-1">Admin images</div>
        <DropZone accept="image/*" onDrop={(files) => props.onDropAdminFiles(files)}>
          <div className="p-2 text-xs text-white/70">Drop images or click to select</div>
        </DropZone>
        {isCreate ? (
          props.adminPreviews.length ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEndCreate}
            >
              <SortableContext
                items={props.adminPreviews.map((_, i) => `admin-${i}`)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="mt-2 overflow-x-auto max-w-[42rem]">
                  <ul className="flex flex-row flex-nowrap gap-4 pb-2">
                    {props.adminPreviews.map((u, i) => (
                      <SortableImageItem
                        key={`admin-${i}`}
                        id={`admin-${i}`}
                        index={i}
                        imageUrl={u}
                        isSelected={props.selectedThumbAdminIndex === i}
                        onRemove={() => props.onRemoveAdminIndex(i)}
                        onSetThumb={() => props.onSetThumbFromAdminIndex(i)}
                      />
                    ))}
                  </ul>
                </div>
              </SortableContext>
            </DndContext>
          ) : null
        ) : (
          <>
            {(props as EditModeProps).adminExistingKeys.length ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndEditExisting}
              >
                <SortableContext
                  items={(props as EditModeProps).adminExistingKeys}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="mt-2 overflow-x-auto max-w-[42rem]">
                    <ul className="flex flex-row flex-nowrap gap-4 pb-2">
                      {(props as EditModeProps).adminExistingKeys.map((k, i) => (
                        <SortableImageItem
                          key={k}
                          id={k}
                          index={i}
                          imageUrl={(props as EditModeProps).adminExistingViews[k] || ""}
                          isSelected={(props as EditModeProps).selectedThumbExistingKey === k}
                          onRemove={() => (props as EditModeProps).onRemoveExistingKey(k)}
                          onSetThumb={() => (props as EditModeProps).onSetThumbExisting(k)}
                          onDownload={() => (props as EditModeProps).onDownloadExistingKey(k)}
                          showDownload
                        />
                      ))}
                    </ul>
                  </div>
                </SortableContext>
              </DndContext>
            ) : null}
            {(props as EditModeProps).adminNewPreviews.length ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndEditNew}
              >
                <SortableContext
                  items={(props as EditModeProps).adminNewPreviews.map((_, i) => `new-${i}`)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="mt-2 overflow-x-auto max-w-[42rem]">
                    <ul className="flex flex-row flex-nowrap gap-4 pb-2">
                      {(props as EditModeProps).adminNewPreviews.map((u, i) => (
                        <SortableImageItem
                          key={`new-${i}`}
                          id={`new-${i}`}
                          index={i}
                          imageUrl={u}
                          isSelected={(props as EditModeProps).selectedThumbAdminIndex === i}
                          onRemove={() => (props as EditModeProps).onRemoveNewAdminIndex(i)}
                          onSetThumb={() => (props as EditModeProps).onSetThumbAdminIndex(i)}
                        />
                      ))}
                    </ul>
                  </div>
                </SortableContext>
              </DndContext>
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
