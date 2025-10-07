'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import ElectricBorder from '@/components/electric-border';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Crown, Zap, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function ProUpsellDrawer() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener('open-pro-upsell', onOpen as EventListener);
    return () => window.removeEventListener('open-pro-upsell', onOpen as EventListener);
  }, []);

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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="border-t border-[color:var(--border)] bg-[color:var(--popover)]/95 backdrop-blur-sm sm:mx-auto sm:max-w-2xl sm:rounded-t-3xl sm:border sm:border-[color:var(--border)] max-h-[calc(100dvh-6rem)] overflow-y-auto"
      >
        <div className="px-5 pt-6 pb-5 sm:px-8">
          <SheetHeader className="items-center gap-4 text-center">
            <div className="inline-flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-indigo-500/20 via-indigo-600/20 to-indigo-700/20 border-2 border-indigo-500/40 shadow-lg shadow-indigo-500/20">
              <Crown className="size-8 text-indigo-500 fill-indigo-500/30" />
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500/20 to-indigo-600/20 px-4 py-1 text-xs uppercase tracking-wider text-indigo-400 font-semibold border border-indigo-500/30">
              <Sparkles className="size-3.5" />
              Upgrade to Pro
            </div>

            <SheetTitle className="text-balance text-2xl font-bold text-white leading-tight">
              Unlock 100× More Storage
            </SheetTitle>

            <SheetDescription className="text-sm text-white/75 max-w-md">
              You&apos;re hitting your storage limit. Upgrade to Pro for 100GB of space, 2× credits per dollar, and exclusive features.
            </SheetDescription>
          </SheetHeader>


          <div className="mt-6 space-y-4">
            {/* Pro Offer */}
            <ElectricBorder color="#6366f1" speed={1} chaos={0.6} thickness={2} style={{ borderRadius: 12 }}>
              <Card className="border-transparent">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">Pro Plan</div>
                    <div className="text-xs rounded-full px-3 py-1 bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20">
                      BEST VALUE
                    </div>
                  </div>
                  
                  <div className="text-3xl font-bold text-indigo-400">
                    $27<span className="text-base text-white/60">/mo</span>
                  </div>
                  <div className="text-xs text-white/60">
                    Billed yearly ($156/year) • Save $48/year
                  </div>

                  {/* Value highlights */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-center size-10 rounded-full bg-indigo-500/20">
                        <Upload className="size-5 text-indigo-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">100GB Storage</div>
                        <div className="text-xs text-white/60">100× more than base plan</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center justify-center size-10 rounded-full bg-indigo-500/20">
                        <Zap className="size-5 text-indigo-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">2× Credits Per Dollar</div>
                        <div className="text-xs text-white/60">Double the value on every purchase</div>
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
                      <span>Exclusive discounts</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Livestreams access</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>All tools unlocked</span>
                    </li>
                  </ul>

                  <Button
                    onClick={handleProUpgrade}
                    disabled={loading}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-base h-12 mt-4"
                  >
                    {loading ? 'Loading...' : 'Upgrade to Pro'}
                    {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                  </Button>
                </CardContent>
              </Card>
            </ElectricBorder>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


