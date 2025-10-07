import { useState, useEffect, useCallback } from 'react';

export type CreditDepletionTrigger = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

type UseCreditDepletionReturn = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  checkAndTrigger: (currentCredits: number, requiredCredits: number) => boolean;
  currentPlan: 'minimum' | 'pro' | null;
  creditsRemaining: number;
  requiredCredits: number;
};

/**
 * Hook to manage credit depletion drawer state
 * Triggers when user doesn't have enough credits for an operation
 * 
 * Business principle: Present offer at moment of highest intent (when they try to create something)
 */
export function useCreditDepletion(): UseCreditDepletionReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<'minimum' | 'pro' | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState(0);
  const [requiredCredits, setRequiredCredits] = useState(0);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  // Load user plan on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await fetch('/api/me', { cache: 'no-store' }).then(r => r.json());
        if (mounted) {
          const plan = me?.plan;
          if (plan === 'pro' || plan === 'ultra' || plan === 'premium') {
            setCurrentPlan('pro');
          } else if (plan === 'minimum' || plan === 'base' || plan === 'basic' || plan === 'starter') {
            setCurrentPlan('minimum');
          }
        }
      } catch (e) {
        console.error('Failed to load plan for credit depletion:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  
  const close = useCallback(() => {
    setIsOpen(false);
    // Mark as dismissed for this session to prevent infinite loop
    setDismissedThisSession(true);
  }, []);

  /**
   * Check if credits are insufficient and trigger drawer if needed
   * Returns true if drawer was triggered and action should be blocked
   * Returns false if user has enough credits to proceed
   * 
   * Triggers warning when they're running low (would drop below 150 after action)
   * Won't trigger again if already dismissed this session UNLESS they've actually run out
   */
  const checkAndTrigger = useCallback((currentCredits: number, creditsNeeded: number): boolean => {
    setCreditsRemaining(currentCredits);
    setRequiredCredits(creditsNeeded);
    
    // Check if they would drop below warning threshold after this action
    const creditsAfterAction = currentCredits - creditsNeeded;
    const WARNING_THRESHOLD = 150;
    const hasInsufficientCredits = currentCredits < creditsNeeded;
    const isLowButSufficient = creditsAfterAction >= 0 && creditsAfterAction < WARNING_THRESHOLD;
    
    // If they've ACTUALLY run out, always show drawer (critical situation)
    if (hasInsufficientCredits) {
      setIsOpen(true);
      return true; // Block action, show drawer
    }
    
    // If they're just low (warning threshold) and already dismissed, don't show again
    if (isLowButSufficient && dismissedThisSession) {
      return false; // Let them proceed without nagging
    }
    
    // Show drawer if they're running low and haven't dismissed yet
    if (isLowButSufficient) {
      setIsOpen(true);
      return true; // Block action, show drawer
    }
    
    return false; // Sufficient credits, proceed
  }, [dismissedThisSession]);

  return {
    isOpen,
    open,
    close,
    checkAndTrigger,
    currentPlan,
    creditsRemaining,
    requiredCredits,
  };
}

