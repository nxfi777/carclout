'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type CreditDepletionDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: 'minimum' | 'pro' | 'ultra' | null;
  creditsRemaining: number;
  requiredCredits?: number; // Credits needed for the attempted action
};

export default function CreditDepletionDrawer({ 
  open, 
  onOpenChange,
  currentPlan: _currentPlan,
  creditsRemaining,
  requiredCredits = 0
}: CreditDepletionDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [topupAmount, setTopupAmount] = useState('10');

  // Reset topup amount when opening
  useEffect(() => {
    if (open) {
      setTopupAmount('10');
    }
  }, [open]);

  async function handleCreditsTopup() {
    const amount = parseInt(topupAmount, 10);
    if (!amount || amount < 3) {
      toast.error('Minimum top-up is $3');
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
              {hasRunOut ? "You've Run Out of Credits" : cantAfford ? "Not Quite Enough" : "You're Running Low on Credits"}
            </SheetTitle>
            <SheetDescription className="text-sm text-white/75">
              {hasRunOut ? (
                <>You&apos;ve used all your credits. Top up now to continue creating.</>
              ) : cantAfford ? (
                <>You need <span className="font-semibold text-indigo-400">{creditsNeeded} more credits</span> for this. Quick top-up and you&apos;re back in action.</>
              ) : (
                <>You have <span className="font-semibold text-indigo-400">very little credits</span> remaining. Top up now to keep creating without interruption.</>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Top-up highlight */}
            <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-white">Get Back to Creating</div>
                  <div className="text-sm text-white/70 mt-1">
                    Top up your credits instantly and continue your creative flow.
                  </div>
                </div>
              </div>
            </div>

            {/* Top-up Options */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Top-up Amount</label>
              <div className="grid grid-cols-3 gap-3">
                {['3', '10', '25'].map((amt) => (
                  <Button
                    key={amt}
                    variant={topupAmount === amt ? 'default' : 'outline'}
                    onClick={() => setTopupAmount(amt)}
                    className={topupAmount === amt ? 'bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-500' : ''}
                  >
                    ${amt}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/60">or</span>
                <input
                  type="number"
                  min="3"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  placeholder="Custom amount"
                />
              </div>
              <div className="text-xs text-white/50 text-center">
                Minimum $3 · 1100 credits per dollar
              </div>
            </div>

            {/* CTA */}
            <Button
              onClick={() => handleCreditsTopup()}
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-base h-12"
            >
              {loading ? 'Loading...' : `Top Up $${topupAmount}`}
              {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

