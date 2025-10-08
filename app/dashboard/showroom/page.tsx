"use client";
import { Suspense, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { isRecord, resolveRecordId } from "@/lib/records";
import type { CSSProperties } from "react";
// Removed Stream chat; bespoke Surreal chat implementation
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardWorkspacePanel } from "@/components/dashboard-workspace-panel";
import LivestreamPanel from "@/components/livestream-panel";
import SubscriptionGate from "@/components/subscription-gate";
import ContentTabs from "@/components/ui/content-tabs";
import Lottie from "lottie-react";
import fireAnimation from "@/public/fire.json";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FeatureRequestsPanel from "@/components/feature-requests-panel";
import XpLeaderboard from "@/components/xp-leaderboard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { confirmToast } from "@/components/ui/toast-helpers";
import { Skeleton } from "@/components/ui/skeleton";
import { CarFront, SquarePen, ImagePlus, Loader2, UploadCloud, SquareCheckBig, SquarePlus, SquareSlash, Bell, BellOff } from "lucide-react";
import Chevron from "@/components/ui/chevron";
import { getViewUrls } from "@/lib/view-url-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Image from "next/image";
import { BlurhashImage } from "@/components/ui/blurhash-image";

import { uploadFilesToChat } from "@/lib/r2-upload";
import { ChatNotifications } from "@/components/chat-notifications";
import { HighlightMentions } from "@/lib/mention-highlighter";

type ChatMessage = {
  id?: string
  tempId?: string
  text: string
  userName: string
  userEmail?: string
  created_at?: string
  status?: 'sent' | 'pending' | 'failed'
  attachments?: string[]
}

type ShowroomView = "showroom" | "forge" | "livestream";
type ChannelPerms = { slug: string; name?: string; requiredReadRole?: 'user' | 'staff' | 'admin'; requiredReadPlan?: 'minimum' | 'pro' | 'ultra'; locked?: boolean; locked_until?: string | null };

type ChatProfile = {
  name?: string;
  image?: string;
  vehicles?: Array<{ make?: string; model?: string }>;
  photos?: string[];
  bio?: string;
};

type AttachmentStatus = 'pending' | 'uploading';

type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';
type PresenceDerivedStatus = PresenceStatus | 'offline';
type PresenceEntry = {
  email?: string;
  name: string;
  image?: string;
  rawStatus: PresenceDerivedStatus;
  status: PresenceDerivedStatus;
  updatedAtMs: number | null;
  role?: string;
  plan?: string;
};

const PRESENCE_GRACE_MS = 60_000;

function pickPresenceStatus(value: unknown): PresenceDerivedStatus | null {
  if (typeof value !== 'string') return null;
  const lowered = value.toLowerCase();
  if (lowered === 'online' || lowered === 'idle' || lowered === 'dnd' || lowered === 'invisible' || lowered === 'offline') {
    return lowered as PresenceDerivedStatus;
  }
  return null;
}

function parseIsoToMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function derivePresenceStatus(rawStatus: PresenceDerivedStatus, updatedAtMs: number | null, now: number, isSelf: boolean): PresenceDerivedStatus {
  if (rawStatus === 'invisible') return 'invisible';
  if (rawStatus === 'offline') return 'offline';
  if (isSelf) {
    if (rawStatus === 'idle' || rawStatus === 'dnd') return rawStatus;
    return 'online';
  }
  if (updatedAtMs === null) {
    if (rawStatus === 'idle' || rawStatus === 'dnd') return rawStatus;
    return 'online';
  }
  const age = now - updatedAtMs;
  if (age <= PRESENCE_GRACE_MS) {
    if (rawStatus === 'idle' || rawStatus === 'dnd') return rawStatus;
    return 'online';
  }
  return 'offline';
}

function toPresenceEntry(raw: unknown, existing: PresenceEntry | undefined, meEmail: string | null | undefined, now: number): PresenceEntry | null {
  const record = isRecord(raw) ? raw : {};
  const existingEmail = existing?.email;
  const emailRaw = typeof record['email'] === 'string' ? record['email'] : existingEmail;
  if (!emailRaw) return null;
  const email = emailRaw;
  const displayName = typeof record['displayName'] === 'string' && record['displayName'].trim().length ? record['displayName'].trim() : undefined;
  const nameRaw = typeof record['name'] === 'string' && record['name'].trim().length ? record['name'].trim() : undefined;
  const name = displayName ?? nameRaw ?? existing?.name ?? email;
  const image = typeof record['image'] === 'string' ? record['image'] : existing?.image;
    const rawStatusCandidate = pickPresenceStatus(record['rawStatus'])
    ?? pickPresenceStatus(record['presence_status'])
    ?? existing?.rawStatus
    ?? 'online';
  const updatedIso = record['updatedAt']
    ?? record['presence_updated_at']
    ?? record['presenceUpdatedAt']
    ?? record['last_seen']
    ?? null;
  let updatedAtMs = parseIsoToMs(updatedIso);
  if (updatedAtMs === null) {
    updatedAtMs = existing?.updatedAtMs ?? (record['presence_status'] !== undefined ? now : null);
  }
  const meLower = typeof meEmail === 'string' && meEmail ? meEmail.toLowerCase() : undefined;
  const emailLower = email.toLowerCase();
  const isSelf = meLower ? emailLower === meLower : false;
  const derivedCandidate = pickPresenceStatus(record['status']);
  const derived = derivedCandidate ?? derivePresenceStatus(rawStatusCandidate, updatedAtMs, now, isSelf);
  const role = typeof record['role'] === 'string' ? record['role'] : existing?.role;
  const plan = typeof record['plan'] === 'string' ? record['plan'] : existing?.plan;
  return {
    email,
    name,
    image,
    rawStatus: rawStatusCandidate,
    status: derived,
    updatedAtMs,
    role,
    plan,
  } satisfies PresenceEntry;
}

function normalizePresenceList(users: unknown[], previous: PresenceEntry[], meEmail: string | null | undefined, now: number = Date.now()): PresenceEntry[] {
  const prevMap = new Map(previous.map((entry) => [String(entry.email || '').toLowerCase(), entry]));
  const result: PresenceEntry[] = [];
  for (const raw of users) {
    const emailKey = isRecord(raw) && typeof raw['email'] === 'string' ? raw['email'].toLowerCase() : undefined;
    const existing = emailKey ? prevMap.get(emailKey) : undefined;
    const entry = toPresenceEntry(raw, existing, meEmail, now);
    if (entry) result.push(entry);
  }
  return result;
}

function mergePresenceUpdate(previous: PresenceEntry[], incoming: unknown, meEmail: string | null | undefined, now: number = Date.now()): PresenceEntry[] {
  if (!isRecord(incoming)) {
    return previous;
  }
  const email = typeof incoming['email'] === 'string' ? incoming['email'] : undefined;
  if (!email) return previous;
  const key = email.toLowerCase();
  let index = -1;
  for (let i = 0; i < previous.length; i++) {
    if ((previous[i].email || '').toLowerCase() === key) {
      index = i;
      break;
    }
  }
  const existing = index >= 0 ? previous[index] : undefined;
  const entry = toPresenceEntry(incoming, existing, meEmail, now);
  if (!entry) return previous;
  if (index === -1) {
    return [entry, ...previous];
  }
  const next = [...previous];
  next[index] = entry;
  return next;
}

const R2_PUBLIC_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || "https://r2.carcloutcdn.com").replace(/\/$/, "");
const IMAGE_EXTENSIONS = /\.(apng|avif|gif|jpe?g|jfif|pjpeg|pjp|png|svg|webp|bmp|ico|tiff?|heic|heif)$/i;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const SESSION_PREVIEW_SIZES = "(min-width: 80rem) 16rem, (min-width: 64rem) 14rem, (min-width: 48rem) 12rem, 80vw";
const LIBRARY_PREVIEW_SIZES = "(min-width: 80rem) 18rem, (min-width: 64rem) 16rem, (min-width: 48rem) 14rem, 90vw";
const PROFILE_PREVIEW_SIZES = "(min-width: 64rem) 12rem, (min-width: 48rem) 10rem, 70vw";

function pickMessageIdsForPurge(messages: ChatMessage[], limit: number): string[] {
  if (!Array.isArray(messages) || messages.length === 0 || limit <= 0) return [];
  const selected: string[] = [];
  for (let idx = messages.length - 1; idx >= 0 && selected.length < limit; idx--) {
    const id = resolveRecordId(messages[idx]?.id);
    if (!id) continue;
    selected.push(id);
  }
  return selected;
}

