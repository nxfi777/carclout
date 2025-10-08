"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InstagramBrowserPrompt() {
  const [isInstagram, setIsInstagram] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showRedirectOverlay, setShowRedirectOverlay] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if running in Instagram browser
    const ua = navigator.userAgent || '';
    const isInInstagram = ua.includes('Instagram');
    const iOS = /iPhone|iPad|iPod/.test(ua);
    const android = /Android/.test(ua);
    
    if (isInInstagram) {
      setIsInstagram(true);
      setIsIOS(iOS);
      setIsAndroid(android);
      
      // Check if user has previously dismissed or if we've already attempted redirect
      const dismissed = sessionStorage.getItem('carclout:ig-prompt-dismissed');
      const attemptedRedirect = sessionStorage.getItem('carclout:ig-redirect-attempted');
      
      if (dismissed === 'true') {
        setIsDismissed(true);
        return;
      }
      
      // Automatically attempt redirect on first load (only once per session)
      if (attemptedRedirect !== 'true') {
        sessionStorage.setItem('carclout:ig-redirect-attempted', 'true');
        
        // Show redirect overlay
        setShowRedirectOverlay(true);
        
        // Small delay to ensure the page has loaded, then attempt redirect
        setTimeout(() => {
          attemptAutoRedirect(iOS, android);
        }, 300);
        
        // After 2 seconds, hide overlay and show banner as fallback
        setTimeout(() => {
          setShowRedirectOverlay(false);
          setShowBanner(true);
        }, 2000);
      } else {
        // If we've already attempted redirect, just show the banner
        setShowBanner(true);
      }
    }
  }, []);

  const attemptAutoRedirect = (iOS: boolean, android: boolean) => {
    const currentUrl = window.location.href;
    
    try {
      if (iOS) {
        // iOS: Try Safari URL scheme
        window.location.href = `x-safari-${currentUrl}`;
      } else if (android) {
        // Android: Use intent URL
        const intentUrl = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;action=android.intent.action.VIEW;end;`;
        window.location.href = intentUrl;
      }
    } catch {
      // If redirect fails, banner will show
      console.log('[Instagram Redirect] Auto-redirect failed, showing banner');
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('carclout:ig-prompt-dismissed', 'true');
  };

  const handleOpenInBrowser = () => {
    const currentUrl = window.location.href;
    
    // Try deep link approach first
    if (isIOS) {
      // iOS: Try to open in Safari using custom URL scheme
      // This works by creating a link that Safari can handle
      const safariUrl = `x-safari-${currentUrl}`;
      window.location.href = safariUrl;
      
      // Fallback after a short delay if deep link doesn't work
      setTimeout(() => {
        // Try alternative approach: open in a new window which iOS may handle differently
        const newWindow = window.open(currentUrl, '_blank');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          showInstructions();
        }
      }, 500);
    } else if (isAndroid) {
      // Android: Use intent URL to open in default browser
      const intentUrl = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;action=android.intent.action.VIEW;end;`;
      window.location.href = intentUrl;
      
      // Fallback
      setTimeout(() => {
        const newWindow = window.open(currentUrl, '_blank');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          showInstructions();
        }
      }, 500);
    } else {
      // Generic fallback
      const newWindow = window.open(currentUrl, '_blank');
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        showInstructions();
      }
    }
  };

  const showInstructions = () => {
    const instructions = isIOS
      ? 'Tap the ••• menu and select "Open in Safari"'
      : isAndroid
      ? 'Tap the ••• menu and select "Open in Browser"'
      : 'Tap the ••• menu and select "Open in Browser"';
    
    // Copy URL to clipboard as fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
      const url = window.location.href;
      navigator.clipboard.writeText(url).catch(() => {});
    }
    
    alert(`For the best experience:\n\n${instructions}`);
  };

  if (!isInstagram || isDismissed) return null;

  return (
    <>
      {/* Redirect Overlay - Shows first */}
      {showRedirectOverlay && (
        <div 
          className="fixed inset-0 z-6 flex items-center justify-center"
          style={{
            background: 'rgba(11, 16, 32, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div className="text-center px-6">
            {/* Spinner */}
            <div className="w-16 h-16 mx-auto mb-4 relative">
              <div 
                className="w-full h-full rounded-full border-4 border-[#263166] border-t-[#5b6cff]"
                style={{ animation: 'spin 0.8s linear infinite' }}
              />
            </div>
            
            <h3 className="text-xl md:text-2xl font-semibold text-white mb-2">
              {isIOS ? 'Opening in Safari...' : 'Opening in Browser...'}
            </h3>
            <p className="text-sm text-white/60">
              Taking you to the full experience
            </p>
          </div>
        </div>
      )}

      {/* Fallback Banner - Shows if redirect fails */}
      {showBanner && !showRedirectOverlay && (
        <div 
          className="fixed top-0 left-0 right-0 z-6 shadow-lg"
          style={{ 
            background: 'linear-gradient(135deg, #111a36 0%, #1a2447 50%, #263166 100%)',
            borderBottom: '1px solid #263166',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            animation: 'slideDown 0.3s ease-out'
          }}
        >
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <ExternalLink className="w-5 h-5" style={{ color: '#5b6cff' }} />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm md:text-base font-medium text-white">
                  {isIOS ? 'Open in Safari for the best experience' : 'Open in your browser for the best experience'}
                </p>
                <p className="text-xs text-white/60 mt-0.5 hidden sm:block">
                  {isIOS ? 'Tap the ••• menu → "Open in Safari"' : 'Tap the ••• menu → "Open in Browser"'}
                </p>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  onClick={handleOpenInBrowser}
                  size="sm"
                  className="text-xs md:text-sm font-medium h-8 px-3 whitespace-nowrap"
                  style={{ 
                    background: '#5b6cff',
                    color: 'white'
                  }}
                >
                  Try Again
                </Button>
                
                <button
                  onClick={handleDismiss}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-5 h-5 text-white/80" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}

