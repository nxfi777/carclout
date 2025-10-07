'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowRight, Images, Wand2, Video, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

type CreditDepletionDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: 'minimum' | 'pro' | 'ultra' | null;
  creditsRemaining: number;
  requiredCredits?: number; // Credits needed for the attempted action
};

// Credit costs (aligned with pricing in the app)
const CREDITS_PER_DOLLAR = 1100;
const CREDITS_PER_IMAGE = 100;
const CREDITS_PER_5S_VIDEO = 788; // 5s 1080p Kling video

export default function CreditDepletionDrawer({ 
  open, 
  onOpenChange,
  currentPlan: _currentPlan,
  creditsRemaining,
  requiredCredits = 0
}: CreditDepletionDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [topupAmount, setTopupAmount] = useState('1');

  // Reset topup amount when opening
  useEffect(() => {
    if (open) {
      setTopupAmount('1');
    }
  }, [open]);

  // Calculate what they get for their money
  const calculations = useMemo(() => {
    const amount = parseInt(topupAmount || '1', 10);
    const credits = amount * CREDITS_PER_DOLLAR;
    const images = Math.floor(credits / CREDITS_PER_IMAGE);
    const videos = Math.floor(credits / CREDITS_PER_5S_VIDEO);
    
    // Find next meaningful threshold
    let threshold = null;
    
    // If they're close to affording a video but can't yet
    if (videos === 0 && credits < CREDITS_PER_5S_VIDEO) {
      const creditsNeeded = CREDITS_PER_5S_VIDEO - credits;
      const dollarsNeeded = Math.ceil(creditsNeeded / CREDITS_PER_DOLLAR);
      if (dollarsNeeded <= 3) { // Only suggest if it's a small amount more
        threshold = {
          amount: dollarsNeeded,
          benefit: '1 AI video',
          total: amount + dollarsNeeded
        };
      }
    }
    // If they can afford 1 video, suggest getting to 2 videos
    else if (videos === 1) {
      const creditsNeeded = (CREDITS_PER_5S_VIDEO * 2) - credits;
      const dollarsNeeded = Math.ceil(creditsNeeded / CREDITS_PER_DOLLAR);
      if (dollarsNeeded <= 3) {
        threshold = {
          amount: dollarsNeeded,
          benefit: 'another AI video',
          total: amount + dollarsNeeded
        };
      }
    }
    // If they're at a round number of images, suggest more
    else if (images > 0 && images % 10 === 0) {
      const nextMilestone = Math.ceil(images / 10) * 10 + 10;
      const creditsNeeded = (nextMilestone * CREDITS_PER_IMAGE) - credits;
      const dollarsNeeded = Math.ceil(creditsNeeded / CREDITS_PER_DOLLAR);
      if (dollarsNeeded <= 3) {
        threshold = {
          amount: dollarsNeeded,
          benefit: `${nextMilestone} images total`,
          total: amount + dollarsNeeded
        };
      }
    }

    return { amount, credits, images, videos, threshold };
  }, [topupAmount]);

  async function handleCreditsTopup() {
    const amount = parseInt(topupAmount, 10);
    if (!amount || amount < 1) {
      toast.error('Minimum top-up is $1');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topup: amount })
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
      } else {
        toast.error(json?.error || 'Failed to start top-up');
      }
    } finally {
      setLoading(false);
    }
  }

  const hasRunOut = creditsRemaining === 0;
  const cantAfford = !hasRunOut && requiredCredits > 0 && creditsRemaining < requiredCredits;
  const creditsNeeded = cantAfford ? requiredCredits - creditsRemaining : 0;
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-[color:var(--border)] bg-[color:var(--popover)]/95 backdrop-blur-sm sm:mx-auto sm:max-w-xl sm:rounded-t-3xl sm:border sm:border-[color:var(--border)] max-h-[calc(100dvh-6rem)] overflow-y-auto"
      >
        <div className="px-5 pt-6 pb-5 sm:px-6">
          <SheetHeader className="items-center gap-4 text-center">
            <SheetTitle className="text-balance text-2xl font-semibold text-white">
              {hasRunOut ? `Refuel for $${calculations.amount}` : cantAfford ? `Get back in with $${calculations.amount}` : `Refuel for $${calculations.amount}`}
            </SheetTitle>
            <SheetDescription className="text-sm text-white/75">
              {hasRunOut ? (
                <>You&apos;ve used all your credits. Refuel now to continue creating.</>
              ) : cantAfford ? (
                <>You need <span className="font-semibold text-indigo-400">{creditsNeeded} more credits</span> for this. Quick refuel and you&apos;re back in action.</>
              ) : (
                <>You have <span className="font-semibold text-indigo-400">very little credits</span> remaining. Refuel now to keep creating without interruption.</>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {/* Threshold suggestion - upsell opportunity */}
            {calculations.threshold && (
              <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm text-white/90">
                      <span className="font-semibold">Just ${calculations.threshold.amount} more</span> gets you <span className="font-semibold text-green-400">{calculations.threshold.benefit}</span>
                      <button
                        onClick={() => setTopupAmount(String(calculations.threshold!.total))}
                        className="ml-2 text-xs text-green-400 hover:text-green-300 underline"
                      >
                        Add to total
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* What you get - Value breakdown */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white/90">Refuel for ${calculations.amount}</label>
              <div className="grid gap-2.5">
                <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                  <div className="bg-indigo-500/20 rounded-full p-2">
                    <Wand2 className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{calculations.credits.toLocaleString()} Credits</div>
                    <div className="text-xs text-white/60">{CREDITS_PER_DOLLAR.toLocaleString()} credits per $1</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                  <div className="bg-indigo-500/20 rounded-full p-2">
                    <Images className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">~{calculations.images} AI Images</div>
                    <div className="text-xs text-white/60">Perfect for your next creation session</div>
                  </div>
                </div>
                {calculations.videos > 0 && (
                  <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                    <div className="bg-indigo-500/20 rounded-full p-2">
                      <Video className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{calculations.videos} AI Video{calculations.videos > 1 ? 's' : ''}</div>
                      <div className="text-xs text-white/60">5-second 1080p videos</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Custom amount input */}
            <div className="space-y-2.5">
              <label className="text-sm font-medium text-white/90">Enter Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 text-sm font-medium">$</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={topupAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string for user to clear and retype
                    if (value === '') {
                      setTopupAmount('');
                      return;
                    }
                    // Convert to number and ensure minimum of 1
                    const num = parseInt(value, 10);
                    if (!isNaN(num)) {
                      setTopupAmount(String(Math.max(1, num)));
                    }
                  }}
                  onBlur={(e) => {
                    // On blur, ensure there's a valid value
                    const value = e.target.value;
                    if (value === '' || parseInt(value, 10) < 1) {
                      setTopupAmount('1');
                    }
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                  placeholder="1"
                />
              </div>
              <div className="text-xs text-white/50">
                Minimum $1 · Get {calculations.credits.toLocaleString()} credits ({calculations.images} images
                {calculations.videos > 0 && `, ${calculations.videos} video${calculations.videos > 1 ? 's' : ''}`})
              </div>
            </div>

            {/* CTA */}
            <Button
              onClick={() => handleCreditsTopup()}
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-base h-12 font-semibold"
            >
              {loading ? 'Loading...' : `Refuel for $${calculations.amount}`}
              {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