function DashboardShowroomPageInner() {
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [channels, setChannels] = useState<ChannelPerms[]>([]);
  const [active, setActive] = useState<string>("general");
  const [activeChatType, setActiveChatType] = useState<"channel" | "dm">("channel");
  const [activeDm, setActiveDm] = useState<{ email: string; name?: string; image?: string | null } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageCountRef = useRef(0);
  const [showMembers, setShowMembers] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [showroomView, setShowroomView] = useState<ShowroomView>("showroom");
  const [forgeTab] = useState<"workspace" | "content">("workspace");
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [dmConversations, setDmConversations] = useState<{ email: string; name?: string; image?: string | null }[]>([]);
  const [me, setMe] = useState<{ email?: string | null; role?: string | null; plan?: string | null; name?: string | null } | null>(null);
  const meEmail = me?.email ?? null;
  const [muted] = useState<{ active: boolean; reason?: string } | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dmTtlSeconds, setDmTtlSeconds] = useState<number>(24*60*60);
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentErrorShakeKey, setAttachmentErrorShakeKey] = useState(0);
  const [attachmentPreviewMap, setAttachmentPreviewMap] = useState<Record<string, string>>({});
  const [attachmentCanLoadDirect, setAttachmentCanLoadDirect] = useState<Record<string, boolean>>({});
  const [attachmentStatusMap, setAttachmentStatusMap] = useState<Record<string, AttachmentStatus>>({});
  const [showEveryoneHint, setShowEveryoneHint] = useState(false);
  const [sessionUploadKeys, setSessionUploadKeys] = useState<string[]>([]);
  const [messageAttachmentUrls, setMessageAttachmentUrls] = useState<Record<string, string>>({});
  const libraryLoadedRef = useRef(false);
  const sendingAttachmentsRef = useRef(false);
  const maxAttachments = 6;
  const [selectedAttachmentTab, setSelectedAttachmentTab] = useState<'upload' | 'library'>('upload');
  const [libraryItems, setLibraryItems] = useState<Array<{ key: string; url: string; blurhash?: string }>>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [mutedChats, setMutedChats] = useState<Set<string>>(new Set());
  const isWindowFocusedRef = useRef(true);
  const lastStreakCheckRef = useRef<number>(0);
  const streakNotificationsShownRef = useRef<Set<string>>(new Set());
  // Helper: on mobile, close channels sidebar after navigating
  const closeChannelsIfMobile = () => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 768) setShowChannels(false);
    } catch {}
  };

  // Load muted chats from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('mutedChats');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setMutedChats(new Set(parsed));
        }
      }
    } catch {}
  }, []);

  // Save muted chats to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('mutedChats', JSON.stringify(Array.from(mutedChats)));
    } catch {}
  }, [mutedChats]);

  // Request notification permission on mount
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

  // Track window focus
  useEffect(() => {
    const handleFocus = () => { isWindowFocusedRef.current = true; };
    const handleBlur = () => { isWindowFocusedRef.current = false; };
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Open sidebars by default on desktop (md and up)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setShowChannels(true);
        setShowMembers(true);
      }
    } catch {}
  }, [meEmail]);
  const flagEmojis = useMemo(() => {
    const codes = [
      "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
      "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
      "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ",
      "DE","DJ","DK","DM","DO","DZ",
      "EC","EE","EG","EH","ER","ES","ET",
      "FI","FJ","FK","FM","FO","FR",
      "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
      "HK","HM","HN","HR","HT","HU",
      "ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT",
      "JE","JM","JO","JP",
      "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ",
      "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
      "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
      "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ",
      "OM",
      "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY",
      "QA",
      "RE","RO","RS","RU","RW",
      "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
      "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
      "UA","UG","UM","US","UY","UZ",
      "VA","VC","VE","VG","VI","VN","VU",
      "WF","WS",
      "YE","YT",
      "ZA","ZM","ZW",
      "XK"
    ];
    const base = 127397; // regional indicator offset
    return codes.map((cc) => {
      const u = cc.toUpperCase();
      if (u.length !== 2) return "";
      return String.fromCodePoint(u.charCodeAt(0) + base, u.charCodeAt(1) + base);
    }).filter(Boolean);
  }, []);
  const getAspectStyle = useCallback((key: string): CSSProperties => {
    const dims = imageDimensions[key];
    if (dims?.width && dims?.height) {
      return { aspectRatio: `${dims.width} / ${dims.height}` };
    }
    return { aspectRatio: "1 / 1" };
  }, [imageDimensions]);
  const updateImageDimensions = useCallback((key: string, width: number, height: number) => {
    if (!width || !height) return;
    setImageDimensions((prev) => {
      const existing = prev[key];
      if (existing && existing.width === width && existing.height === height) return prev;
      return { ...prev, [key]: { width, height } };
    });
  }, []);
  const markAttachmentsStatus = useCallback((keys: string[], status: AttachmentStatus) => {
    if (!keys.length) return;
    setAttachmentStatusMap((prev) => {
      let mutated = false;
      const next: Record<string, AttachmentStatus> = { ...prev };
      for (const key of keys) {
        if (!key) continue;
        if (next[key] !== status) {
          next[key] = status;
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, []);
  const clearAttachmentStatus = useCallback((keys: string[]) => {
    if (!keys.length) return;
    setAttachmentStatusMap((prev) => {
      let mutated = false;
      const next: Record<string, AttachmentStatus> = { ...prev };
      for (const key of keys) {
        if (!key) continue;
        if (Object.prototype.hasOwnProperty.call(next, key)) {
          delete next[key];
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, []);
  // Helper to show notification (desktop or in-app toast)
  const showNotification = useCallback((chatId: string, userName: string, text: string, isDm: boolean, senderEmail?: string) => {
    // Don't show notifications for feature-request or leaderboard channels
    if (!isDm && (chatId === 'request-a-feature' || chatId === 'leaderboard')) {
      return;
    }
    
    // Don't show if chat is muted
    if (mutedChats.has(chatId)) {
      return;
    }

    // Don't notify for own messages
    if (me?.email && senderEmail && senderEmail.toLowerCase() === me.email.toLowerCase()) {
      return;
    }

    // For channel messages, only notify if:
    // 1. Message contains @everyone, OR
    // 2. Message mentions the current user
    if (!isDm && me?.email) {
      const hasEveryone = /@everyone\b/i.test(text);
      const emailPrefix = me.email.split('@')[0].toLowerCase();
      const hasMention = new RegExp(`@${emailPrefix}\\b`, 'i').test(text);
      
      // Skip notification if it's not a DM and doesn't have @everyone or mention
      if (!hasEveryone && !hasMention) {
        return;
      }
    }

    // Determine if this notification is for the currently active chat
    const isActiveChat = isDm 
      ? (activeChatType === 'dm' && activeDm?.email === chatId.replace('dm:', ''))
      : (activeChatType === 'channel' && active === chatId);

    // If user is viewing this chat and window is focused, don't notify at all
    if (isWindowFocusedRef.current && isActiveChat) {
      return;
    }

    const displayText = text.length > 100 ? text.substring(0, 100) + '...' : text;
    const title = isDm ? `${userName} (DM)` : `${userName} in #${chatId}`;

    // If window is focused but user is NOT viewing this chat, show in-app toast
    if (isWindowFocusedRef.current && !isActiveChat) {
      toast(title, {
        description: displayText,
        duration: 5000,
        action: {
          label: 'View',
          onClick: () => {
            if (isDm) {
              const email = chatId.replace('dm:', '');
              setActiveChatType('dm');
              setActiveDm({ email, name: userName });
              setShowroomView('showroom');
            } else {
              setActiveChatType('channel');
              setActive(chatId);
              setShowroomView('showroom');
            }
          },
        },
      });
      return;
    }

    // If window is unfocused, show desktop notification (requires permission)
    if (!isWindowFocusedRef.current && notificationPermission === 'granted') {
      try {
        const notification = new Notification(title, {
          body: displayText,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: chatId, // Replace previous notification from same chat
        });

        notification.onclick = () => {
          window.focus();
          // Navigate to the chat
          if (isDm) {
            const email = chatId.replace('dm:', '');
            setActiveChatType('dm');
            setActiveDm({ email, name: userName });
            setShowroomView('showroom');
          } else {
            setActiveChatType('channel');
            setActive(chatId);
            setShowroomView('showroom');
          }
          notification.close();
        };
      } catch (err) {
        console.error('Failed to show notification:', err);
      }
    }
  }, [isWindowFocusedRef, mutedChats, notificationPermission, me?.email, activeChatType, active, activeDm?.email, setActiveChatType, setActiveDm, setActive, setShowroomView]);

  // Helper to show streak warning notification
  const showStreakNotification = useCallback((type: 'warning' | 'lost', streak: number, hoursLeft?: number) => {
    if (notificationPermission !== 'granted') return;

    const notificationKey = `streak-${type}-${new Date().toDateString()}`;
    if (streakNotificationsShownRef.current.has(notificationKey)) return;

    try {
      let title = '';
      let body = '';
      
      if (type === 'warning') {
        title = '🔥 Streak at Risk!';
        if (hoursLeft !== undefined) {
          if (hoursLeft < 1) {
            body = `Your ${streak}-day streak expires in less than 1 hour! Log in to keep your ${streak >= 7 ? '2x XP bonus' : 'streak'} alive.`;
          } else if (hoursLeft < 6) {
            body = `Your ${streak}-day streak expires in ${Math.floor(hoursLeft)} hour${Math.floor(hoursLeft) !== 1 ? 's' : ''}! Log in to keep your ${streak >= 7 ? '2x XP bonus' : 'streak'} alive.`;
          } else {
            body = `Don't forget to log in today to maintain your ${streak}-day streak${streak >= 7 ? ' and 2x XP bonus' : ''}!`;
          }
        }
      } else {
        title = '💔 Streak Lost';
        body = `Your ${streak}-day streak has ended. Start a new one today!`;
      }

      const notification = new Notification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'streak-warning',
        requireInteraction: type === 'warning' && hoursLeft !== undefined && hoursLeft < 1,
      });

      notification.onclick = () => {
        window.focus();
        // Navigate to home to claim daily bonus
        window.location.href = '/dashboard/home';
        notification.close();
      };

      streakNotificationsShownRef.current.add(notificationKey);
    } catch (err) {
      console.error('Failed to show streak notification:', err);
    }
  }, [notificationPermission]);

  // Check streak status periodically
  const checkStreakStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/activity/streak/status', { cache: 'no-store' });
      if (!res.ok) return;
      
      const data = await res.json();
      const { streak, atRisk, hoursUntilLoss } = data as { 
        streak: number; 
        atRisk: boolean; 
        hoursUntilLoss: number | null;
      };

      if (atRisk && hoursUntilLoss !== null && streak > 0) {
        // Show warning at different intervals
        if (hoursUntilLoss < 1) {
          // Critical: less than 1 hour left
          showStreakNotification('warning', streak, hoursUntilLoss);
        } else if (hoursUntilLoss < 6) {
          // Warning: less than 6 hours left
          showStreakNotification('warning', streak, hoursUntilLoss);
        } else if (hoursUntilLoss < 12) {
          // Early warning: less than 12 hours left
          showStreakNotification('warning', streak, hoursUntilLoss);
        }
      }
    } catch (err) {
      console.error('Failed to check streak status:', err);
    }
  }, [showStreakNotification]);

  // Periodic streak checking (every 30 minutes)
  useEffect(() => {
    if (!meEmail) return;

    // Check immediately on mount
    checkStreakStatus();

    // Then check every 30 minutes
    const interval = setInterval(() => {
      const now = Date.now();
      // Only check if it's been at least 30 minutes since last check
      if (now - lastStreakCheckRef.current > 30 * 60 * 1000) {
        lastStreakCheckRef.current = now;
        checkStreakStatus();
      }
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(interval);
  }, [meEmail, checkStreakStatus]);

  // Listen for activity events to reset notification tracking
  useEffect(() => {
    const handleActivityChange = () => {
      // Reset streak notifications when user performs activity
      streakNotificationsShownRef.current.clear();
    };

    window.addEventListener('streak-refresh', handleActivityChange);
    window.addEventListener('xp-refresh', handleActivityChange);
    
    return () => {
      window.removeEventListener('streak-refresh', handleActivityChange);
      window.removeEventListener('xp-refresh', handleActivityChange);
    };
  }, []);

  const finalizeSentAttachments = useCallback((keys: string[]) => {
    if (!keys.length) return;
    const cleaned = keys.filter((key): key is string => typeof key === 'string' && key.length > 0);
    if (!cleaned.length) return;
    const keySet = new Set(cleaned);
    setPendingAttachments((prev) => prev.filter((key) => !keySet.has(key)));
    setAttachmentStatusMap((prev) => {
      let mutated = false;
      const next: Record<string, AttachmentStatus> = { ...prev };
      keySet.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(next, key)) {
          delete next[key];
          mutated = true;
        }
      });
      return mutated ? next : prev;
    });
    setSessionUploadKeys((prev) => prev.filter((key) => !keySet.has(key)));
  }, []);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        // parallelize initial fetches
        const [meRes, channelsRes, messagesRes, presenceRes, convRes, blocksRes, dmTtlRes] = await Promise.allSettled([
          fetch('/api/me', { cache: 'no-store' }).then(r=>r.json()),
          fetch('/api/chat/channels').then(r=>r.json()),
          fetch(`/api/chat/messages?channel=general`).then(r=>r.json()),
          fetch('/api/presence', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({users:[]})),
          fetch('/api/chat/dm/conversations', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({conversations:[]})),
          fetch('/api/blocks', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({blocked:[]})),
          fetch('/api/chat/dm/settings', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({ ttlSeconds: 86400 })),
        ]);
        if (mounted && meRes.status === 'fulfilled') setMe({ email: meRes.value?.email, role: meRes.value?.role, plan: meRes.value?.plan, name: meRes.value?.name });
        if (mounted && channelsRes.status === 'fulfilled') setChannels((channelsRes.value.channels || []).map((x: { slug: string; name?: string; requiredReadRole?: ChannelPerms['requiredReadRole']; requiredRole?: ChannelPerms['requiredReadRole']; requiredReadPlan?: ChannelPerms['requiredReadPlan']; locked?: boolean; locked_until?: string | null })=> ({ slug: String(x.slug), name: x.name, requiredReadRole: x.requiredReadRole || x.requiredRole, requiredReadPlan: x.requiredReadPlan, locked: !!x.locked, locked_until: x.locked_until || null })));
        if (mounted && messagesRes.status === 'fulfilled') setMessages(((messagesRes.value.messages || []) as Array<{ id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string }>).map((mm) => ({
          ...mm,
          status: 'sent',
          userEmail: typeof mm.userEmail === 'string' ? mm.userEmail : undefined,
        })));
        if (mounted && presenceRes.status === 'fulfilled') {
          const fetchedMeEmail = meRes.status === 'fulfilled' ? meRes.value?.email : null;
          const rawUsers = Array.isArray(presenceRes.value.users) ? presenceRes.value.users : [];
          const snapshot = normalizePresenceList(rawUsers, [], fetchedMeEmail);
          setPresence(snapshot);
        }
        if (mounted && convRes.status === 'fulfilled') {
          const self = String(meRes.status === 'fulfilled' ? meRes.value?.email || '' : '').toLowerCase();
          const convs = Array.isArray(convRes.value.conversations) ? convRes.value.conversations : [];
          const filtered = convs.filter((c: { email: string }) => String(c?.email || '').toLowerCase() !== self);
          setDmConversations(filtered.slice(0, 50));
        }
        if (mounted && blocksRes.status === 'fulfilled') setBlocked(Array.isArray(blocksRes.value?.blocked) ? blocksRes.value.blocked : []);
        if (mounted && dmTtlRes.status === 'fulfilled') {
          const v = Number(dmTtlRes.value?.ttlSeconds);
          if (Number.isFinite(v)) setDmTtlSeconds(Math.max(0, Math.floor(v)));
        }
        // Prefetch chat profiles in bulk to avoid many single requests later
        try {
          const emails: string[] = [];
          if (presenceRes.status === 'fulfilled') {
            for (const u of (presenceRes.value.users || [])) {
              const e = String(u?.email || '').toLowerCase();
              if (e && !emails.includes(e)) emails.push(e);
            }
          }
          if (messagesRes.status === 'fulfilled') {
            for (const m of (messagesRes.value.messages || [])) {
              const e = String(m?.userEmail || '').toLowerCase();
              if (e && !emails.includes(e)) emails.push(e);
            }
          }
          if (convRes.status === 'fulfilled') {
            for (const c of (convRes.value.conversations || [])) {
              const e = String(c?.email || '').toLowerCase();
              if (e && !emails.includes(e)) emails.push(e);
            }
          }
          const uniq = emails.filter(Boolean).slice(0, 200);
          if (uniq.length) {
            const qs = uniq.map((e)=> `emails=${encodeURIComponent(e)}`).join('&');
            const bulk = await fetch(`/api/users/chat-profile?${qs}`, { cache: 'no-store' }).then(r=>r.json()).catch(()=>({ profiles: {} }));
            const profs = (bulk?.profiles || {}) as Record<string, unknown>;
            try {
              if (typeof window !== 'undefined') {
                window.carcloutProfileCache = { ...(window.carcloutProfileCache || {}), ...profs };
              }
            } catch {}
          }
        } catch {}
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  // Sync view with URL query param (defaults to showroom if none)
  useEffect(() => {
    const raw = (searchParams.get("view") || "showroom");
    const mapped = ["studio", "generative", "downloads"].includes(raw) ? "showroom" : raw;
    const v = mapped as ShowroomView;
    if (["showroom", "forge", "livestream"].includes(v)) {
      setShowroomView(v);
      // track last non-showroom view if extended tabs return in future
    }
    
    // Handle channel/DM navigation from query params
    const channelParam = searchParams.get("channel");
    const dmParam = searchParams.get("dm");
    
    if (channelParam && v === "showroom") {
      setActiveChatType('channel');
      setActive(channelParam);
      setChatLoading(true);
      fetch(`/api/chat/messages?channel=${encodeURIComponent(channelParam)}`)
        .then(r => r.json())
        .then((data: { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] }) => {
          setMessages((data.messages || []).map(m => ({
            ...m,
            status: 'sent' as const,
            userEmail: typeof m.userEmail === 'string' ? m.userEmail : undefined,
          })));
        })
        .catch(() => {})
        .finally(() => setChatLoading(false));
    } else if (dmParam && v === "showroom") {
      setActiveChatType('dm');
      setActiveDm({ email: dmParam, name: undefined, image: null });
      setChatLoading(true);
      fetch(`/api/chat/dm/messages?user=${encodeURIComponent(dmParam)}`)
        .then(r => r.json())
        .then((data: { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] }) => {
          setMessages((data.messages || []).map(m => ({
            ...m,
            status: 'sent' as const,
            userEmail: typeof m.userEmail === 'string' ? m.userEmail : undefined,
          })));
        })
        .catch(() => {})
        .finally(() => setChatLoading(false));
    }
  }, [searchParams]);

  // Default to General showroom; if it's not available, fall back to Hooks page
  useEffect(() => {
    if (loading) return;
    try {
      const viewParam = searchParams.get("view");
      const hasGeneral = channels.some((c) => c.slug === "general");
      if ((!viewParam || viewParam === "showroom") && !hasGeneral) {
        setShowroomView("forge");
        router.replace("/dashboard/hooks");
      }
    } catch {}
  }, [loading, channels, searchParams, router]);

  // Refresh messages when profile is updated so names reflect latest
  useEffect(() => {
    function onProfileUpdated() {
      (async () => {
        setLoading(true);
        try {
        const m = await fetch(`/api/chat/messages?channel=${encodeURIComponent(active)}`).then(r=>r.json());
        setMessages((m.messages || []).map((mm: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string }) => ({
          ...mm,
          status: 'sent',
          userEmail: typeof mm.userEmail === 'string' ? mm.userEmail : undefined,
        })));
          const pres = await fetch('/api/presence', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({users:[]}));
          setPresence(prev => {
            const rawUsers = Array.isArray(pres.users) ? pres.users : [];
            return normalizePresenceList(rawUsers, prev, me?.email);
          });
          // Also refresh DM conversations so names update immediately
          try {
            const conv = await fetch('/api/chat/dm/conversations', { cache: 'no-store' }).then(r=>r.json());
            const self = String(me?.email || '').toLowerCase();
            const convs = Array.isArray(conv?.conversations) ? conv.conversations : [];
            const filtered = convs.filter((c: { email: string }) => String(c?.email || '').toLowerCase() !== self);
            setDmConversations(filtered.slice(0, 50));
          } catch {}
        } finally {
          setLoading(false);
        }
      })();
    }
    window.addEventListener('profile-updated', onProfileUpdated as EventListener);
    const onDmHiddenChanged = async () => {
      try {
        const conv = await fetch('/api/chat/dm/conversations', { cache: 'no-store' }).then(r=>r.json());
        const self = String(me?.email || '').toLowerCase();
        const convs = Array.isArray(conv?.conversations) ? conv.conversations : [];
        const filtered = convs.filter((c: { email: string }) => String(c?.email || '').toLowerCase() !== self);
        setDmConversations(filtered.slice(0, 50));
      } catch {}
    };
    window.addEventListener('dm-hidden-changed', onDmHiddenChanged as EventListener);
    return () => {
      window.removeEventListener('profile-updated', onProfileUpdated as EventListener);
      window.removeEventListener('dm-hidden-changed', onDmHiddenChanged as EventListener);
    };
  }, [active, me?.email]);

  // Presence polling (heartbeat handled globally by PresenceController)
  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    async function initSSE() {
      try {
        const snapshot = await fetch('/api/presence', { cache: 'no-store' }).then(r=>r.json()).catch(()=>({users:[]}));
        if (mounted) {
          setPresence(prev => {
            const rawUsers = Array.isArray(snapshot.users) ? snapshot.users : [];
            return normalizePresenceList(rawUsers, prev, meEmail);
          });
        }
      } catch {}
      es = new EventSource('/api/presence/live');
      es.onmessage = (ev) => {
        try {
          const { user } = JSON.parse(ev.data);
          if (!user?.email) return;
          const payload = {
            ...user,
            rawStatus: user.rawStatus ?? user.presence_status ?? user.status,
            status: user.status ?? user.presence_status ?? user.rawStatus,
            updatedAt: user.updatedAt ?? user.presence_updated_at ?? user.last_seen ?? null,
          };
          setPresence(prev => mergePresenceUpdate(prev, payload, meEmail));
        } catch {}
      };
      es.onerror = () => {
        try { es?.close(); } catch {}
        setTimeout(() => { if (mounted) initSSE(); }, 3000);
      };
    }
    initSSE();
    return () => {
      mounted = false;
      try { es?.close(); } catch {}
    };
  }, [meEmail]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const snapshot = await fetch('/api/presence', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ users: [] }));
        if (!cancelled) {
          const rawUsers = Array.isArray(snapshot.users) ? snapshot.users : [];
          setPresence(prev => normalizePresenceList(rawUsers, prev, meEmail));
        }
      } catch {}
    };
    const onPresenceUpdated = () => {
      refresh();
    };
    const onPresenceUpdatedLocal = (event: Event) => {
      const detail = (event as CustomEvent<{ email?: string; status?: string; updatedAt?: string; source?: string }>).detail;
      if (!detail?.email || !detail.status) return;
      const payload = {
        email: detail.email,
        status: detail.status,
        rawStatus: detail.status,
        updatedAt: detail.updatedAt ?? new Date().toISOString(),
      };
      setPresence(prev => mergePresenceUpdate(prev, payload, meEmail));
    };
    window.addEventListener('presence-updated', onPresenceUpdated as EventListener);
    window.addEventListener('presence-updated-local', onPresenceUpdatedLocal as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('presence-updated', onPresenceUpdated as EventListener);
      window.removeEventListener('presence-updated-local', onPresenceUpdatedLocal as EventListener);
    };
  }, [meEmail]);

  function tempId() {
    try { return crypto.randomUUID() } catch { return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  }

  const [confirmOpen, setConfirmOpen] = useState<null | { type: 'purge', count: number }>(null);
  const [featureOpen, setFeatureOpen] = useState(false);

  function FeatureRequestInlineForm() {
    const [busy, setBusy] = useState(false);
    const [canCreate, setCanCreate] = useState<boolean | null>(null);
    const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null);
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch('/api/feature-requests?meta=1', { cache: 'no-store' }).then(r=>r.json());
          if (!cancelled) {
            setCanCreate(!!r?.canCreate);
            setNextAllowedAt(r?.nextAllowedAt || null);
          }
        } catch {}
      })();
      return () => { cancelled = true; };
    }, []);
    function cooldownTextFor(iso: string | null) {
      if (!iso) return null;
      try {
        const ts = Date.parse(iso);
        if (!Number.isFinite(ts)) return null;
        const ms = ts - Date.now();
        if (ms <= 0) return null;
        const hrs = Math.ceil(ms / (60 * 60 * 1000));
        if (hrs >= 24) { const d = Math.ceil(hrs / 24); return `You can post again in ~${d} day${d===1?'':'s'}.`; }
        return `You can post again in ~${hrs} hour${hrs===1?'':'s'}.`;
      } catch { return null; }
    }
    return (
      <div className="rounded border border-[color:var(--border)]/70 bg-[color:var(--card)] p-3">
        <div className="text-sm font-medium mb-2">Suggest a feature</div>
        <div className="space-y-2">
          <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Short title" className="w-full rounded bg-white/5 px-3 py-2 text-sm" />
          <textarea value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Optional details" className="w-full rounded bg-white/5 px-3 py-2 text-sm min-h-[6em]" />
          <div className="flex items-center gap-2">
            <button type="button" className="px-3 py-2 rounded bg-primary text-black text-sm disabled:opacity-60" disabled={busy || !title.trim() || canCreate === false} onClick={async()=>{
              setBusy(true);
              try {
                const r = await fetch('/api/feature-requests', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: title.trim(), description: desc.trim() || undefined }) });
                const j = await r.json();
                if (!r.ok) {
                  if (j?.nextAllowedAt) setNextAllowedAt(j.nextAllowedAt);
                  throw new Error(j?.error || 'Failed to create');
                }
                setTitle(""); setDesc("");
                try { window.dispatchEvent(new CustomEvent('feature-request-created', { detail: j?.request })); } catch {}
              } catch {}
              finally { setBusy(false); }
            }}> {busy ? 'Submitting…' : 'Submit'} </button>
            {canCreate === false && cooldownTextFor(nextAllowedAt) ? (
              <span className="text-xs text-white/60">{cooldownTextFor(nextAllowedAt)}</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  async function tryHandleSlashCommand(input: string): Promise<boolean> {
    const raw = String(input || "").trim();
    if (!raw.startsWith('/')) return false;
    const [cmd, ...rest] = raw.slice(1).split(/\s+/);
    const name = (cmd || '').toLowerCase();

    if (name === 'purge') {
      if (me?.role !== 'admin') {
        // Non-admin: not a command; allow sending plain message
        return false;
      }
      if (activeChatType !== 'channel') {
        toast.error('Use /purge in a channel.');
        return true;
      }
      const nRaw = rest[0];
      let n = 10;
      if (typeof nRaw === 'string' && /^(\d+)$/.test(nRaw)) n = Math.max(1, Math.min(500, parseInt(nRaw, 10)));
      setConfirmOpen({ type: 'purge', count: n });
      return true;
    }

    if (name === 'lock') {
      if (me?.role !== 'admin') return false;
      if (activeChatType !== 'channel') { toast.error('Use /lock in a channel.'); return true; }
      const minutesRaw = rest[0];
      let minutes: number | undefined = undefined;
      if (typeof minutesRaw === 'string' && /^(\d+)$/.test(minutesRaw)) minutes = Math.max(1, parseInt(minutesRaw, 10));
      try {
        setChatLoading(true);
        const r = await fetch('/api/admin/showroom/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: active, minutes }) }).then(r=>r.json());
        if (r?.channel) {
          setChannels(prev => prev.map(c => c.slug === active ? { ...c, locked: !!r.channel.locked, locked_until: r.channel.locked_until || null } : c));
          toast.success(minutes ? `Channel locked for ${minutes} min.` : 'Channel locked.');
        } else {
          toast.error('Failed to lock channel.');
        }
      } catch {
        toast.error('Failed to lock channel.');
      } finally {
        setChatLoading(false);
      }
      return true;
    }

    if (name === 'unlock') {
      if (me?.role !== 'admin') return false;
      if (activeChatType !== 'channel') { toast.error('Use /unlock in a channel.'); return true; }
      try {
        setChatLoading(true);
        const r = await fetch('/api/admin/showroom/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: active }) }).then(r=>r.json());
        if (r?.channel) {
          setChannels(prev => prev.map(c => c.slug === active ? { ...c, locked: false, locked_until: null } : c));
          toast.success('Channel unlocked.');
        } else {
          toast.error('Failed to unlock channel.');
        }
      } catch {
        toast.error('Failed to unlock channel.');
      } finally {
        setChatLoading(false);
      }
      return true;
    }

    if (name === 'mute') {
      if (me?.role !== 'admin') return false;
      if (activeChatType !== 'channel') { toast.error('Use /mute in a channel.'); return true; }
      const targetRaw = rest[0];
      if (!targetRaw) { toast.error('Usage: /mute [email or name] [minutes?]'); return true; }
      const minutesRaw = rest[1];
      let minutes: number | undefined = undefined;
      if (typeof minutesRaw === 'string' && /^(\d+)$/.test(minutesRaw)) minutes = Math.max(1, parseInt(minutesRaw, 10));
      let targetEmail = '';
      const val = String(targetRaw);
      if (val.includes('@')) {
        targetEmail = val.toLowerCase();
      } else {
        // Try resolve by presence first
        const byPresence = presence.find(u => (u.name || '').toLowerCase() === val.toLowerCase() || (u.email || '').toLowerCase() === val.toLowerCase());
        if (byPresence?.email) targetEmail = String(byPresence.email).toLowerCase();
        if (!targetEmail) {
          try {
            const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(val)}&limit=1`).then(r=>r.json());
            const u = Array.isArray(res?.users) ? res.users[0] : null;
            if (u?.email) targetEmail = String(u.email).toLowerCase();
          } catch {}
        }
      }
      if (!targetEmail) { toast.error('Could not resolve user.'); return true; }
      if (targetEmail && me?.email && targetEmail.toLowerCase() === me.email.toLowerCase()) { toast.error('You cannot mute yourself.'); return true; }
      try {
        const payload: { targetEmail: string; channels: string[]; durationSeconds?: number } = { targetEmail, channels: [active] };
        if (minutes) payload.durationSeconds = minutes * 60;
        await fetch('/api/admin/mutes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        toast.success(minutes ? `Muted ${targetEmail} for ${minutes} min in #${active}` : `Muted ${targetEmail} in #${active}`);
      } catch {
        toast.error('Failed to mute user.');
      }
      return true;
    }

    toast.error('Unknown command.');
    return true;
  }

  const sendMessage = useCallback(async (text: string, temp?: string, attachments?: { key: string; url: string }[]) => {
    if (muted?.active) {
      toast.error('You are muted and cannot send messages.');
      return;
    }
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const trimmed = text?.trim?.() ?? '';
    const displayText = trimmed.length ? trimmed : (hasAttachments ? '\u200B' : '');
    const tid = temp || tempId();
    setMessages(prev => {
      const exists = prev.find(m => m.tempId === tid);
      if (exists) {
        return prev.map(m => m.tempId === tid ? { ...m, status: 'pending' } : m);
      }
      const display = (me?.name && !/@/.test(String(me.name))) ? me.name : (me?.email || 'You');
      return [...prev, { tempId: tid, text: displayText, userName: display, status: 'pending', userEmail: me?.email || undefined, attachments: attachments?.map((a) => a.key) }];
    });

    try {
      if (activeChatType === 'dm' && activeDm?.email) {
        const payload: Record<string, unknown> = { targetEmail: activeDm.email };
        if (attachments?.length) payload.attachments = attachments.map((a) => a.key);
        if (trimmed.length) payload.text = trimmed;
        const r = await fetch('/api/chat/dm/messages', { method:'POST', body: JSON.stringify(payload) }).then(r=>r.json());
        setMessages(prev => prev.map(m => m.tempId === tid ? {
          ...m,
          id: resolveRecordId(r.message?.id) || m.id,
          text: r.message?.text || displayText,
          userName: r.message?.userName || m.userName,
          created_at: r.message?.created_at,
          status: 'sent',
          attachments: Array.isArray(r.message?.attachments) ? r.message.attachments : m.attachments,
        } : m));
        setDmConversations(prev => prev.some(c => c.email === activeDm.email) ? prev : [{ email: activeDm.email, name: activeDm.name || activeDm.email, image: activeDm.image ?? null }, ...prev]);
        
        // Track DM sent
        try {
          window.dispatchEvent(new CustomEvent("dm-sent", { 
            detail: { hasAttachments: !!attachments?.length }
          }));
          // Check if this is first DM conversation
          if (!dmConversations.some(c => c.email === activeDm.email)) {
            window.dispatchEvent(new CustomEvent("first-dm-conversation", { 
              detail: { recipientEmail: activeDm.email }
            }));
          }
        } catch {}
      } else {
        const payload: Record<string, unknown> = { channel: active };
        if (attachments?.length) payload.attachments = attachments.map((a) => a.key);
        if (trimmed.length) payload.text = trimmed;
        const r = await fetch('/api/chat/messages', { method:'POST', body: JSON.stringify(payload) }).then(r=>r.json());
        setMessages(prev => prev.map(m => m.tempId === tid ? {
          ...m,
          id: resolveRecordId(r.message?.id) || m.id,
          text: r.message?.text || displayText,
          userName: r.message?.userName || m.userName,
          created_at: r.message?.created_at,
          status: 'sent',
          attachments: Array.isArray(r.message?.attachments) ? r.message.attachments : m.attachments,
        } : m));
        
        // Track message sent
        try {
          window.dispatchEvent(new CustomEvent("message-sent", { 
            detail: { channel: active, hasAttachments }
          }));
          if (hasAttachments) {
            window.dispatchEvent(new CustomEvent("attachment-shared", { 
              detail: { channel: active, count: attachments?.length || 0 }
            }));
          }
        } catch {}
        
        // Award XP for showroom post with image
        if (hasAttachments) {
          try {
            const xpRes = await fetch('/api/xp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'showroom-post' }),
            });
            const xpData = await xpRes.json().catch(() => ({}));
            if (xpData.added > 0) {
              const { showXpBonusToast, showStreakMultiplierToast, showFirstPostToast } = await import('@/lib/xp-toast');
              
              // Special celebration for first post
              if (xpData.isFirstPost) {
                showFirstPostToast(xpData.added);
              } else {
                showXpBonusToast(xpData.added, 'CarClout edit posted to Showroom', xpData.streakMultiplier);
              }
              
              if (xpData.streakMultiplier > 1 && xpData.currentStreak >= 7) {
                showStreakMultiplierToast(xpData.currentStreak);
              }
              if (xpData.leveledUp) {
                window.dispatchEvent(new CustomEvent('level-up', { detail: { level: xpData.level } }));
              }
              try { window.dispatchEvent(new CustomEvent('xp-refresh')); } catch {}
            }
          } catch (err) {
            console.error('Failed to award showroom post XP:', err);
          }
        }
      }
    } catch {
      setMessages(prev => prev.map(m => m.tempId === tid ? { ...m, status: 'failed' } : m));
    }
  }, [active, activeChatType, activeDm, dmConversations, me?.email, me?.name, muted?.active]);

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = before + emoji + after;
    const cursor = start + emoji.length;
    input.focus();
    try { input.setSelectionRange(cursor, cursor); } catch {}
  }

  // Subscribe to live updates for active chat (channel or DM)
  useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (showroomView !== 'showroom') return;
    let es: EventSource | null = null;
    // Only fetch snapshot here if we don't already have messages for the active target
    const needSnapshot = messageCountRef.current === 0;
    if (needSnapshot) setChatLoading(true);
    let disposed = false;
    async function initStream() {
      if (disposed) return;
      if (activeChatType === 'dm' && activeDm?.email) {
        if (needSnapshot) {
        const m: { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] } = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(activeDm.email)}`).then(r=>r.json());
        setMessages((m.messages || []).map((mm) => ({
          ...mm,
          status: 'sent',
          userEmail: typeof mm.userEmail === 'string' ? mm.userEmail : undefined,
        })));
        setChatLoading(false);
        }
        es = new EventSource(`/api/chat/dm/live?user=${encodeURIComponent(activeDm.email)}`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            const action = typeof data?.action === 'string' ? data.action.toLowerCase() : 'update';
            const before = isRecord(data?.before) ? data.before : null;
            const after = isRecord(data?.after) ? data.after : null;
          if (action === 'delete') {
            const id = resolveRecordId(before?.id ?? after?.id);
              if (!id) return;
              setMessages((prev) => prev.filter((m) => m.id !== id));
              return;
            }
            const rawFallback = data?.raw;
            let row = after ?? (isRecord(rawFallback) ? rawFallback : null);
            if (!isRecord(row) && Array.isArray(rawFallback?.result)) {
              const first = rawFallback.result.find((item: unknown) => isRecord(item));
              if (isRecord(first)) row = first;
            }
            if (!isRecord(row) && isRecord(after) && Array.isArray(after.result)) {
              const firstAfter = after.result.find((item: unknown) => isRecord(item));
              if (isRecord(firstAfter)) row = firstAfter;
            }
            if (!isRecord(row)) return;
            if (!isRecord(row)) return;
            const rawText: string = typeof row.text === 'string' ? row.text : '';
            let userName: string | undefined = typeof row.senderName === 'string' ? row.senderName : undefined;
            if (!userName || /@/.test(String(userName))) userName = 'Member';
            if (typeof row.senderEmail === 'string' && blocked.includes(row.senderEmail)) return;
            const attachments = Array.isArray(row.attachments)
              ? row.attachments.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 6)
              : [];
            const hasVisibleText = rawText.replace(/\u200B/g, '').trim().length > 0;
            if (!hasVisibleText && attachments.length === 0) return;
            const id = resolveRecordId(row.id);
            const normalizedEmail = typeof row.senderEmail === 'string' ? row.senderEmail.toLowerCase() : undefined;
            const message = {
              text: rawText,
              userName,
              userEmail: typeof row.senderEmail === 'string' ? row.senderEmail : undefined,
              status: 'sent' as const,
              created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
              id,
              attachments,
            } satisfies ChatMessage;
            setMessages((prev) => {
              const next = [...prev];
              const findPendingIndex = () => {
                if (!normalizedEmail) return -1;
                const attachmentsKey = attachments.join('\u0000');
                // Normalize text for comparison (treat \u200B as empty)
                const normalizedRawText = rawText.replace(/\u200B/g, '').trim();
                return next.findIndex((m) => {
                  if (m.id) return false;
                  if (m.status === 'sent') return false;
                  if ((m.userEmail || '').toLowerCase() !== normalizedEmail) return false;
                  // Normalize both texts for comparison
                  const mText = (m.text || '').replace(/\u200B/g, '').trim();
                  if (mText !== normalizedRawText) return false;
                  const prevAttachments = Array.isArray(m.attachments) ? m.attachments : [];
                  if (prevAttachments.length !== attachments.length) return false;
                  if (prevAttachments.join('\u0000') !== attachmentsKey) return false;
                  return true;
                });
              };

              const pendingIndex = findPendingIndex();
              if (pendingIndex !== -1) {
                next[pendingIndex] = { ...next[pendingIndex], ...message };
                return next;
              }

              if (id) {
                const existingIndex = next.findIndex((m) => m.id === id);
                if (existingIndex !== -1) {
                  next[existingIndex] = { ...next[existingIndex], ...message };
                  return next;
                }
              }
              
              // New message - show notification
              const isNewMessage = !next.some(m => m.id === id);
              if (isNewMessage && normalizedEmail !== me?.email?.toLowerCase()) {
                const dmChatId = `dm:${activeDm?.email || ''}`;
                const displayText = rawText.replace(/\u200B/g, '').trim() || (attachments.length > 0 ? `Sent ${attachments.length} image${attachments.length > 1 ? 's' : ''}` : '');
                showNotification(dmChatId, userName, displayText, true, normalizedEmail);
              }
              
              next.push(message);
              return next;
            });
          } catch {}
        };
        es.onerror = () => {
          try { es?.close(); } catch {};
          es = null;
          if (!disposed) {
            setTimeout(() => { initStream().catch(() => {}); }, 3000);
          }
        };
      } else {
        if (needSnapshot) {
        const m = await fetch(`/api/chat/messages?channel=${encodeURIComponent(active)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
        setMessages((m.messages || []).map((mm) => ({
          ...mm,
          status: 'sent',
          userEmail: typeof mm.userEmail === 'string' ? mm.userEmail : undefined,
        })));
        setChatLoading(false);
        }
        es = new EventSource(`/api/chat/live?channel=${encodeURIComponent(active)}`);
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            const action = typeof data?.action === 'string' ? data.action.toLowerCase() : 'update';
            const before = isRecord(data?.before) ? data.before : null;
            const after = isRecord(data?.after) ? data.after : null;

            if (action === 'delete') {
              const id = resolveRecordId(before?.id ?? after?.id);
              if (!id) return;
              setMessages((prev) => prev.filter((m) => m.id !== id));
              return;
            }

            const rawFallback = data?.raw;
            let row = after ?? (isRecord(rawFallback) ? rawFallback : null);
            if (!isRecord(row) && Array.isArray(rawFallback?.result)) {
              const first = rawFallback.result.find((item: unknown) => isRecord(item));
              if (isRecord(first)) row = first;
            }
            if (!isRecord(row) && isRecord(after) && Array.isArray(after.result)) {
              const firstAfter = after.result.find((item: unknown) => isRecord(item));
              if (isRecord(firstAfter)) row = firstAfter;
            }
            if (!isRecord(row)) return;

            const rawText: string = typeof row.text === 'string' ? row.text : '';
            let userName: string | undefined = typeof row.userName === 'string' ? row.userName : undefined;
            if (!userName || /@/.test(String(userName))) userName = 'Member';
            if (typeof row.userEmail === 'string' && blocked.includes(row.userEmail)) return;
            const attachments = Array.isArray(row.attachments)
              ? row.attachments.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 6)
              : [];
            const hasVisibleText = rawText.replace(/\u200B/g, '').trim().length > 0;
            if (!hasVisibleText && attachments.length === 0) return;
            const id = resolveRecordId(row.id);
            const normalizedEmail = typeof row?.userEmail === 'string' ? row.userEmail.toLowerCase() : undefined;
            const message = {
              text: rawText,
              userName,
              userEmail: typeof row?.userEmail === 'string' ? row.userEmail : undefined,
              status: 'sent' as const,
              created_at: typeof row?.created_at === 'string' ? row.created_at : undefined,
              id,
              attachments,
            } satisfies ChatMessage;
            setMessages((prev) => {
              const next = [...prev];
              const attachmentsKey = attachments.join('\u0000');
              // Normalize text for comparison (treat \u200B as empty)
              const normalizedRawText = rawText.replace(/\u200B/g, '').trim();
              const pendingIndex = normalizedEmail ? next.findIndex((m) => {
                if (m.id) return false;
                if (m.status === 'sent') return false;
                if ((m.userEmail || '').toLowerCase() !== normalizedEmail) return false;
                // Normalize both texts for comparison
                const mText = (m.text || '').replace(/\u200B/g, '').trim();
                if (mText !== normalizedRawText) return false;
                const prevAttachments = Array.isArray(m.attachments) ? m.attachments : [];
                if (prevAttachments.length !== attachments.length) return false;
                return prevAttachments.join('\u0000') === attachmentsKey;
              }) : -1;

              if (pendingIndex !== -1) {
                next[pendingIndex] = { ...next[pendingIndex], ...message };
                return next;
              }

              if (id) {
                const existingIndex = next.findIndex((m) => m.id === id);
                if (existingIndex !== -1) {
                  next[existingIndex] = { ...next[existingIndex], ...message };
                  return next;
                }
              }
              
              // New message - show notification
              const isNewMessage = !next.some(m => m.id === id);
              if (isNewMessage && normalizedEmail !== me?.email?.toLowerCase()) {
                const displayText = rawText.replace(/\u200B/g, '').trim() || (attachments.length > 0 ? `Sent ${attachments.length} image${attachments.length > 1 ? 's' : ''}` : '');
                showNotification(active, userName, displayText, false, normalizedEmail);
              }
              
              next.push(message);
              return next;
            });
          } catch {}
        };
        es.onerror = () => {
          try { es?.close(); } catch {};
          es = null;
          if (!disposed) {
            setTimeout(() => { initStream().catch(() => {}); }, 3000);
          }
        };
      }
    }
    initStream().catch(() => {});
    return () => {
      disposed = true;
      try { es?.close(); } catch {};
    };
  }, [active, activeChatType, activeDm?.email, showroomView, blocked, me?.email, showNotification]);

  function canAccessByRole(userRole?: 'user' | 'staff' | 'admin', required?: 'user' | 'staff' | 'admin') {
    if (!required) return true;
    if (!userRole) return false;
    if (required === 'user') return true;
    if (required === 'staff') return userRole === 'staff' || userRole === 'admin';
    if (required === 'admin') return userRole === 'admin';
    return false;
  }
  function canonicalPlan(p?: string | null): 'minimum' | 'pro' | 'ultra' | null {
    const s = (p || '').toLowerCase();
    if (s === 'ultra') return 'ultra';
    if (s === 'pro' || s === 'premium') return 'pro';
    if (s === 'minimum' || s === 'base' || s === 'basic') return 'minimum';
  return null;
}

