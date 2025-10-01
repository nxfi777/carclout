'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ElectricBorder from '@/components/electric-border';
import { Button } from '@/components/ui/button';

async function startCheckout() {
  try {
    const res = await fetch('/api/billing/create-checkout', { method: 'POST', body: JSON.stringify({ plan: 'pro' }) });
    const json = await res.json();
    if (json?.url) window.location.assign(json.url);
  } catch {}
}

export default function ProUpsellDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener('open-pro-upsell', onOpen as EventListener);
    return () => window.removeEventListener('open-pro-upsell', onOpen as EventListener);
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Go Pro</DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <ElectricBorder color="#ff6a00" speed={1} chaos={0.6} thickness={2} style={{ borderRadius: 12 }}>
            <Card className="border-transparent">
              <CardHeader className="py-2 pb-0">
                <CardTitle className="flex items-center justify-between">
                  <span>Pro</span>
                  <span className="text-xs rounded px-2 py-1" style={{ backgroundColor: 'rgba(255,106,0,0.12)', color: '#ff6a00' }}>BEST VALUE</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="text-2xl font-semibold">
                  $25/mo
                </div>
                <ul className="text-sm list-disc pl-5">
                  <li>
                    <span className="inline-flex items-center gap-2">
                      <span>
                        ≈ <span className="tabular-nums">357</span> posts
                      </span>
                      <span className="relative text-[0.625rem] px-[0.5em] py-[0.25em] rounded-full border shadow badge-new">
                        <span className="shiny-text">2x VALUE</span>
                      </span>
                    </span>
                  </li>
                  <li>Community access</li>
                  <li>Feature voting</li>
                  <li>100GB storage</li>
                  <li>On-demand upscales</li>
                  <li>Video generation</li>
                  <li>All tools unlocked</li>
                  <li>Priority updates</li>
                  <li>Exclusive discounts</li>
                  <li>Livestreams access</li>
                </ul>
                <div className="flex-1" />
                <Button className="w-full text-white" style={{ backgroundColor: '#ff6a00', borderColor: '#ff6a00' }} onClick={startCheckout}>
                  Upgrade
                </Button>
              </CardContent>
            </Card>
          </ElectricBorder>
        </div>
      </DialogContent>
    </Dialog>
  );
}


