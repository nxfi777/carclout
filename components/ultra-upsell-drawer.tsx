'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import ElectricBorder from '@/components/electric-border';
import { Button } from '@/components/ui/button';
import { Zap, Video, ArrowRight, Sparkles, Crown } from 'lucide-react';
import { toast } from 'sonner';

type UltraUpsellDrawerProps = {
  feature?: 'upscale' | 'smooth';
};

export default function UltraUpsellDrawer({ feature = 'upscale' }: UltraUpsellDrawerProps = {}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestedFeature, setRequestedFeature] = useState<'upscale' | 'smooth'>(feature);

  useEffect(() => {
    function onOpen(event: Event) {
      const customEvent = event as CustomEvent<{ feature?: 'upscale' | 'smooth' }>;
      if (customEvent.detail?.feature) {
        setRequestedFeature(customEvent.detail.feature);
      }
      setOpen(true);
    }
    window.addEventListener('open-ultra-upsell', onOpen as EventListener);
    return () => window.removeEventListener('open-ultra-upsell', onOpen as EventListener);
  }, []);

  async function handleUltraUpgrade() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'ultra' })
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

  const featureName = requestedFeature === 'smooth' ? 'Smooth (60fps)' : 'Video Upscale';
  const featureDescription = requestedFeature === 'smooth' 
    ? 'Frame interpolation for buttery-smooth 60fps videos'
    : 'AI-powered 2x video upscaling for crystal-clear quality';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="border-t border-[color:var(--border)] bg-[color:var(--popover)]/95 backdrop-blur-sm sm:mx-auto sm:max-w-xl sm:rounded-t-3xl sm:border sm:border-[color:var(--border)] max-h-[calc(100dvh-6rem)] overflow-y-auto"
      >
        <div className="px-5 pt-6 pb-5 sm:px-6">
          <SheetHeader className="items-center gap-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <Crown className="h-7 w-7 text-purple-500" />
              <SheetTitle className="text-balance text-3xl font-semibold text-white">
                Upgrade to Ultra
              </SheetTitle>
            </div>
            <SheetDescription className="text-sm text-white/75">
              {featureName} is an Ultra-exclusive feature. Unlock it and get way more.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Feature highlight */}
            <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                {requestedFeature === 'smooth' ? (
                  <Video className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Zap className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <div className="font-semibold text-white">{featureName}</div>
                  <div className="text-sm text-white/70 mt-1">
                    {featureDescription}
                  </div>
                </div>
              </div>
            </div>

            {/* Ultra Plan Offer */}
            <ElectricBorder color="#a855f7" speed={1} chaos={0.6} thickness={2} style={{ borderRadius: 12 }}>
              <Card className="border-transparent">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">Ultra Plan</div>
                    <div className="text-xs rounded-full px-3 py-1 bg-purple-500/10 text-purple-500 font-semibold border border-purple-500/20">
                      PREMIUM
                    </div>
                  </div>
                  
                  <div className="text-3xl font-bold text-purple-500">
                    $97<span className="text-base text-white/60">/mo</span>
                  </div>

                  {/* Value comparison */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                      <Video className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-semibold">Advanced video tools</div>
                        <div className="text-sm text-white/60">Upscale & smooth (60fps) for pro-quality videos</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                      <Sparkles className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-semibold">≈ 1,000 posts/month</div>
                        <div className="text-sm text-white/60">4x more credits than Pro</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                      <Crown className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-semibold">Priority support</div>
                        <div className="text-sm text-white/60">Fast-track your questions & requests</div>
                      </div>
                    </div>
                  </div>

                  {/* Additional benefits list */}
                  <ul className="text-sm space-y-2 pt-2 border-t border-white/10">
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Everything in Pro</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>500GB storage (5x Pro)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Best credit rates</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Early access to new features</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <span>Advanced analytics</span>
                    </li>
                  </ul>

                  <Button
                    onClick={handleUltraUpgrade}
                    disabled={loading}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white text-base h-12 mt-4"
                  >
                    {loading ? 'Loading...' : 'Upgrade to Ultra'}
                    {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                  </Button>
                </CardContent>
              </Card>
            </ElectricBorder>

            {/* Value explanation */}
            <div className="text-xs text-white/50 text-center">
              Ultra gives you the most powerful tools and best rates. Perfect for serious creators.
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


