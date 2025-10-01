"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal, Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type LeaderboardEntry = {
  rank: number;
  name: string;
  email?: string;
  xp: number;
  level: number;
  isMe: boolean;
};

export default function XpLeaderboard() {
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);

  useEffect(() => {
    async function loadLeaderboard() {
      setLoading(true);
      try {
        const res = await fetch("/api/xp/leaderboard", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setLeaderboard(data.leaderboard || []);
          setMyRank(data.myRank || null);
        }
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();

    // Refresh on XP changes
    const handleRefresh = () => loadLeaderboard();
    window.addEventListener("xp-refresh", handleRefresh);

    return () => {
      window.removeEventListener("xp-refresh", handleRefresh);
    };
  }, []);

  function getRankIcon(rank: number) {
    if (rank === 1) return <Trophy className="size-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="size-5 text-gray-400" />;
    if (rank === 3) return <Award className="size-5 text-amber-600" />;
    return null;
  }

  function getRankBadge(rank: number) {
    if (rank === 1) return "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/40";
    if (rank === 2) return "bg-gradient-to-br from-gray-400/20 to-gray-500/20 border-gray-400/40";
    if (rank === 3) return "bg-gradient-to-br from-amber-600/20 to-amber-700/20 border-amber-600/40";
    return "bg-[color:var(--card)] border-[color:var(--border)]";
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="size-5 text-[color:var(--primary)]" />
          <h2 className="text-lg font-semibold">XP Leaderboard</h2>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-[color:var(--border)] bg-[color:var(--card)]/50">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-[color:var(--primary)]" />
          <h2 className="text-lg font-semibold">XP Leaderboard</h2>
        </div>
        <p className="text-sm text-white/70 mt-1">
          Top grinders of the month
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/60">
            <Trophy className="size-12 mb-3 text-white/30" />
            <p className="text-sm">No one on the leaderboard yet</p>
            <p className="text-xs text-white/50 mt-1">Be the first to earn XP!</p>
          </div>
        ) : (
          leaderboard.map((entry) => (
            <div
              key={entry.rank}
              className={`flex items-center gap-3 p-3 rounded-lg border ${getRankBadge(entry.rank)} ${
                entry.isMe ? "ring-2 ring-[color:var(--primary)] ring-offset-2 ring-offset-background" : ""
              }`}
            >
              <div className="flex items-center justify-center size-10 rounded-full bg-white/5 border border-white/10 flex-shrink-0">
                {getRankIcon(entry.rank) || (
                  <span className="text-sm font-bold text-white/80">#{entry.rank}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">{entry.name}</span>
                  {entry.isMe && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--primary)]/20 text-[color:var(--primary)] border border-[color:var(--primary)]/30">
                      You
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-white/60 mt-0.5">
                  <span>Level {entry.level}</span>
                  <span>•</span>
                  <span>{entry.xp.toLocaleString()} XP</span>
                </div>
              </div>
            </div>
          ))
        )}

        {myRank && myRank > 50 && (
          <div className="mt-4 pt-4 border-t border-[color:var(--border)]">
            <div className="text-xs text-white/60 text-center mb-2">Your Rank</div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-[color:var(--primary)]/30 bg-[color:var(--primary)]/5">
              <div className="flex items-center justify-center size-10 rounded-full bg-white/5 border border-white/10 flex-shrink-0">
                <span className="text-sm font-bold text-white/80">#{myRank}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white/70">Keep grinding to reach top 50!</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

