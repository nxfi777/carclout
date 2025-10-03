"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";

type DrawerId = "welcome-to-pro" | "level-up" | "daily-bonus";

interface DrawerRequest {
  id: DrawerId;
  priority: number;
  timestamp: number;
  show: () => void;
  hide: () => void;
}

interface DrawerQueueContextValue {
  requestShow: (id: DrawerId, priority: number, show: () => void, hide: () => void) => void;
  cancelRequest: (id: DrawerId) => void;
  notifyDismissed: (id: DrawerId) => void;
}

const DrawerQueueContext = createContext<DrawerQueueContextValue | null>(null);

/**
 * Priority levels:
 * - 100: Critical (welcome messages, first-time experiences)
 * - 50: High (level-up celebrations, achievements)
 * - 10: Medium (daily bonuses, routine prompts)
 */
export const DRAWER_PRIORITY = {
  CRITICAL: 100,
  HIGH: 50,
  MEDIUM: 10,
} as const;

export function DrawerQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DrawerRequest[]>([]);
  const [activeDrawer, setActiveDrawer] = useState<DrawerId | null>(null);
  const processingRef = useRef(false);

  // Process the queue
  const processQueue = useCallback(() => {
    if (processingRef.current || activeDrawer !== null) return;

    setQueue((current) => {
      if (current.length === 0) return current;

      // Sort by priority (highest first), then by timestamp (oldest first)
      const sorted = [...current].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.timestamp - b.timestamp;
      });

      const next = sorted[0];
      if (!next) return current;

      // Remove from queue and show
      processingRef.current = true;
      setActiveDrawer(next.id);

      // Small delay to ensure state updates
      setTimeout(() => {
        next.show();
        processingRef.current = false;
      }, 100);

      // Return queue without the active item
      return current.filter((item) => item.id !== next.id);
    });
  }, [activeDrawer]);

  // Process queue when it changes or when active drawer is cleared
  useEffect(() => {
    if (activeDrawer === null && queue.length > 0) {
      processQueue();
    }
  }, [queue, activeDrawer, processQueue]);

  const requestShow = useCallback((id: DrawerId, priority: number, show: () => void, hide: () => void) => {
    setQueue((current) => {
      // Don't add if already in queue or currently active
      if (current.some((item) => item.id === id)) return current;
      if (activeDrawer === id) return current;

      return [
        ...current,
        {
          id,
          priority,
          timestamp: Date.now(),
          show,
          hide,
        },
      ];
    });
  }, [activeDrawer]);

  const cancelRequest = useCallback((id: DrawerId) => {
    setQueue((current) => current.filter((item) => item.id !== id));
  }, []);

  const notifyDismissed = useCallback((id: DrawerId) => {
    setActiveDrawer((current) => {
      if (current === id) {
        // Small delay before processing next drawer for better UX
        setTimeout(() => {
          processingRef.current = false;
        }, 300);
        return null;
      }
      return current;
    });
  }, []);

  return (
    <DrawerQueueContext.Provider value={{ requestShow, cancelRequest, notifyDismissed }}>
      {children}
    </DrawerQueueContext.Provider>
  );
}

export function useDrawerQueue() {
  const context = useContext(DrawerQueueContext);
  if (!context) {
    throw new Error("useDrawerQueue must be used within DrawerQueueProvider");
  }
  return context;
}