// default export placed at end of module
  function canAccessByPlan(userPlan?: string | null, required?: 'minimum' | 'pro' | 'ultra') {
    if (!required) return true;
    const p = canonicalPlan(userPlan);
    if (!p) return false;
    if (required === 'minimum') return p === 'minimum' || p === 'pro' || p === 'ultra';
    if (required === 'pro') return p === 'pro' || p === 'ultra';
    if (required === 'ultra') return p === 'ultra';
    return false;
  }
  const activeChannelPerms = channels.find(c => c.slug === active);
  const isChannelLocked = useMemo(() => {
    if (!activeChannelPerms || activeChatType === 'dm') return false;
    const lockedFlag = !!activeChannelPerms.locked;
    const until = activeChannelPerms.locked_until;
    let locked = lockedFlag;
    if (!locked && typeof until === 'string' && until) {
      const ts = Date.parse(until);
      if (Number.isFinite(ts) && ts > Date.now()) locked = true;
    }
    return locked;
  }, [activeChannelPerms, activeChatType]);
  const lockedForMe = (isChannelLocked && me?.role !== 'admin' && activeChatType === 'channel');
  function DmTtlNotice({ self, ttlSeconds }: { self?: boolean; ttlSeconds: number }) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [val, setVal] = useState(ttlSeconds);
    useEffect(() => { setVal(ttlSeconds); }, [ttlSeconds]);
    const label = self ? 'Messages stay forever' : (ttlSeconds <= 0 ? 'Messages stay forever' : `Messages auto-delete after ${Math.round(ttlSeconds/3600)}h`);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-[color:var(--border)]/60">
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="p-3 w-64">
          <div className="text-xs mb-2">Direct messages auto-delete by default. Change your preference:</div>
          <div className="flex flex-col gap-2">
            {[24, 48, 72, 0].map((hrs)=> (
              <label key={hrs} className="text-xs inline-flex items-center gap-2">
                <input type="radio" name="dm-ttl" className="accent-[color:var(--primary)]" checked={hrs===0 ? val<=0 : val===hrs*3600} onChange={()=> setVal(hrs===0 ? 0 : hrs*3600)} />
                <span>{hrs===0 ? 'Never auto-delete' : `${hrs} hours`}</span>
              </label>
            ))}
            <div className="flex items-center justify-end gap-2 mt-1">
              <button className="text-xs px-2 py-1 rounded bg-white/5 border border-[color:var(--border)]/60" onClick={()=> setOpen(false)}>Close</button>
              <button disabled={saving} className="text-xs px-2 py-1 rounded bg-primary text-black disabled:opacity-60" onClick={async()=>{
                setSaving(true);
                try {
                  const r = await fetch('/api/chat/dm/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ttlSeconds: val }) }).then(r=>r.json());
                  const v = Number(r?.ttlSeconds);
                  if (Number.isFinite(v)) setDmTtlSeconds(Math.max(0, Math.floor(v)));
                  toast.success('DM expiry preference updated');
                  setOpen(false);
                } catch {
                } finally {
                  setSaving(false);
                }
              }}>Save</button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  const _filterByChannelAccess = (u: { role?: string; plan?: string; status?: string; email?: string; name?: string; image?: string }) => {
    if (!activeChannelPerms || activeChatType === 'dm') return true;
    const okRole = canAccessByRole(u.role as 'user' | 'staff' | 'admin' | undefined, activeChannelPerms.requiredReadRole);
    const okPlan = canAccessByPlan(u.plan as 'minimum' | 'pro' | 'ultra' | undefined, activeChannelPerms.requiredReadPlan);
    return okRole && okPlan;
  };
  // Treat online group as any non-offline user (online, idle, dnd; invisible stays in offline list)
  // Note: We show ALL users in the sidebar regardless of channel access - the channel filter only affects message permissions
  const onlineUsers = presence
    .filter(u => (u.status !== 'offline' && u.status !== 'invisible'))
    .map(u => ({
      email: u.email as string | undefined,
      name: (u.name || u.email || '') as string,
      image: u.image as string | undefined,
      status: (u.status === 'idle' ? 'idle' : u.status === 'dnd' ? 'dnd' : 'online') as 'online' | 'idle' | 'dnd',
      role: u.role as string | undefined,
      plan: u.plan as string | undefined,
    }))
    .filter(u => !!u.name)
    .slice(0,30);
  const offlineUsers = presence
    .filter(u => (u.status === 'offline' || u.status === 'invisible'))
    .map(u => ({ email: u.email as string | undefined, name: (u.name || u.email || '') as string, image: u.image as string | undefined, role: u.role as string | undefined, plan: u.plan as string | undefined }))
    .filter(u => !!u.name)
    .slice(0,50);

  // Group helpers for elegant ordering: Admins → Ultra → Pro → Members
  const isUltraPlan = (p?: string) => (p || '').toLowerCase() === 'ultra';
  const isProPlan = (p?: string) => {
    const plan = (p || '').toLowerCase();
    return plan === 'pro' || plan === 'premium';
  };
  const onlineAdmins = onlineUsers.filter(u => (u.role || '').toLowerCase() === 'admin');
  const onlineUltras = onlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && isUltraPlan(u.plan));
  const onlinePros = onlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && isProPlan(u.plan));
  const onlineBase = onlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && !isUltraPlan(u.plan) && !isProPlan(u.plan));
  const offlineAdmins = offlineUsers.filter(u => (u.role || '').toLowerCase() === 'admin');
  const offlineUltras = offlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && isUltraPlan(u.plan));
  const offlinePros = offlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && isProPlan(u.plan));
  const offlineBase = offlineUsers.filter(u => (u.role || '').toLowerCase() !== 'admin' && !isUltraPlan(u.plan) && !isProPlan(u.plan));

  // Use inline gridTemplateColumns to avoid Tailwind JIT missing dynamic arbitrary values
  const gridTemplateColumns = useMemo(() => {
    if (showroomView !== 'showroom') return '1fr';
    const left = showChannels ? '280px ' : '';
    const right = (showMembers && activeChatType === 'channel') ? ' 300px' : '';
    return `${left}1fr${right}`;
  }, [showroomView, showChannels, showMembers, activeChatType]);

  const compressImage = useCallback(async (file: File) => {
    try {
      const MAX_DIMENSION = 1920;
      const MAX_BYTES = 500 * 1024;
      const createImageBitmap = window.createImageBitmap;
      if (!createImageBitmap) return file;
      const bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      let quality = 0.85;
      let blob: Blob | null = null;
      while (quality > 0.4) {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob) break;
        if (blob.size <= MAX_BYTES) break;
        quality -= 0.1;
      }
      if (!blob) return file;
      if (blob.size > MAX_BYTES) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/,'') + '.webp', { type: 'image/webp' });
    } catch {
      return file;
    }
  }, []);

  const fetchLibraryPhotos = useCallback(async () => {
    if (libraryLoadedRef.current || libraryLoading) return;
    setLibraryLoading(true);
    try {
      const res = await fetch('/api/storage/list?path=' + encodeURIComponent('library'), { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      const files: Array<{ key?: string; type?: string; lastModified?: string; blurhash?: string }> = Array.isArray(data?.items) ? data.items : [];
      const imageFiles = files.filter((it) => {
        if (String(it?.type) !== 'file') return false;
        const basename = (it.key || '').split('?')[0]?.split('/').pop() || '';
        return IMAGE_EXTENSIONS.test(basename);
      });
      // Sort by most recent first
      imageFiles.sort((a, b) => {
        const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return bTime - aTime;
      });
      const imageKeys = imageFiles.map((it) => it.key || '').filter(Boolean);
      if (!imageKeys.length) {
        setLibraryItems([]);
        libraryLoadedRef.current = true;
        return;
      }
      const urls = await getViewUrls(imageKeys);
      setLibraryItems(imageFiles.map((file) => ({ 
        key: file.key || '', 
        url: urls[file.key || ''] || (`https://r2.carcloutcdn.com/${file.key}`),
        blurhash: file.blurhash
      })));
      libraryLoadedRef.current = true;
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryLoading]);

  useEffect(() => {
    const keys = new Set<string>();
    for (const m of messages) {
      if (Array.isArray(m.attachments)) {
        for (const key of m.attachments) {
          if (typeof key === "string" && key) keys.add(key);
        }
      }
    }
    const shouldPrefetch = (key: string) => !messageAttachmentUrls[key] && !attachmentPreviewMap[key] && attachmentCanLoadDirect[key] !== true;
    const missing = Array.from(keys).filter((key) => shouldPrefetch(key));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const urls = await getViewUrls(missing);
        if (cancelled) return;
        setMessageAttachmentUrls((prev) => {
          const next = { ...prev } as Record<string, string>;
          for (const [key, url] of Object.entries(urls)) {
            if (key && url) next[key] = url;
          }
          return next;
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [messages, messageAttachmentUrls, attachmentPreviewMap, attachmentCanLoadDirect]);

  // Proactively refresh presigned URLs every 8 minutes to prevent expiration
  useEffect(() => {
    const REFRESH_INTERVAL = 8 * 60 * 1000; // 8 minutes (before 9-minute cache TTL)
    
    const refreshUrls = async () => {
      const keys = Object.keys(messageAttachmentUrls);
      if (keys.length === 0) return;
      
      try {
        // Fetch fresh URLs with TTL=0 to bypass cache
        const urls = await getViewUrls(keys, undefined, 0);
        setMessageAttachmentUrls((prev) => {
          const next = { ...prev };
          for (const [key, url] of Object.entries(urls)) {
            if (key && url) next[key] = url;
          }
          return next;
        });
      } catch (err) {
        console.error('Failed to refresh attachment URLs:', err);
      }
    };
    
    const intervalId = setInterval(refreshUrls, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [messageAttachmentUrls]);

  // Auto-resize textarea handler
  const handleTextareaResize = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 96); // max 96px (about 4 lines at 16px font)
    textarea.style.height = `${newHeight}px`;
  }, []);

  const handleSendAttachments = useCallback(async () => {
    if (!pendingAttachments.length) return;
    if (sendingAttachmentsRef.current) return;
    const attachmentsToSend = pendingAttachments
      .map((key) => {
        if (typeof key !== 'string' || !key) return null;
        const url = attachmentPreviewMap[key];
        if (!url) return null;
        return { key, url };
      })
      .filter((item): item is { key: string; url: string } => !!item);
    if (!attachmentsToSend.length) return;
    sendingAttachmentsRef.current = true;
    setAttachmentModalOpen(false);
    setAttachmentError(null);
    const sentKeys = attachmentsToSend.map((item) => item.key);
    markAttachmentsStatus(sentKeys, 'pending');
    const input = inputRef.current;
    const raw = input?.value ?? '';
    const trimmed = raw.trim();
    const hasText = trimmed.length > 0;
    const messageText = hasText ? trimmed : '';
    if (input) {
      input.value = '';
      handleTextareaResize();
    }
    try {
      await sendMessage(messageText, undefined, attachmentsToSend);
    } finally {
      finalizeSentAttachments(sentKeys);
      setSelectedAttachmentTab('upload');
      sendingAttachmentsRef.current = false;
    }
  }, [pendingAttachments, attachmentPreviewMap, finalizeSentAttachments, markAttachmentsStatus, sendMessage, handleTextareaResize]);

  // Check if user has minimum plan (base plan)
  const _hasMinimumPlan = useMemo(() => {
    const plan = canonicalPlan(me?.plan);
    return plan === 'minimum';
  }, [me?.plan]);

  // Comment out minimum plan check - all users now have showroom access
  /*
  useEffect(() => {
    if (hasMinimumPlan && !loading) {
      try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {}
    }
  }, [hasMinimumPlan, loading]);
  */

  // Reset textarea height when messages change (after sending)
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea && !textarea.value) {
      textarea.style.height = 'auto';
      handleTextareaResize();
    }
  }, [messages.length, handleTextareaResize]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-6rem)]">
        <Lottie animationData={fireAnimation} loop className="w-24 h-24" />
      </div>
    );
  }

  return (
    <div className={"relative grid h-[calc(100dvh-6rem)] min-h-[calc(100dvh-6rem)] min-w-0"} style={{ gridTemplateColumns }}>
        <SubscriptionGate />
        {/* Comment out blur overlay - all users now have showroom access */}
        {/* Blur overlay for minimum plan users - cannot be removed via inspect element */}
        {/* hasMinimumPlan && (
          <>
            <div 
              className="fixed inset-0 z-[9999] backdrop-blur-[12px]" 
              style={{ 
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                background: 'rgba(0,0,0,0.3)',
                pointerEvents: 'auto'
              }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            />
            <div 
              className="fixed inset-0 z-[10000] flex items-center justify-center"
              style={{ pointerEvents: 'none' }}
            >
              <div className="text-center" style={{ pointerEvents: 'auto' }}>
                <h2 className="text-2xl font-bold mb-4">Community Access Locked</h2>
                <p className="text-lg mb-4">Upgrade to Pro to access the community</p>
                <Button 
                  onClick={() => { try { window.dispatchEvent(new CustomEvent('open-pro-upsell')); } catch {} }}
                  className="text-white"
                  style={{ backgroundColor: '#ff6a00', borderColor: '#ff6a00' }}
                >
                  Upgrade to Pro
                </Button>
              </div>
            </div>
          </>
        ) */}
        {showroomView === 'showroom' && showChannels ? (
        <aside className="h-full min-h-0 border-r border-[color:var(--border)] overflow-y-auto p-2 bg-[var(--card)] md:static absolute inset-0 z-40"> 
          {/* Mobile close */}
                  <button className="md:hidden absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[color:var(--border)]/60 bg-white/5 hover:bg-white/10 text-xs" onClick={() => setShowChannels(false)} aria-label="Close channels">
            <span className="sr-only">Close</span>
                    <Chevron direction="left" className="h-4 w-4" />
          </button>
          <div className="text-sm font-semibold px-2 mb-2">Channels</div>
          <ul className="space-y-1">
            {channels.filter(c=>c.slug !== 'livestream' && c.slug !== 'pro').map((c)=> {
              const isMuted = mutedChats.has(c.slug);
              const canMute = c.slug !== 'request-a-feature' && c.slug !== 'leaderboard';
              return (
              <li key={c.slug} className="group relative">
                <button onClick={async()=>{
                  setActiveChatType('channel');
                  setActive(c.slug);
                  setActiveDm(null);
                  setShowroomView('showroom');
                  router.push('/dashboard/showroom');
                  setChatLoading(true);
                  if (c.slug === 'request-a-feature') {
                    setMessages([]);
                  } else {
                    const m = await fetch(`/api/chat/messages?channel=${c.slug}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[]; image?: string | null }[] };
                    setMessages((m.messages||[]).map((mm)=>({
                      ...mm,
                      status: 'sent',
                      userEmail: typeof mm.userEmail === 'string' ? mm.userEmail : undefined,
                    })));
                  }
                  setChatLoading(false);
                }} className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${showroomView==='showroom' && activeChatType==='channel' && active===c.slug ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                  <span>#{c.slug}</span>
                  {isMuted && <BellOff className="ml-auto h-3 w-3 text-white/40" />}
                </button>
                {canMute && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMutedChats(prev => {
                        const next = new Set(prev);
                        if (next.has(c.slug)) {
                          next.delete(c.slug);
                          toast.success(`Unmuted #${c.slug}`);
                        } else {
                          next.add(c.slug);
                          toast.success(`Muted #${c.slug}`);
                        }
                        return next;
                      });
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
                    title={isMuted ? `Unmute #${c.slug}` : `Mute #${c.slug}`}
                    aria-label={isMuted ? `Unmute #${c.slug}` : `Mute #${c.slug}`}
                  >
                    {isMuted ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                  </button>
                )}
              </li>
              );
            })}
          </ul>
          <div className="text-sm font-semibold px-2 mt-4 mb-2">Direct Messages</div>
          <ul className="space-y-1">
            {dmConversations.map((u)=> {
              const p = presence.find(pp => (pp.email || '').toLowerCase() === (u.email || '').toLowerCase());
              const isAdm = (p?.role || '').toLowerCase() === 'admin';
              const userCanonicalPlan = canonicalPlan(p?.plan);
              const isPro = userCanonicalPlan === 'pro';
              const isUltra = userCanonicalPlan === 'ultra';
              const dmChatId = `dm:${u.email}`;
              const isMuted = mutedChats.has(dmChatId);
              return (
              <li key={u.email} className="group relative">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e)=>{
                        e.preventDefault();
                        e.stopPropagation();
                        const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                        try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                      }}
                      onKeyDown={(e)=>{
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          try { (e.currentTarget as HTMLElement).click(); } catch {}
                        }
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${showroomView==='showroom' && activeChatType==='dm' && activeDm?.email===u.email? 'bg-white/10' : 'hover:bg-white/5'}`}
                    >
                      <Avatar className="size-5">
                        <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                        <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                      </Avatar>
                        <span className={`truncate ${isAdm ? 'text-[#ef4444]' : (isUltra ? 'text-[#8b5cf6]' : (isPro ? 'text-[#ff6a00]' : ''))}`}>{u.name || u.email}</span>
                        {isMuted && <BellOff className="h-3 w-3 text-white/40" />}
                        {isAdm ? (
                          <span className="ml-auto text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[#ef4444]/30">Admin</span>
                        ) : (isUltra ? (
                          <span className="ml-auto text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(139,92,246,0.12)] text-[#8b5cf6] border border-[#8b5cf6]/30">Ultra</span>
                        ) : (isPro ? (
                          <span className="ml-auto text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(255,106,0,0.12)] text-[#ff6a00] border border-[#ff6a00]/30">Pro</span>
                        ) : null))}
                    </div>
                  </ContextMenuTrigger>
                  <UserContextMenu
                    meEmail={me?.email ?? undefined}
                    email={u.email}
                    name={u.name || u.email}
                    activeChannel={active}
                    blocked={blocked}
                    onBlockedChange={setBlocked}
                    isAdmin={me?.role === 'admin'}
                      userRole={p?.role}
                      userPlan={p?.plan}
                    onStartDm={async (email, name) => {
                  setActiveChatType('dm');
                      setActiveDm({ email, name, image: u.image ?? null });
                  setShowroomView('showroom');
                  router.push('/dashboard/showroom');
                  closeChannelsIfMobile();
                  setChatLoading(true);
                      const messagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                  setMessages((messagesResponse.messages||[]).map((mm)=>({
                    ...mm,
                    status: 'sent',
                    userEmail: typeof mm.userEmail === 'string' ? mm.userEmail : undefined,
                  })));
                  setChatLoading(false);
                      // Unhide if previously hidden
                      try { await fetch('/api/chat/dm/hidden', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otherEmail: email }) }); } catch {}
                      setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                    }}
                  />
                </ContextMenu>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMutedChats(prev => {
                      const next = new Set(prev);
                      if (next.has(dmChatId)) {
                        next.delete(dmChatId);
                        toast.success(`Unmuted DM with ${u.name || u.email}`);
                      } else {
                        next.add(dmChatId);
                        toast.success(`Muted DM with ${u.name || u.email}`);
                      }
                      return next;
                    });
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
                  title={isMuted ? `Unmute DM with ${u.name || u.email}` : `Mute DM with ${u.name || u.email}`}
                  aria-label={isMuted ? `Unmute DM with ${u.name || u.email}` : `Mute DM with ${u.name || u.email}`}
                >
                  {isMuted ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                </button>
              </li>
              );
            })}
          </ul>
        </aside>
        ) : null}
        <section className="flex flex-col min-w-0 min-h-0 h-full">
          {showroomView === 'showroom' && (
            <>
              <div className="h-12 flex items-center justify-between px-3 border-b border-[color:var(--border)]">
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs px-2 py-1 rounded hover:bg-white/5"
                    title={showChannels ? 'Hide channels' : 'Show channels'}
                    onClick={()=> setShowChannels(v=>{
                      const next = !v;
                      try { if (next && typeof window !== 'undefined' && window.innerWidth < 768) setShowMembers(false); } catch {}
                      return next;
                    })}
                  >
                    <Chevron direction={showChannels ? "left" : "right"} className="h-4 w-4 transition-transform" />
                  </button>
                  <div className="flex items-center gap-2">
                    {activeChatType === 'dm' ? (
                      (()=>{
                        const dp = activeDm?.email ? presence.find(u => (u.email || '').toLowerCase() === (activeDm!.email || '').toLowerCase()) : undefined;
                        const isAdm = (dp?.role || '').toLowerCase() === 'admin';
                        const userCanonicalPlan = canonicalPlan(dp?.plan);
                        const isPro = userCanonicalPlan === 'pro';
                        const isUltra = userCanonicalPlan === 'ultra';
                        const name = activeDm?.name || activeDm?.email || 'self';
                        return (
                          <span className="inline-flex items-center gap-2">
                            <span className={`${isAdm ? 'text-[#ef4444]' : (isUltra ? 'text-[#8b5cf6]' : (isPro ? 'text-[#ff6a00]' : ''))}`}>@{name}</span>
                            {isAdm ? (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[#ef4444]/30">Admin</span>
                            ) : (isUltra ? (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(139,92,246,0.12)] text-[#8b5cf6] border border-[#8b5cf6]/30">Ultra</span>
                            ) : (isPro ? (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(255,106,0,0.12)] text-[#ff6a00] border border-[#ff6a00]/30">Pro</span>
                            ) : null))}
                            {/* Ephemeral TTL indicator */}
                            <DmTtlNotice self={!!(me?.email && activeDm?.email && me.email.toLowerCase() === activeDm.email.toLowerCase())} ttlSeconds={dmTtlSeconds} />
                          </span>
                        );
                      })()
                    ) : (
                      `#${active}`
                    )}
                    {activeChatType === 'channel' && isChannelLocked ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/10 border border-[color:var(--border)]/60" title="Channel is locked">
                        🔒 Locked
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ChatNotifications />
                  {activeChatType === 'channel' ? (
                    <button className="text-xs px-2 py-1 rounded hover:bg-white/5" onClick={()=> setShowMembers(v=>{
                      const next = !v;
                      try { if (next && typeof window !== 'undefined' && window.innerWidth < 768) setShowChannels(false); } catch {}
                      return next;
                    })}>{showMembers ? 'Hide Members' : 'Show Members'}</button>
                  ) : null}
                </div>
              </div>
              {/* Admin confirmation dialogs */}
              <AlertDialog open={!!confirmOpen} onOpenChange={(o)=>{ if(!o) setConfirmOpen(null); }}>
                <AlertDialogContent>
                  <AlertDialogTitle>Confirm action</AlertDialogTitle>
                  <AlertDialogDescription>
                    {confirmOpen?.type === 'purge' ? `Purge last ${confirmOpen.count} messages in #${active}? This cannot be undone.` : ''}
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={()=> setConfirmOpen(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={async()=>{
                      if (confirmOpen?.type === 'purge') {
                        const count = confirmOpen.count;
                        setConfirmOpen(null);
                        const ids = pickMessageIdsForPurge(messages, count);
                        if (!ids.length) {
                          toast.error('No messages to purge.');
                          return;
                        }
                        const optimisticIds = new Set(ids);
                        const snapshotBefore = messages;
                        setMessages((prev) => prev.filter((msg) => {
                          const rid = resolveRecordId(msg.id);
                          return !(rid && optimisticIds.has(rid));
                        }));

                        try {
                          const res = await fetch('/api/admin/showroom/purge', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ channel: active, limit: count, ids }),
                          });
                          if (!res.ok) {
                            const info = await res.json().catch(() => ({} as Record<string, unknown>));
                            const purgedIds = new Set<string>(
                              Array.isArray(info?.purgedIds) ? info.purgedIds.filter((v: unknown): v is string => typeof v === 'string') : []
                            );
                            setMessages((prev) => {
                              const restored = [...prev];
                              for (const msg of snapshotBefore) {
                                const rid = resolveRecordId(msg.id);
                                if (!rid) continue;
                                if (optimisticIds.has(rid) && !purgedIds.has(rid)) {
                                  if (!restored.some((existing) => resolveRecordId(existing.id) === rid)) {
                                    restored.push({ ...msg, status: 'sent' });
                                  }
                                }
                              }
                              return restored;
                            });
                            toast.error('Failed to purge messages.');
                          }
                        } catch {
                          setMessages((prev) => {
                            const restored = [...prev];
                            for (const msg of snapshotBefore) {
                              const rid = resolveRecordId(msg.id);
                              if (!rid) continue;
                              if (optimisticIds.has(rid) && !restored.some((existing) => resolveRecordId(existing.id) === rid)) {
                                restored.push({ ...msg, status: 'sent' });
                              }
                            }
                            return restored;
                          });
                          toast.error('Failed to purge messages.');
                        }
                      }
                    }}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
                {muted?.active ? (
                  <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
                    You are currently muted. Your messages will not be delivered.
                  </div>
                ) : null}
                {activeChatType === 'dm' && me?.email && activeDm?.email && activeDm.email.toLowerCase() === me.email.toLowerCase() ? (
                  <div className="text-xs text-white/80 bg-white/5 border border-[color:var(--border)]/60 rounded px-3 py-2">
                    Here&apos;s your personal private chat. Only you can see these messages.
                  </div>
                ) : null}
                {chatLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Lottie animationData={fireAnimation} loop className="w-20 h-20" />
                  </div>
                ) : (
                  active === 'request-a-feature' ? (
                    <FeatureRequestsPanel showForm={false} />
                  ) : active === 'leaderboard' ? (
                    <XpLeaderboard />
                  ) : messages.map((m)=> {
                    const p = (m.userEmail ? presence.find(u => (u.email || '').toLowerCase() === (m.userEmail || '').toLowerCase()) : undefined);
                    const isAdminName = (p?.role || '').toLowerCase() === 'admin';
                    const userCanonicalPlan = canonicalPlan(p?.plan);
                    const isProName = userCanonicalPlan === 'pro';
                    const isUltraName = userCanonicalPlan === 'ultra';
                    const nameColorClass = isAdminName ? 'text-[#ef4444]' : (isUltraName ? 'text-[#8b5cf6]' : (isProName ? 'text-[#ff6a00]' : 'text-white/60'));
                    const decoBase = isAdminName ? 'decoration-[#ef4444]/30 hover:decoration-[#ef4444]/60' : (isUltraName ? 'decoration-[#8b5cf6]/30 hover:decoration-[#8b5cf6]/60' : (isProName ? 'decoration-[#ff6a00]/30 hover:decoration-[#ff6a00]/60' : 'decoration-white/20 hover:decoration-white/60'));
                    const attachments = Array.isArray(m.attachments) ? m.attachments.filter((key) => typeof key === 'string' && key).slice(0, maxAttachments) : [];
                    const displayText = (m.text || '').replace(/\u200B/g, '').trim();
                    const hasText = displayText.length > 0;
                    const hasAttachments = attachments.length > 0;
                    return (
                    <ContextMenu key={m.id || m.tempId}>
                      <ContextMenuTrigger asChild>
                        <div className="text-sm flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {m.userEmail ? (
                              <button
                                  className={`${nameColorClass} mr-1 underline underline-offset-2 ${decoBase} cursor-pointer`}
                                onClick={(e)=>{
                                  e.preventDefault();
                                  e.stopPropagation();
                                  // Left-click should open the same context menu. Dispatch a synthetic contextmenu event.
                                  const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                                  try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                                }}
                              >
                                {m.userName}
                              </button>
                            ) : (
                              <span className="text-white/60 mr-1">{m.userName}</span>
                            )}
                            {hasText ? (
                              <span className={m.status==='pending' ? 'opacity-70' : ''}>
                                <HighlightMentions text={displayText} currentUserEmail={meEmail} />
                              </span>
                            ) : null}
                            {m.status==='failed' ? (
                              <button className="text-xs text-red-400 underline" onClick={()=>sendMessage(m.text, m.tempId)}>Retry</button>
                            ) : null}
                            {m.status==='pending' ? (
                              <svg className="animate-spin size-3 text-white/60" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a 8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
                            ) : null}
                          </div>
                          {hasAttachments ? (
                            <ul className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                              {attachments.map((key) => {
                                const status = attachmentStatusMap[key];
                                const fallbackUrl = `${R2_PUBLIC_BASE}/${key}`;
                                const resolved = messageAttachmentUrls[key] || attachmentPreviewMap[key] || fallbackUrl;
                                const canDirect = attachmentCanLoadDirect[key];
                                const isOptimistic = status === 'pending' || (!m.id && (!messageAttachmentUrls[key] || canDirect));
                                const safeKey = isOptimistic ? `${m.tempId || 'optimistic'}-${key}` : key;
                                return (
                                  <li
                                    key={`${m.id || m.tempId}-${safeKey}`}
                                    className={`relative overflow-hidden rounded border border-[color:var(--border)]/60 ${status ? 'bg-black/40 grayscale opacity-70' : 'bg-black/20'}`}
                                    style={getAspectStyle(key)}
                                  >
                                    <Image
                                      src={resolved}
                                      alt="Attachment"
                                      fill
                                      className="object-contain"
                                      sizes="160px"
                                      loading="lazy"
                                      decoding="async"
                                      onLoadingComplete={(img)=> updateImageDimensions(key, img.naturalWidth, img.naturalHeight)}
                                      onError={async () => {
                                        // Image failed to load - likely expired presigned URL
                                        // Clear cached URL and fetch a fresh one
                                        setAttachmentCanLoadDirect((prev) => {
                                          if (prev[key]) return prev;
                                          return { ...prev, [key]: true };
                                        });
                                        
                                        // Remove expired URL from state
                                        setMessageAttachmentUrls((prev) => {
                                          const next = { ...prev };
                                          delete next[key];
                                          return next;
                                        });
                                        
                                        // Fetch fresh presigned URL with TTL=0 to bypass cache
                                        try {
                                          const { getViewUrl } = await import("@/lib/view-url-client");
                                          const freshUrl = await getViewUrl(key, undefined, 0);
                                          if (freshUrl) {
                                            setMessageAttachmentUrls((prev) => ({ ...prev, [key]: freshUrl }));
                                          }
                                        } catch (err) {
                                          console.error('Failed to refresh attachment URL:', err);
                                        }
                                      }}
                                    />
                                    {status ? (
                                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white/70">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span className="text-[10px] uppercase tracking-wide">Uploading…</span>
                                      </div>
                                    ) : null}
                                    <a
                                      href={resolved || '#'}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="absolute inset-0"
                                      aria-label="Open attachment"
                                    >
                                      <span className="sr-only">Open attachment</span>
                                    </a>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </div>
                      </ContextMenuTrigger>
                      {m.userEmail ? (
                        <UserContextMenu
                          meEmail={me?.email ?? undefined}
                          email={m.userEmail}
                          name={m.userName}
                          activeChannel={active}
                          blocked={blocked}
                          onBlockedChange={setBlocked}
                          isAdmin={me?.role === 'admin'}
                          userRole={p?.role}
                          userPlan={p?.plan}
                          onStartDm={async (email, name) => {
                            setActiveChatType('dm');
                            setActiveDm({ email, name, image: null });
                            setShowroomView('showroom');
                            router.push('/dashboard/showroom');
                            closeChannelsIfMobile();
                            setChatLoading(true);
                        const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                        setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                          ...x,
                          status: 'sent',
                          userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                        })));
                            setChatLoading(false);
                            setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: null }, ...prev]);
                          }}
                        />
                      ) : null}
                    </ContextMenu>
                    );
                  })
                )}
              </div>
              <form className="p-3 border-t border-[color:var(--border)] flex items-start gap-2 w-full min-w-0" onSubmit={async (e)=>{
                e.preventDefault();
                const text = inputRef.current?.value || "";
                if (!text) return;
                if (text.trim().startsWith('/')) { 
                  const handled = await tryHandleSlashCommand(text); 
                  inputRef.current!.value = ""; 
                  handleTextareaResize();
                  setShowEveryoneHint(false);
                  if (handled) return; 
                }
                if (muted?.active) return;
                inputRef.current!.value="";
                handleTextareaResize();
                setShowEveryoneHint(false);
                if (active === 'request-a-feature' || active === 'leaderboard') return; // no chat send in special channels
                await sendMessage(text, undefined, pendingAttachments.map((key) => ({ key, url: attachmentPreviewMap[key] || "" })));
                setPendingAttachments([]);
              }}>
                {active === 'leaderboard' ? (
                  <div className="w-full text-center text-sm text-white/60 py-2">
                    View-only leaderboard. Keep earning XP to climb the ranks!
                  </div>
                ) : active === 'request-a-feature' ? (
                  <div className="w-full">
                    <Collapsible open={featureOpen} onOpenChange={setFeatureOpen}>
                      <div className="flex items-center gap-2 w-full">
                        <CollapsibleTrigger asChild>
                          <button type="button" className="px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-sm border border-[color:var(--border)]/60">
                            {featureOpen ? 'Hide request form' : 'Request a feature'}
                          </button>
                        </CollapsibleTrigger>
                        {!featureOpen ? (
                          <span className="text-xs text-white/60">Pro can post daily; others weekly.</span>
                        ) : null}
                      </div>
                      <CollapsibleContent className="pt-2">
                        <FeatureRequestInlineForm />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 relative">
                      <textarea 
                        ref={inputRef} 
                        className="w-full rounded bg-white/5 px-3 py-2 disabled:opacity-60 resize-none overflow-y-auto" 
                        style={{ fontSize: '16px', minHeight: '2.5rem', height: '2.5rem' }}
                        placeholder={activeChatType==='dm' ? `Message @${activeDm?.name || activeDm?.email || 'self'}` : (me?.role === 'admin' ? `Message #${active} (Use @username or @everyone)` : `Message #${active} (Use @username to mention)`)} 
                        disabled={lockedForMe}
                        rows={1}
                        onInput={(e) => {
                          handleTextareaResize();
                          // Show hint when typing @everyone (admin only)
                          if (me?.role === 'admin' && activeChatType === 'channel') {
                            const text = e.currentTarget.value;
                            setShowEveryoneHint(/@everyone/i.test(text));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                      {showEveryoneHint && me?.role === 'admin' && activeChatType === 'channel' && (
                        <div className="absolute bottom-full left-0 mb-1 px-2 py-1 text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded">
                          📢 @everyone will notify all users
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="flex-shrink-0 inline-flex items-center justify-center px-3 py-2 h-10 rounded bg-white/5 hover:bg-white/10 text-sm"
                      onClick={()=> setAttachmentModalOpen(true)}
                      title="Add images"
                      aria-label="Add images"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </button>
                    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                      <PopoverTrigger asChild>
                        <button type="button" className="hidden md:inline-flex items-center justify-center px-3 py-2 h-10 rounded bg-white/5 hover:bg-white/10 text-sm" title="Insert emoji" aria-label="Insert emoji">
                          😊
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" sideOffset={8} className="p-2 w-72 max-h-[20rem] overflow-y-auto">
                        <div className="grid grid-cols-8 gap-2">
                          {[
                            // Smileys & emotion
                            "😀","😁","😂","🤣","😊","😇","🙂","😉",
                            "🥰","😍","😘","😗","😙","😚","😋","😛",
                            "😜","🤪","😝","🫠","🤗","🤩","🤔","🫨",
                            "🤨","😐","😑","😶","🙄","😏","😣","😥",
                            "😮","🤐","😯","😪","😫","🥱","😴","😌",
                            "😤","😮‍💨","😓","😢","😭","😡","🤬","🥵",
                            "🥶","🤮","🤢","🤧","😷","🤕","🤒","🤥",
                            "🤯","🤠","😎","🥳","🥺","🫠","🫨","🫥",
                            // People & gestures
                            "👍","👎","👏","🙌","🙏","🤝","🤞","✌️",
                            "🤘","🤙","💪","🫶","👉","👈","👆","👇",
                            "🫵","👋","✋","🖐️","🤚","✍️","🤌","🫰",
                            "🫳","🫴","👀","🫡","🤝","🤲","🙇","💁",
                            // Hearts & symbols
                            "❤️","🧡","💛","💚","💙","💜","🖤","🤍",
                            "🤎","💖","💗","💓","💞","💕","💘","💝",
                            "✨","🎉","🎊","🎁","🥇","⭐️","🌟","⚡️",
                            "✅","❌","❓","❗","⭕","🔴","🟢","🔵",
                            "🟡","🟣","🟤","⚪","⚫","🟥","🟧","🟨",
                            // Fun/memes
                            "💯","🗿","💀","☠️","🤡","🧠","🧩","🛠️",
                            "🔥","🚀","🧨","🎯","🪄","🌀","💡","📎",
                            // Animals & food (a few)
                            "🐶","🐱","🦊","🐼","🦄","🍕","🍔","☕️",
                            // Weather & celestial
                            "☀️","🌙","☁️","🌧️","🌈","❄️","🌊","🌋",
                            // Flags
                            ...flagEmojis
                          ].map((e, i)=> (
                            <button key={`${e}-${i}`} type="button" className="text-xl leading-none rounded hover:bg-white/10 p-1" onClick={()=>{ insertEmoji(e); setEmojiOpen(false); }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <button type="submit" className="flex-shrink-0 px-3 py-2 h-10 rounded bg-primary text-black text-sm disabled:opacity-60" disabled={!!muted?.active || lockedForMe}>Send</button>
                  </>
                )}
              </form>
            </>
          )}
          {showroomView === 'forge' && (
            <div className="p-3 flex-1 flex min-h-0 overflow-hidden">
              <div className="w-full h-full min-h-0">
                {forgeTab === 'workspace' ? <DashboardWorkspacePanel /> : <ContentTabs />}
              </div>
            </div>
          )}
          {showroomView === 'livestream' && (
            <div className="p-3 flex-1 flex min-h-0 overflow-hidden">
              <div className="w-full h-full min-h-0">
                <LivestreamPanel />
              </div>
            </div>
          )}
        </section>
        {showMembers && showroomView === 'showroom' && activeChatType === 'channel' ? (
          <aside className="h-full min-h-0 border-l border-[color:var(--border)] overflow-y-auto p-3 bg-[var(--popover)] space-y-3 md:static absolute inset-0 z-40">
            {/* Header row: left chevron, right-aligned Online count */}
            <div className="flex items-center gap-2">
              <button className="md:hidden inline-flex items-center justify-center rounded-full border border-[color:var(--border)]/60 bg-white/5 hover:bg-white/10 size-7" onClick={() => setShowMembers(false)} aria-label="Hide members">
                <Chevron direction="left" className="h-4 w-4" />
              </button>
              <div className="ml-auto text-sm font-semibold text-right w-full">Online <span className="text-white/50">({onlineUsers.length})</span></div>
            </div>
            <ul className="space-y-1 text-sm">
              {chatLoading ? (
                <li className="animate-pulse">
                  <div className="h-4 w-full bg-white/10 rounded" />
                </li>
              ) : (
                <>
                  {onlineAdmins.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#ef4444]">Admins</li>
                  ) : null}
                  {onlineAdmins.map((u) => (
                  <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                          e.preventDefault();
                          e.stopPropagation();
                          const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                          try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className={`size-2 rounded-full ${u.status==='dnd' ? 'bg-red-400' : u.status==='idle' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                            <span className={`truncate text-right text-[#ef4444]`}>{u.name}</span>
                          <Avatar className="size-5">
                            <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                            <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                          </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                        <UserContextMenu
                          meEmail={me?.email ?? undefined}
                          email={u.email}
                          name={u.name}
                          activeChannel={active}
                          blocked={blocked}
                          onBlockedChange={setBlocked}
                          isAdmin={me?.role === 'admin'}
                          userRole={u.role}
                          userPlan={u.plan}
                          onStartDm={async (email, name) => {
                          setActiveChatType('dm');
                            setActiveDm({ email, name, image: u.image ?? null });
                          setShowroomView('showroom');
                          router.push('/dashboard/showroom');
                          closeChannelsIfMobile();
                          setChatLoading(true);
                            const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                            setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                              ...x,
                              status: 'sent',
                              userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                            })));
                          setChatLoading(false);
                            setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                          }}
                        />
                      ) : null}
                    </ContextMenu>
                  </li>
                  ))}
                  {onlineUltras.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#8b5cf6]">Ultra</li>
                  ) : null}
                  {onlineUltras.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className={`size-2 rounded-full ${u.status==='dnd' ? 'bg-red-400' : u.status==='idle' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                            <span className={`truncate text-right text-[#8b5cf6]`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email ?? undefined}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                              setActiveDm({ email, name, image: u.image ?? null });
                              setShowroomView('showroom');
                              router.push('/dashboard/showroom');
                              closeChannelsIfMobile();
                              setChatLoading(true);
                            const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                            setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                              ...x,
                              status: 'sent',
                              userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                            })));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                          ) : null}
                      </ContextMenu>
                    </li>
                  ))}
                  {onlinePros.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#ff6a00]">Pro</li>
                  ) : null}
                  {onlinePros.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className={`size-2 rounded-full ${u.status==='dnd' ? 'bg-red-400' : u.status==='idle' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                            <span className={`truncate text-right text-[#ff6a00]`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email ?? undefined}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                              setActiveDm({ email, name, image: u.image ?? null });
                              setShowroomView('showroom');
                              router.push('/dashboard/showroom');
                              closeChannelsIfMobile();
                              setChatLoading(true);
                            const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                            setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                              ...x,
                              status: 'sent',
                              userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                            })));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                          ) : null}
                      </ContextMenu>
                    </li>
                  ))}
                  {onlineBase.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-white/60">Members</li>
                          ) : null}
                  {onlineBase.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                          }}>
                            <span className={`size-2 rounded-full ${u.status==='dnd' ? 'bg-red-400' : u.status==='idle' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                            <span className={`truncate text-right`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                          </button>
                        </ContextMenuTrigger>
                        {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email ?? undefined}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                              setActiveDm({ email, name, image: u.image ?? null });
                              setShowroomView('showroom');
                              router.push('/dashboard/showroom');
                              setChatLoading(true);
                            const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                            setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                              ...x,
                              status: 'sent',
                              userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                            })));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image ?? null }, ...prev]);
                            }}
                          />
                      ) : null}
                    </ContextMenu>
                  </li>
                  ))}
                </>
              )}
              {!chatLoading && onlineUsers.length === 0 ? <li className="text-white/50">No one here yet</li> : null}
            </ul>
            <div className="text-sm font-semibold pt-2 text-right">Offline</div>
            <ul className="space-y-1 text-sm text-white/60">
              {chatLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="animate-pulse">
                    <div className="h-4 w-full bg-white/10 rounded" />
                  </li>
                ))
              ) : (
                <>
                  {offlineAdmins.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#ef4444]">Admins</li>
                  ) : null}
                  {offlineAdmins.map((u) => (
                  <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                          e.preventDefault();
                          e.stopPropagation();
                          const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                          try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className="size-2 rounded-full bg-white/30"></span>
                            <span className={`truncate text-right text-[#ef4444]`}>{u.name}</span>
                          <Avatar className="size-5">
                            <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                            <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                          </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                        <UserContextMenu
                          meEmail={me?.email ?? undefined}
                          email={u.email}
                          name={u.name}
                          activeChannel={active}
                          blocked={blocked}
                          onBlockedChange={setBlocked}
                          isAdmin={me?.role === 'admin'}
                          userRole={u.role}
                          userPlan={u.plan}
                          onStartDm={async (email, name) => {
                          setActiveChatType('dm');
                            setActiveDm({ email, name, image: u.image ?? null });
                          setShowroomView('showroom');
                          router.push('/dashboard/showroom');
                          closeChannelsIfMobile();
                          setChatLoading(true);
                            const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                            setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                              ...x,
                              status: 'sent',
                              userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                            })));
                          setChatLoading(false);
                            setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                          }}
                        />
                      ) : null}
                    </ContextMenu>
                  </li>
                  ))}
                  {offlineUltras.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#8b5cf6]">Ultra</li>
                  ) : null}
                  {offlineUltras.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className="size-2 rounded-full bg-white/30"></span>
                            <span className={`truncate text-right text-[#8b5cf6]`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email ?? undefined}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                            setActiveDm({ email, name, image: u.image ?? null });
                              setShowroomView('showroom');
                              router.push('/dashboard/showroom');
                              setChatLoading(true);
                              const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                              setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                                ...x,
                                status: 'sent',
                                userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                              })));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                          ) : null}
                      </ContextMenu>
                    </li>
                  ))}
                  {offlinePros.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-[#ff6a00]">Pro</li>
                  ) : null}
                  {offlinePros.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                        }}>
                          <span className="size-2 rounded-full bg-white/30"></span>
                            <span className={`truncate text-right text-[#ff6a00]`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                        </button>
                      </ContextMenuTrigger>
                      {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email ?? undefined}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                            setActiveDm({ email, name, image: u.image ?? null });
                              setShowroomView('showroom');
                              router.push('/dashboard/showroom');
                              setChatLoading(true);
                              const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                              setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                                ...x,
                                status: 'sent',
                                userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                              })));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                          ) : null}
                      </ContextMenu>
                    </li>
                  ))}
                  {offlineBase.length ? (
                    <li className="text-xs px-1 pt-1 text-right text-white/60">Members</li>
                          ) : null}
                  {offlineBase.map((u) => (
                    <li key={`${u.email || u.name}`} className="flex items-center gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button className="flex items-center gap-2 justify-end w-full text-right rounded px-1 py-0.5 hover:bg-white/5" onClick={(e)=>{
                            e.preventDefault();
                            e.stopPropagation();
                            const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY });
                            try { (e.currentTarget as HTMLElement).dispatchEvent(ev); } catch {}
                          }}>
                            <span className="size-2 rounded-full bg-white/30"></span>
                            <span className={`truncate text-right`}>{u.name}</span>
                            <Avatar className="size-5">
                              <AvatarImage src={u.image || undefined} alt={u.name || u.email} loading="lazy" decoding="async" />
                              <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-3" /></AvatarFallback>
                            </Avatar>
                          </button>
                        </ContextMenuTrigger>
                        {u.email ? (
                          <UserContextMenu
                            meEmail={me?.email ?? undefined}
                            email={u.email}
                            name={u.name}
                            activeChannel={active}
                            blocked={blocked}
                            onBlockedChange={setBlocked}
                            isAdmin={me?.role === 'admin'}
                            userRole={u.role}
                            userPlan={u.plan}
                            onStartDm={async (email, name) => {
                              setActiveChatType('dm');
                            setActiveDm({ email, name, image: u.image ?? null });
                              setShowroomView('showroom');
                              router.push('/dashboard/showroom');
                              setChatLoading(true);
                              const dmMessagesResponse = await fetch(`/api/chat/dm/messages?user=${encodeURIComponent(email)}`).then(r=>r.json()) as { messages?: { id?: string; text: string; userName: string; userEmail?: string | null; created_at?: string; attachments?: string[] }[] };
                              setMessages((dmMessagesResponse.messages||[]).map((x)=>({
                                ...x,
                                status: 'sent',
                                userEmail: typeof x.userEmail === 'string' ? x.userEmail : undefined,
                              })));
                              setChatLoading(false);
                              setDmConversations(prev => prev.some(c => c.email === email) ? prev : [{ email, name, image: u.image }, ...prev]);
                            }}
                          />
                      ) : null}
                    </ContextMenu>
                  </li>
                  ))}
                </>
              )}
            </ul>
          </aside>
        ) : null}
        <Dialog open={attachmentModalOpen} onOpenChange={(open)=> { if (!open) { setAttachmentModalOpen(false); setAttachmentError(null); } }}>
          <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Add images</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
              {attachmentError ? (
                <div key={attachmentErrorShakeKey} className="rounded border border-red-500/40 bg-red-500/10 text-red-200 px-3 py-2 text-sm animate-attachment-error-shake">
                  {attachmentError}
                </div>
              ) : null}
              <Tabs value={selectedAttachmentTab} onValueChange={(v)=>{
                const next = (v === 'library') ? 'library' : 'upload';
                setSelectedAttachmentTab(next);
                if (next === 'library') void fetchLibraryPhotos();
              }} className="w-full flex flex-col flex-1 min-h-0">
                <TabsList className="inline-flex rounded-lg border border-[color:var(--border)]/60 bg-white/5 p-0.5 flex-shrink-0">
                  <TabsTrigger value="upload" className="px-4 py-2 text-sm data-[state=active]:bg-[rgba(255,255,255,0.12)] data-[state=active]:text-white">Upload</TabsTrigger>
                  <TabsTrigger value="library" className="px-4 py-2 text-sm data-[state=active]:bg-[rgba(255,255,255,0.12)] data-[state=active]:text-white">Browse Library</TabsTrigger>
                </TabsList>
                <div className="mt-4 space-y-4 flex-1 min-h-0 overflow-y-auto pb-4">

                  <TabsContent value="upload" className="space-y-3">
                    <DropZone
                      accept="image/*"
                      disabled={uploadingAttachments || pendingAttachments.length >= maxAttachments}
                      onDrop={async (files)=>{
                        const incoming = Array.from(files);
                        const oversized = incoming.filter((file) => file.size > MAX_UPLOAD_BYTES);
                        if (oversized.length) {
                          const limitLabel = `${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB`;
                          const names = oversized.map((file) => file.name).filter(Boolean).join(', ');
                          const errorMessage = names ? `File exceeds the ${limitLabel} limit: ${names}` : `File exceeds the ${limitLabel} limit.`;
                          toast.error(errorMessage);
                          setAttachmentError(errorMessage);
                          setAttachmentErrorShakeKey((prev) => prev + 1);
                        }
                        const eligible = incoming.filter((file) => file.size <= MAX_UPLOAD_BYTES);
                        if (!eligible.length) return;
                        const compressed = await Promise.all(eligible.map((file) => compressImage(file)));
                        let uploadedKeys: string[] = [];
                        try {
          setUploadingAttachments(true);
                          const uploaded = await uploadFilesToChat({
                            files: compressed,
                            channel: activeChatType === 'channel' ? active : undefined,
                            dmEmail: activeChatType === 'dm' ? activeDm?.email : undefined,
                          });
                          uploadedKeys = uploaded.map((item) => item.key).filter(Boolean) as string[];
                          if (!uploadedKeys.length) return;
                          markAttachmentsStatus(uploadedKeys, 'uploading');
                          setSessionUploadKeys((prev) => {
                            const merged = new Set(prev);
                            uploadedKeys.forEach((k) => merged.add(k));
                            return Array.from(merged);
                          });
                          clearAttachmentStatus(uploadedKeys);
                          const urls = await getViewUrls(uploadedKeys);
                          const map: Record<string, string> = {};
                          for (const key of uploadedKeys) {
                            const fallbackUrl = uploaded.find((item) => item.key === key)?.url || `${R2_PUBLIC_BASE}/${key}`;
                            map[key] = urls[key] || fallbackUrl;
                          }
                          setAttachmentPreviewMap((prev) => ({ ...prev, ...map }));
                          setMessageAttachmentUrls((prev) => ({ ...prev, ...map }));
                          setPendingAttachments((prev) => {
                            const merged = [...prev];
                            for (const key of uploadedKeys) {
                              if (!merged.includes(key)) merged.push(key);
                            }
                            return merged.slice(0, maxAttachments);
                          });
                        } catch (err) {
                          const message = err instanceof Error ? err.message : 'Failed to upload images';
                          setAttachmentError(message);
                          if (uploadedKeys.length) {
                            markAttachmentsStatus(uploadedKeys, 'pending');
                          }
                        } finally {
                          setUploadingAttachments(false);
                        }
                      }}
                      className="w-full"
                    >
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-white/70">
                        <UploadCloud className="h-6 w-6" />
                        <span>Drop images here or click to browse</span>
                        <span className="text-xs text-white/50">Up to {maxAttachments} images</span>
                      </div>
                    </DropZone>
                    {sessionUploadKeys.length ? (
                      <div className="space-y-2">
                        <div className="text-xs text-white/70">Uploaded this session</div>
                        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {sessionUploadKeys.map((key) => {
                            const url = attachmentPreviewMap[key] || messageAttachmentUrls[key] || `${R2_PUBLIC_BASE}/${key}`;
                            const selected = pendingAttachments.includes(key);
                            const status = attachmentStatusMap[key];
                            return (
                              <li key={key}>
                                <button
                                  type="button"
                                  className={`relative block w-full overflow-hidden rounded transition ${selected ? 'ring-2 ring-emerald-400/50 ring-offset-2 ring-offset-[color:var(--card)]' : ''}`}
                                  style={getAspectStyle(key)}
                                  onClick={()=>{
                                    setPendingAttachments((prev) => prev.includes(key) ? prev.filter((existing) => existing !== key) : [...prev, key]);
                                    if (!attachmentPreviewMap[key]) {
                                      setAttachmentPreviewMap((prev) => ({ ...prev, [key]: url }));
                                    }
                                    markAttachmentsStatus([key], 'pending');
                                  }}
                                >
                                  {url ? (
                                    <Image
                                      src={url}
                                      alt="Uploaded preview"
                                      fill
                                      className="object-contain"
                                      sizes={SESSION_PREVIEW_SIZES}
                                      onLoadingComplete={(img)=> updateImageDimensions(key, img.naturalWidth, img.naturalHeight)}
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-white/50">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    </div>
                                  )}
                          <span className={`absolute left-2 top-2 z-10 inline-flex items-center justify-center rounded bg-black/70 p-1 transition-colors ${selected ? 'text-emerald-300' : (pendingAttachments.length >= maxAttachments ? 'text-white/50' : 'text-white/70')}`}>
                            {selected ? <SquareCheckBig className="h-4 w-4" /> : (pendingAttachments.length >= maxAttachments ? <SquareSlash className="h-4 w-4" /> : <SquarePlus className="h-4 w-4" />)}
                                  </span>
                                  {status === 'uploading' ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white/70">
                                      <Loader2 className="h-5 w-5 animate-spin" />
                                      <span className="text-[10px] uppercase tracking-wide">Uploading…</span>
                                    </div>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="library" className="space-y-3">
                    {libraryLoading ? (
                      <div className="text-xs text-white/60">Loading library…</div>
                    ) : libraryItems.length ? (
                      <ul className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3.5">
                    {libraryItems.map(({ key, blurhash }) => {
                      const baseUrl = libraryItems.find((item) => item.key === key)?.url || (`https://r2.carcloutcdn.com/${key}`);
                      const url = attachmentPreviewMap[key] || baseUrl;
                      const selected = pendingAttachments.includes(key);
                      const status = attachmentStatusMap[key];
                      const atCapacity = pendingAttachments.length >= maxAttachments && !selected;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            className={`relative block w-full overflow-hidden rounded transition ${atCapacity ? 'cursor-not-allowed opacity-60' : 'hover:bg-white/5'} ${selected ? 'ring-2 ring-emerald-400/50 ring-offset-2 ring-offset-[color:var(--card)]' : ''}`}
                            style={getAspectStyle(key)}
                            onClick={()=>{
                              if (atCapacity) return;
                              setPendingAttachments((prev) => prev.includes(key) ? prev.filter((existing) => existing !== key) : [...prev, key]);
                              setAttachmentPreviewMap((prev) => ({ ...prev, [key]: baseUrl }));
                              markAttachmentsStatus([key], 'pending');
                              setSessionUploadKeys((prev)=> prev.filter((existing)=> existing !== key));
                            }}
                            disabled={atCapacity}
                          >
                            {url ? (
                              blurhash ? (
                                <BlurhashImage
                                  src={url}
                                  alt="Library"
                                  fill
                                  className="object-contain"
                                  sizes={LIBRARY_PREVIEW_SIZES}
                                  blurhash={blurhash}
                                  onLoad={(e)=> {
                                    const img = e.currentTarget;
                                    updateImageDimensions(key, img.naturalWidth, img.naturalHeight);
                                  }}
                                />
                              ) : (
                                <Image
                                  src={url}
                                  alt="Library"
                                  fill
                                  className="object-contain"
                                  sizes={LIBRARY_PREVIEW_SIZES}
                                  onLoadingComplete={(img)=> updateImageDimensions(key, img.naturalWidth, img.naturalHeight)}
                                />
                              )
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-white/50">No preview</div>
                            )}
                            <span
                              className={`absolute left-2 top-2 z-10 inline-flex items-center justify-center rounded bg-black/70 p-1 transition-colors ${selected ? 'text-emerald-300' : 'text-white/70'}`}
                            >
                              {selected ? <SquareCheckBig className="h-4 w-4" /> : <SquarePlus className="h-4 w-4" />}
                            </span>
                            {status === 'uploading' ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white/70">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-[10px] uppercase tracking-wide">Uploading…</span>
                              </div>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                      </ul>
                    ) : (
                      <div className="text-xs text-white/60 border border-dashed border-[color:var(--border)]/60 rounded p-4 text-center">No images found in your library.</div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
            {/* Sticky bottom send button */}
            <div className="flex-shrink-0 border-t border-[color:var(--border)]/60 pt-3 mt-auto bg-[var(--popover)] space-y-2">
              <div className="flex items-center justify-between w-full">
                <div className="text-xs text-white/60">{pendingAttachments.length}/{maxAttachments} selected</div>
              </div>
              <Button
                type="button"
                size="lg"
                disabled={!pendingAttachments.length || pendingAttachments.some((key) => attachmentStatusMap[key] === 'uploading')}
                onClick={()=> { void handleSendAttachments(); }}
                className="w-full"
              >
                Send
              </Button>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}

function UserContextMenu({ meEmail, email, name, activeChannel, blocked, onBlockedChange, isAdmin, onStartDm, userRole, userPlan }: { meEmail?: string; email: string; name: string; activeChannel: string; blocked: string[]; onBlockedChange: React.Dispatch<React.SetStateAction<string[]>>; isAdmin?: boolean; onStartDm?: (email: string, name: string) => Promise<void> | void; userRole?: string; userPlan?: string }) {
  const [profile, setProfile] = useState<{ name?: string; image?: string; vehicles?: Array<{ make?: string; model?: string }>; photos?: string[]; bio?: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string,string>>({});
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const requestedPhotoKeysRef = useRef<Set<string>>(new Set());
  const isSelf = (meEmail || '').toLowerCase() === (email || '').toLowerCase();
  const isAdminUser = (userRole || '').toLowerCase() === 'admin';
  const userCanonicalPlan = (() => { const s = (userPlan || '').toLowerCase(); if (s === 'ultra') return 'ultra'; if (s === 'pro' || s === 'premium') return 'pro'; if (s === 'base' || s === 'basic' || s === 'minimum') return 'minimum'; return null; })();
  const isProUser = userCanonicalPlan === 'pro';
  const isUltraUser = userCanonicalPlan === 'ultra';
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Use window-scoped cache if available
        let res: ChatProfile | null | undefined = undefined;
        try {
          if (typeof window !== 'undefined') {
            const cached = window.carcloutProfileCache?.[email.toLowerCase()];
            if (cached && typeof cached === 'object') {
              res = cached as ChatProfile;
            }
          }
        } catch {}
        if (!res) {
          const fetched = await fetch(`/api/users/chat-profile?email=${encodeURIComponent(email)}`, { cache: 'no-store' }).then(r=>r.json()).catch(() => null);
          if (fetched && typeof fetched === 'object') res = fetched as ChatProfile;
        }
        if (!cancelled) {
          requestedPhotoKeysRef.current = new Set();
          setPreviews({});
          setPhotosLoading(false);
          setProfile(res || null);
        }
      } catch {}
      finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => { cancelled = true; };
  }, [email]);
  useEffect(() => {
    const keys = Array.isArray(profile?.photos) ? profile.photos.slice(0, 6).filter(Boolean) : [];
    if (!keys.length) {
      setPhotosLoading(false);
      return;
    }
    const missing = keys.filter((k) => k && !previews[k] && !requestedPhotoKeysRef.current.has(k));
    if (!missing.length) return;
    let cancelled = false;
    setPhotosLoading(true);
    missing.forEach((k) => requestedPhotoKeysRef.current.add(k));
    (async () => {
      try {
        const { getViewUrls } = await import("@/lib/view-url-client");
        const urls = await getViewUrls(missing);
        if (!cancelled) {
          setPreviews((prev) => ({ ...prev, ...urls }));
        }
      } catch {}
      finally {
        if (!cancelled) {
          setPhotosLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.photos, previews]);
  return (
    <ContextMenuContent className="w-72">
      <div className="flex items-center gap-3 px-2 py-1.5">
        <Avatar className="size-8">
          <AvatarImage src={profile?.image} alt={profile?.name || name} />
          <AvatarFallback className="bg-[color:var(--primary)]/15 text-[color:var(--primary)]"><CarFront className="size-5" /></AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`text-sm font-medium truncate ${isAdminUser ? 'text-[#ef4444]' : (isUltraUser ? 'text-[#8b5cf6]' : (isProUser ? 'text-[#ff6a00]' : ''))}`}>{profile?.name || name}</div>
            {isAdminUser ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[#ef4444]/30">Admin</span>
            ) : null}
            {!isAdminUser && isUltraUser ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(139,92,246,0.12)] text-[#8b5cf6] border border-[#8b5cf6]/30">Ultra</span>
            ) : null}
            {!isAdminUser && !isUltraUser && isProUser ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[rgba(255,106,0,0.12)] text-[#ff6a00] border border-[#ff6a00]/30">Pro</span>
            ) : null}
          </div>
          {isSelf ? <div className="text-[10px] text-white/60">This is how others see your chat profile</div> : null}
        </div>
        
      </div>
      {typeof profile?.bio === 'string' && profile.bio.trim() ? (
        <div className="px-2 pb-1 text-xs text-white/80 whitespace-pre-wrap">{profile.bio}</div>
      ) : null}
      <div className="px-2 pb-1 flex items-center gap-2">
        <button
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 border border-[color:var(--border)]/60 cursor-pointer"
          onClick={()=> onStartDm?.(email, profile?.name || name)}
        >
          {isSelf ? 'Open your private chat' : `Message @${profile?.name || name}`}
          </button>
        {(profile?.name || name) ? (
          <button
            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 border border-[color:var(--border)]/60 cursor-pointer"
            onClick={()=>{
              const handle = String(profile?.name || name || '').replace(/^@+/, '');
              if (!handle) return;
              window.open(`https://instagram.com/${encodeURIComponent(handle)}`, '_blank', 'noopener,noreferrer');
            }}
            title="Open Instagram"
            aria-label="Open Instagram"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM18 6.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z" />
            </svg>
          </button>
      ) : null}
      {isSelf ? (
        <button
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 border border-[color:var(--border)]/60 cursor-pointer"
          onClick={()=>{ try { window.dispatchEvent(new CustomEvent('open-profile')); } catch {} }}
          title="Edit profile"
          aria-label="Edit profile"
        >
          <SquarePen className="size-3.5" />
        </button>
      ) : null}
      </div>
      {loadingProfile ? (
        <div className="px-2 py-1">
          <div className="text-xs text-white/60 mb-1">Vehicles</div>
          <div className="flex flex-wrap gap-1 text-xs">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
      ) : Array.isArray(profile?.vehicles) && profile!.vehicles!.length > 0 ? (
        <div className="px-2 py-1">
          <div className="text-xs text-white/60 mb-1">Vehicles</div>
          <div className="flex flex-wrap gap-1 text-xs">
            {profile!.vehicles!.slice(0,6).map((v: { make?: string; model?: string }, i: number) => (
              <span key={i} className="px-2 py-0.5 rounded bg-white/5 border border-[color:var(--border)]/60">{v.make} {v.model}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="px-2 py-1">
        <div className="text-xs text-white/60 mb-1">Photos</div>
        {photosLoading ? (
          <ul className="grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="aspect-square rounded overflow-hidden bg-black/20">
                <Skeleton className="w-full h-full" />
              </li>
            ))}
          </ul>
        ) : Array.isArray(profile?.photos) && profile!.photos!.length > 0 ? (
          <ul className="grid grid-cols-3 gap-1">
            {profile!.photos!.slice(0,6).map((k: string) => (
              <li key={k} className="relative aspect-square rounded overflow-hidden bg-black/20">
                {!previews[k] && (
                  <Skeleton className="absolute inset-0" />
                )}
                {previews[k] ? (
                  <Image src={previews[k]} alt="Car" fill className="object-cover" sizes={PROFILE_PREVIEW_SIZES} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-white/50">No photos yet.</div>
        )}
      </div>
      <ContextMenuSeparator />
      {isAdmin && meEmail && meEmail.toLowerCase() !== email.toLowerCase() ? (
        <>
          <ContextMenuItem onClick={async()=>{ const ok = await confirmToast({ title: `Mute ${name} globally?` }); if(!ok) return; try{ await fetch('/api/admin/mutes',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email })}); toast.success('Muted'); } catch {} }}>Mute globally</ContextMenuItem>
          <ContextMenuItem onClick={async()=>{ const ok = await confirmToast({ title: `Mute ${name} in #${activeChannel}?` }); if(!ok) return; try{ await fetch('/api/admin/mutes',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email, channels: [activeChannel] })}); toast.success('Muted'); } catch {} }}>Mute in #{activeChannel}</ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      {meEmail && meEmail.toLowerCase() !== email.toLowerCase() ? (
        blocked.includes(email) ? (
          <ContextMenuItem onClick={async()=>{ try{ await fetch('/api/blocks',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email })}); onBlockedChange(prev=>prev.filter(e=>e!==email)); } catch {} }}>Unblock</ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={async()=>{ try{ await fetch('/api/blocks',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ targetEmail: email })}); onBlockedChange(prev=>[...prev, email]); } catch {} }}>Block</ContextMenuItem>
        )
      ) : null}
    </ContextMenuContent>
  );
}



export default function DashboardShowroomPage() {
  return (
    <Suspense fallback={<div className="w-full h-full" />}> 
      <DashboardShowroomPageInner />
    </Suspense>
  );
}
