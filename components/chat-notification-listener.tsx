"use client";

import { useChatNotifications } from "@/lib/use-chat-notifications";

/**
 * Global listener for chat notifications
 * Mounted at layout level to work from any page
 * Shows in-app toasts when focused, browser notifications when unfocused
 */
export function ChatNotificationListener() {
  // Poll every 15 seconds for new mentions
  useChatNotifications(15000);
  
  return null; // This is a headless component
}

