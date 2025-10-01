import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export function showXpBonusToast(amount: number, reason: string, multiplier?: number) {
  const displayAmount = multiplier && multiplier > 1 ? `+${amount} XP (${multiplier}× streak!)` : `+${amount} XP`;
  
  toast(
    <div className="flex items-center gap-3 w-full">
      <div className="flex items-center justify-center size-10 rounded-full bg-gradient-to-br from-yellow-500/20 via-orange-500/20 to-red-500/20 border border-yellow-500/30">
        <Sparkles className="size-5 text-yellow-500 animate-pulse" />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-white text-base">{displayAmount}</div>
        <div className="text-sm text-white/70">{reason}</div>
      </div>
    </div>,
    {
      duration: 4000,
      className: "bg-gradient-to-br from-[color:var(--primary)]/10 via-transparent to-transparent border border-[color:var(--primary)]/30",
    }
  );
}

export function showStreakMultiplierToast(streak: number) {
  toast(
    <div className="flex items-center gap-3 w-full">
      <div className="flex items-center justify-center size-10 rounded-full bg-gradient-to-br from-orange-500/20 via-red-500/20 to-pink-500/20 border border-orange-500/30">
        <span className="text-2xl">🔥</span>
      </div>
      <div className="flex-1">
        <div className="font-semibold text-white text-base">2× XP Active!</div>
        <div className="text-sm text-white/70">{streak}-day streak bonus</div>
      </div>
    </div>,
    {
      duration: 4000,
      className: "bg-gradient-to-br from-orange-500/10 via-transparent to-transparent border border-orange-500/30",
    }
  );
}

export function showFirstPostToast(amount: number) {
  toast(
    <div className="flex items-center gap-3 w-full">
      <div className="flex items-center justify-center size-12 rounded-full bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 border-2 border-emerald-500/40 animate-pulse">
        <span className="text-3xl">🎉</span>
      </div>
      <div className="flex-1">
        <div className="font-bold text-white text-lg">First Post Bonus!</div>
        <div className="font-semibold text-emerald-400 text-base">+{amount} XP</div>
        <div className="text-sm text-white/70">Welcome to the Showroom</div>
      </div>
    </div>,
    {
      duration: 5000,
      className: "bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/20",
    }
  );
}

