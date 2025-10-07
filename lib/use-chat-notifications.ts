"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";

type ChatNotification = {
  id: string;
  senderName: string;
  senderEmail: string;
  messageText: string;
  channel?: string;
  dmKey?: string;
  type: "mention" | "everyone";
  created_at: string;
};

/**
 * Global hook for chat notifications
 * Shows in-app toast when window focused, browser notification when unfocused
 * Works from any page, not just showroom
 */
export function useChatNotifications(pollIntervalMs: number = 15000) {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const isWindowFocusedRef = useRef(true);
  const lastCheckRef = useRef<number>(Date.now());
  const processedNotificationIds = useRef<Set<string>>(new Set());

  // Track window focus
  useEffect(() => {
    const handleFocus = () => { isWindowFocusedRef.current = true; };
    const handleBlur = () => { isWindowFocusedRef.current = false; };
    
    if (typeof window !== 'undefined') {
      isWindowFocusedRef.current = !document.hidden;
    }
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', () => {
      isWindowFocusedRef.current = !document.hidden;
    });
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Request notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
        }).catch(() => {});
      }
    }
  }, []);

  const showNotification = useCallback((notif: ChatNotification) => {
    // Skip if already processed
    if (processedNotificationIds.current.has(notif.id)) {
      return;
    }
    processedNotificationIds.current.add(notif.id);

    const displayText = notif.messageText.length > 100 
      ? notif.messageText.substring(0, 100) + '...' 
      : notif.messageText;
    
    const chatName = notif.channel 
      ? `#${notif.channel}` 
      : (notif.dmKey ? "Direct Message" : "Chat");
    
    const title = `${notif.senderName} in ${chatName}`;
    const description = notif.type === "everyone" 
      ? `@everyone: ${displayText}` 
      : displayText;

    // If window is focused, show in-app toast
    if (isWindowFocusedRef.current) {
      toast(title, {
        description,
        duration: 5000,
        action: {
          label: 'View',
          onClick: () => {
            if (notif.channel) {
              window.location.href = `/dashboard/showroom?channel=${notif.channel}`;
            } else if (notif.dmKey) {
              const emails = notif.dmKey.split('|');
              const otherEmail = emails.find(e => e.toLowerCase() !== notif.senderEmail?.toLowerCase());
              if (otherEmail) {
                window.location.href = `/dashboard/showroom?dm=${encodeURIComponent(otherEmail)}`;
              }
            } else {
              window.location.href = '/dashboard/showroom';
            }
          },
        },
      });
    } 
    // If window is unfocused, show browser notification
    else if (notificationPermission === 'granted') {
      try {
        const notification = new Notification(title, {
          body: description,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: notif.id,
        });

        notification.onclick = () => {
          window.focus();
          if (notif.channel) {
            window.location.href = `/dashboard/showroom?channel=${notif.channel}`;
          } else if (notif.dmKey) {
            const emails = notif.dmKey.split('|');
            const otherEmail = emails.find(e => e.toLowerCase() !== notif.senderEmail?.toLowerCase());
            if (otherEmail) {
              window.location.href = `/dashboard/showroom?dm=${encodeURIComponent(otherEmail)}`;
            }
          } else {
            window.location.href = '/dashboard/showroom';
          }
          notification.close();
        };
      } catch (err) {
        console.error('Failed to show browser notification:', err);
      }
    }
  }, [notificationPermission]);

  // Poll for new notifications
  useEffect(() => {
    let aborted = false;

    const checkForNewNotifications = async () => {
      if (aborted) return;

      try {
        // Get muted chats from localStorage
        let mutedChats: string[] = [];
        try {
          const stored = localStorage.getItem('mutedChats');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              mutedChats = parsed;
            }
          }
        } catch {}

        // Build query string
        const queryParams = mutedChats.length > 0 
          ? `?muted=${encodeURIComponent(mutedChats.join(','))}` 
          : '';

        const res = await fetch(`/api/chat/notifications${queryParams}`, { 
          cache: 'no-store' 
        });
        
        if (!res.ok) return;
        
        const data = await res.json();
        const notifications: ChatNotification[] = data.notifications || [];

        // Only show notifications that were created after our last check
        const newNotifications = notifications.filter(n => {
          const createdAt = new Date(n.created_at).getTime();
          return createdAt > lastCheckRef.current && !processedNotificationIds.current.has(n.id);
        });

        // Update last check time
        if (notifications.length > 0) {
          const latestTime = Math.max(
            lastCheckRef.current,
            ...notifications.map(n => new Date(n.created_at).getTime())
          );
          lastCheckRef.current = latestTime;
        }

        // Show notifications
        for (const notif of newNotifications) {
          showNotification(notif);
        }
      } catch (err) {
        console.error('[chat-notifications] Failed to check for notifications:', err);
      }
    };

    // Initial check (but don't notify for existing notifications)
    lastCheckRef.current = Date.now();
    
    // Start polling after initial load
    const interval = setInterval(checkForNewNotifications, pollIntervalMs);

    return () => {
      aborted = true;
      clearInterval(interval);
    };
  }, [pollIntervalMs, showNotification]);

  // Cleanup old processed IDs periodically (keep last 1000)
  useEffect(() => {
    const interval = setInterval(() => {
      const ids = Array.from(processedNotificationIds.current);
      if (ids.length > 1000) {
        processedNotificationIds.current = new Set(ids.slice(-1000));
      }
    }, 300000); // Every 5 minutes

    return () => clearInterval(interval);
  }, []);
}

