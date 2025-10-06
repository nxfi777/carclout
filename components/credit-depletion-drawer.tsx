'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ElectricBorder from '@/components/electric-border';
import { TrendingUp, Users, Star, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type CreditDepletionDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: 'minimum' | 'pro' | null;
  creditsRemaining: number;
  requiredCredits?: number; // Credits needed for the attempted action
};

export default function CreditDepletionDrawer({ 
  open, 
  onOpenChange,
  currentPlan,
  creditsRemaining,
  requiredCredits = 0
}: CreditDepletionDrawerProps) {
  const [view, setView] = useState<'pro-upsell' | 'credits-topup' | 'pro-comparison'>('pro-upsell');
  const [loading, setLoading] = useState(false);
  const [topupAmount, setTopupAmount] = useState('27');

  // Reset view when opening based on plan
  useEffect(() => {
    if (open) {
      setView(currentPlan === 'minimum' ? 'pro-upsell' : 'credits-topup');
    }
  }, [open, currentPlan]);

  const isPro = currentPlan === 'pro';
  const isMinimum = currentPlan === 'minimum';

  async function handleProUpgrade() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/create-checkout', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }) 
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
      } else {
        toast.error(json?.error || 'Failed to start checkout');
      }
    } catch {
      toast.error('Failed to start checkout');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreditsTopup(forceCheckout = false) {
    const amount = parseInt(topupAmount, 10);
    if (!amount || amount < 5) {
      toast.error('Minimum top-up is $5');
      return;
    }
    
    // If minimum plan user tries to top up $27 and hasn't been shown comparison, show it
    if (isMinimum && amount >= 27 && !forceCheckout && view === 'credits-topup') {
      setView('pro-comparison');
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
        if (json?.hint) toast.message('Tip', { description: json.hint });
        window.location.href = json.url;
      } else {
        toast.error(json?.error || 'Failed to start top-up');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleDeclineProUpsell() {
    // Tactical empathy: acknowledge their decision, offer alternative
    setView('credits-topup');
  }

  function handleOpenChange(newOpen: boolean) {
    // If minimum plan user is viewing pro-upsell and tries to close, show credits topup instead
    if (!newOpen && isMinimum && view === 'pro-upsell') {
      setView('credits-topup');
      return;
    }
    // If viewing pro-comparison and they try to close, proceed with the top-up checkout
    // They've already selected $27+ and been shown the comparison, so honor their decision
    if (!newOpen && isMinimum && view === 'pro-comparison') {
      handleCreditsTopup(true);
      return;
    }
    // Otherwise, allow normal close behavior
    onOpenChange(newOpen);
  }

  if (isPro) {
    // Pro users: direct to credits top-up with their superior rates highlighted
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
                  <>You need <span className="font-semibold text-orange-500">{creditsNeeded} more credits</span> for this. Quick top-up and you&apos;re back in action.</>
                ) : (
                  <>You have <span className="font-semibold text-orange-500">very little credits</span> remaining. Top up now to keep creating without interruption.</>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {/* Pro Rate Highlight */}
              <div className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Star className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Pro Member Advantage</div>
                    <div className="text-sm text-white/70 mt-1">
                      You get better rates on credit top-ups as a Pro member.
                    </div>
                  </div>
                </div>
              </div>

              {/* Top-up Options */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Top-up Amount</label>
                <div className="grid grid-cols-3 gap-3">
                  {['10', '27', '50'].map((amt) => (
                    <Button
                      key={amt}
                      variant={topupAmount === amt ? 'default' : 'outline'}
                      onClick={() => setTopupAmount(amt)}
                      className={topupAmount === amt ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' : ''}
                    >
                      ${amt}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/60">or</span>
                  <input
                    type="number"
                    min="5"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    placeholder="Custom amount"
                  />
                </div>
                <div className="text-xs text-white/50 text-center">Minimum $5 · Better rates at $27+ and $50+</div>
              </div>

              {/* CTA */}
              <Button
                onClick={() => handleCreditsTopup()}
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white text-base h-12"
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

  // Minimum plan users: Pro upsell → Credits fallback
  const hasRunOut = creditsRemaining === 0;
  const cantAfford = !hasRunOut && requiredCredits > 0 && creditsRemaining < requiredCredits;
  const creditsNeeded = cantAfford ? requiredCredits - creditsRemaining : 0;
  
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="border-t border-[color:var(--border)] bg-[color:var(--popover)]/95 backdrop-blur-sm sm:mx-auto sm:max-w-xl sm:rounded-t-3xl sm:border sm:border-[color:var(--border)] max-h-[calc(100dvh-6rem)] overflow-y-auto"
      >
        {view === 'pro-upsell' ? (
          <div className="px-5 pt-6 pb-5 sm:px-6">
            <SheetHeader className="items-center gap-4 text-center">
              <SheetTitle className="text-balance text-3xl font-semibold text-white">
                {hasRunOut ? "You've Run Out of Credits" : cantAfford ? "Not Quite Enough" : "You're About to Run Out"}
              </SheetTitle>
              <SheetDescription className="text-sm text-white/75">
                {hasRunOut ? (
                  <>You&apos;ve used all your credits. This is the perfect moment to upgrade.</>
                ) : cantAfford ? (
                  <>You need only <span className="font-semibold text-orange-500">{creditsNeeded} more credits</span> for this.</>
                ) : (
                  <>You have <span className="font-semibold text-orange-500">very little credits</span> left. This is the perfect moment to upgrade.</>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {/* Pro Offer (Anchor high) */}
              <ElectricBorder color="#ff6a00" speed={1} chaos={0.6} thickness={2} style={{ borderRadius: 12 }}>
                <Card className="border-transparent">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">Pro Plan</div>
                      <div className="text-xs rounded-full px-3 py-1 bg-orange-500/10 text-orange-500 font-semibold border border-orange-500/20">
                        BEST VALUE
                      </div>
                    </div>
                    
                    <div className="text-3xl font-bold text-orange-500">$27<span className="text-base text-white/60">/mo</span></div>

                    {/* Value comparison */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                        <TrendingUp className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold">≈ 250 posts/month</div>
                          <div className="text-sm text-white/60">vs. 5 posts on minimum plan</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                        <Sparkles className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold">Video generation & all templates</div>
                          <div className="text-sm text-white/60">Create videos + access every template</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                        <Users className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold">Community access unlocked</div>
                          <div className="text-sm text-white/60">Connect, share, get feedback from creators</div>
                        </div>
                      </div>
                    </div>

                    {/* Additional benefits list */}
                    <ul className="text-sm space-y-2 pt-2 border-t border-white/10">
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>Feature voting & priority updates</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>100GB storage (vs. 1GB)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>On-demand upscales</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>All tools unlocked</span>
                      </li>
                    </ul>

                    <Button
                      onClick={handleProUpgrade}
                      disabled={loading}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white text-base h-12 mt-4"
                    >
                      {loading ? 'Loading...' : 'Upgrade to Pro'}
                      {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                    </Button>
                  </CardContent>
                </Card>
              </ElectricBorder>

              {/* Alternative: Just top up credits */}
              <button
                onClick={handleDeclineProUpsell}
                className="text-sm text-white/50 hover:text-white/70 transition-colors w-full text-center"
              >
                No thanks, I&apos;ll just top up credits
              </button>
            </div>
          </div>
        ) : view === 'credits-topup' ? (
          <div className="px-5 pt-6 pb-5 sm:px-6">
            <SheetHeader className="items-center gap-4 text-center">
              <SheetTitle className="text-balance text-3xl font-semibold text-white">
                Top Up Your Credits
              </SheetTitle>
              <SheetDescription className="text-sm text-white/75">
                {hasRunOut ? (
                  <>You&apos;ve run out of credits. Top up to continue creating.</>
                ) : cantAfford ? (
                  <>You need <span className="font-semibold text-orange-500">{creditsNeeded} more credits</span> for this. Top up to continue.</>
                ) : (
                  <>You have <span className="font-semibold text-orange-500">{creditsRemaining} credits</span> remaining.</>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {/* Reminder about better rates on Pro */}
              {isMinimum && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-sm text-white">Friendly reminder</div>
                      <div className="text-sm text-white/70 mt-1">
                        Pro members get better credit rates. Every dollar goes further.{' '}
                        <button 
                          onClick={() => setView('pro-upsell')} 
                          className="text-orange-500 hover:text-orange-400 underline"
                        >
                          Learn more
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Top-up Options */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Top-up Amount</label>
                <div className="grid grid-cols-3 gap-3">
                  {['5', '10', '20'].map((amt) => (
                    <Button
                      key={amt}
                      variant={topupAmount === amt ? 'default' : 'outline'}
                      onClick={() => setTopupAmount(amt)}
                      className={topupAmount === amt ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' : ''}
                    >
                      ${amt}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/60">or</span>
                  <input
                    type="number"
                    min="5"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    placeholder="Custom amount"
                  />
                </div>
                <div className="text-xs text-white/50 text-center">
                  Minimum $5 · Current rate: {isMinimum ? '5' : '8'} images {!isMinimum && "25 upscales"} per dollar
                </div>
              </div>

              {/* CTA */}
              <Button
                onClick={() => handleCreditsTopup()}
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white text-base h-12"
              >
                {loading ? 'Loading...' : `Top Up $${topupAmount}`}
                {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
              </Button>
            </div>
          </div>
        ) : (
          // Pro comparison view - shown when minimum user tries to top up $27+
          <div className="px-5 pt-6 pb-5 sm:px-6">
            <SheetHeader className="items-center gap-4 text-center">
              <SheetTitle className="text-balance text-3xl font-semibold text-white">
                Wait — Better Deal Available
              </SheetTitle>
              <SheetDescription className="text-sm text-white/75">
                For the same ${topupAmount}, you could get Pro and receive double the credits plus way more value.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {/* Side-by-side comparison */}
              <div className="grid grid-cols-2 gap-3">
                {/* What they're about to buy */}
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-xs text-white/50 uppercase tracking-wide mb-2">What You&apos;d Get</div>
                  <div className="text-xl font-bold mb-1">${topupAmount}</div>
                  <div className="text-sm text-white/70 mb-3">Credit Top-Up</div>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      <span>~{Math.floor(parseInt(topupAmount) * 5)} images</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span className="text-white/50">No video generation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span className="text-white/50">Limited templates</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span className="text-white/50">Still 1GB storage</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span className="text-white/50">Runs out quickly</span>
                    </li>
                  </ul>
                </div>

                {/* Pro Plan */}
                <ElectricBorder color="#ff6a00" speed={1} chaos={0.6} thickness={1.5} style={{ borderRadius: 8 }}>
                  <div className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 rounded-lg p-4 h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-orange-500 uppercase tracking-wide font-semibold">Better Choice</div>
                      <Star className="h-4 w-4 text-orange-500" />
                    </div>
                    <div className="text-xl font-bold mb-1">
                      $27<span className="text-xs text-white/40">/mo</span>
                    </div>
                    <div className="text-sm text-white/70 mb-3">Pro Plan</div>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span className="font-medium">~250 images/mo</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span className="font-medium">Video generation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span className="font-medium">All templates</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span>Community access</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span>100GB storage</span>
                      </li>
                    </ul>
                  </div>
                </ElectricBorder>
              </div>

              {/* Value explanation */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-sm text-white/90 leading-relaxed">
                  <strong>Here&apos;s the thing:</strong> You&apos;re about to spend ${topupAmount} on credits that&apos;ll run out fast. 
                  For that exact same price, Pro gives you <span className="text-orange-500 font-semibold">double the credits monthly</span>, 
                  better rates on everything, and access to our creator community. It&apos;s the same money—just way more value.
                </div>
              </div>

              {/* CTAs */}
              <div className="space-y-3">
                <Button
                  onClick={handleProUpgrade}
                  disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white text-base h-12"
                >
                  {loading ? 'Loading...' : 'Get Pro Instead (Same Price)'}
                  {!loading && <Sparkles className="ml-2 h-5 w-5" />}
                </Button>
                <button
                  onClick={() => handleCreditsTopup(true)}
                  disabled={loading}
                  className="text-sm text-white/50 hover:text-white/70 transition-colors w-full text-center"
                >
                  No thanks, I&apos;ll just top up ${topupAmount}
                </button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

