"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

type Notification = {
  id: string;
  senderName: string;
  senderEmail: string;
  messageText: string;
  channel?: string;
  dmKey?: string;
  type: "mention" | "everyone" | "dm";
  created_at: string;
};

export function ChatNotifications() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
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
      
      // Build query string with muted chats
      const queryParams = mutedChats.length > 0 
        ? `?muted=${encodeURIComponent(mutedChats.join(','))}` 
        : '';
      
      const res = await fetch(`/api/chat/notifications${queryParams}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error("[notifications] Failed to fetch:", err);
    }
  }, []);

  // Poll for notifications every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    
    try {
      setLoading(true);
      await fetch("/api/chat/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      
      // Remove from local state
      setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    } catch (err) {
      console.error("[notifications] Failed to mark as read:", err);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    if (notifications.length === 0) return;
    
    try {
      setLoading(true);
      await fetch("/api/chat/notifications", {
        method: "DELETE",
      });
      
      setNotifications([]);
      setOpen(false);
    } catch (err) {
      console.error("[notifications] Failed to mark all as read:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  };

  const unreadCount = notifications.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          title="Chat notifications"
        >
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[20rem] p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-semibold">Mentions</div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={markAllAsRead}
              disabled={loading}
            >
              Mark all read
            </Button>
          )}
        </div>
        
        <div className="max-h-[24rem] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mb-2 opacity-30" />
              <p className="text-sm">No new mentions</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "p-4 hover:bg-muted/50 transition-colors cursor-pointer group",
                    "relative"
                  )}
                  onClick={() => {
                    markAsRead([notif.id]);
                    // Navigate to the channel or DM
                    if (notif.channel) {
                      router.push(`/dashboard/showroom?channel=${notif.channel}`);
                    } else if (notif.dmKey) {
                      const emails = notif.dmKey.split('|');
                      const otherEmail = emails.find(e => e.toLowerCase() !== notif.senderEmail?.toLowerCase());
                      if (otherEmail) {
                        router.push(`/dashboard/showroom?dm=${encodeURIComponent(otherEmail)}`);
                      }
                    }
                    setOpen(false);
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {notif.senderName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {notif.type === "everyone" ? "mentioned @everyone" : notif.type === "dm" ? "sent you a message" : "mentioned you"}
                        </span>
                      </div>
                      {notif.channel && (
                        <div className="text-xs text-muted-foreground">
                          in #{notif.channel}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead([notif.id]);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
                    {notif.messageText}
                  </p>
                  
                  <div className="text-xs text-muted-foreground">
                    {formatTime(notif.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

