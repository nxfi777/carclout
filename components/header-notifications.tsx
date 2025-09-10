"use client";

import { useMemo, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAnnouncementNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export default function HeaderNotifications() {
  const {
    dnd,
    permission,
    enableNotifications,
    missed,
    missedCount,
    latest,
    markAllRead,
  } = useAnnouncementNotifications(30000);

  const [open, setOpen] = useState(false);

  const icon = useMemo(() => {
    if (missedCount > 0) return <BellRing className="h-[1.1rem] w-[1.1rem]" />;
    return <Bell className="h-[1.1rem] w-[1.1rem]" />;
  }, [missedCount]);

  const showEnableButton = permission !== "unsupported" && permission === "default";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={missedCount > 0 ? `${missedCount} notifications` : "Notifications"}
          title={missedCount > 0 ? `${missedCount} notifications` : "Notifications"}
          className="relative h-[2.2rem] w-[2.2rem] border-[color:var(--border)] bg-[color:var(--popover)]/70"
        >
          {icon}
          {missedCount > 0 ? (
            <span className="absolute -top-[0.35rem] -right-[0.35rem] rounded-full bg-red-500 text-white text-[0.65rem] leading-none px-[0.45em] py-[0.35em] shadow">
              {missedCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className="w-[92vw] max-w-[22rem] p-[0.9rem] max-h-[85vh]"
        style={{ width: "min(92vw, 352px)" }}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Notifications</div>
          {dnd ? (
            <Badge variant="secondary" className="bg-amber-500/20">DND</Badge>
          ) : null}
        </div>

        {showEnableButton ? (
          <div className="mt-[0.8rem]">
            <Button size="sm" onClick={enableNotifications} className="h-[2.1rem]">
              Enable browser notifications
            </Button>
          </div>
        ) : null}

        <div className="mt-[0.9rem] space-y-[0.6rem] max-h-[18rem] overflow-auto pr-[0.2rem]">
          {(missedCount > 0 ? missed : latest).map((a) => (
            <div key={a.id || a.title} className="rounded border border-[color:var(--border)] bg-white/5 p-[0.7rem]">
              <div className="flex items-center justify-between gap-[0.6rem]">
                <div className="text-sm font-medium line-clamp-1">{a.title}</div>
                {a.level ? (
                  <Badge variant="secondary" className={cn("text-[0.7rem]", a.level === "warning" ? "bg-amber-500/20" : a.level === "update" ? "bg-blue-500/20" : "bg-white/10")}>{a.level}</Badge>
                ) : null}
              </div>
              {a.content ? (
                <div className="text-xs text-white/80 mt-[0.35rem] line-clamp-3 whitespace-pre-wrap">{a.content}</div>
              ) : null}
            </div>
          ))}
          {missedCount === 0 && latest.length === 0 ? (
            <div className="text-sm text-white/70">No announcements yet.</div>
          ) : null}
        </div>

        <div className="mt-[0.9rem] flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={() => { markAllRead(); }} className="h-[2rem]">
            Mark all read
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}


