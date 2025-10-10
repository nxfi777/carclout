import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface ImageGenerationOptions {
  templateId?: string;
  templateSlug?: string;
  userImageKeys?: string[];
  userImageDataUrls?: string[];
  variables?: Record<string, string | number | boolean>;
  vehicle?: { make?: string; model?: string; colorFinish?: string; accents?: string } | null;
  isolateCar?: boolean;
}

export interface ImageGenerationResult {
  url: string;
  key: string;
  credits: number;
}

const MAX_POLLS = 200; // 200 * 3s = 10 minutes max

export function useAsyncImageGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (
    options: ImageGenerationOptions,
    callbacks?: {
      onComplete?: (result: ImageGenerationResult) => void | Promise<void>;
      onError?: (error: string) => void;
      onInsufficientCredits?: () => void;
      onRequiresCropping?: (error: string) => void;
    }
  ) => {
    setIsGenerating(true);
    
    try {
      // Start async image generation
      const resp = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      
      let out: { jobId?: string; requiresCropping?: boolean; error?: string } = {};
      try {
        const text = await resp.text();
        console.log('[IMAGE] Response status:', resp.status, 'body length:', text.length);
        if (text) {
          out = JSON.parse(text);
        }
      } catch (parseErr) {
        console.error('[IMAGE] Failed to parse response:', parseErr);
      }
      
      if (resp.status === 402) {
        callbacks?.onInsufficientCredits?.();
        setIsGenerating(false);
        return null;
      }
      
      if (!resp.ok || !out?.jobId) {
        console.log('[IMAGE] Failed to start. Status:', resp.status, 'Response:', out);
        
        // Check if this is a cropping requirement (not an error)
        if (out?.requiresCropping === true && callbacks?.onRequiresCropping) {
          console.log('[IMAGE] Triggering onRequiresCropping callback');
          const errorMsg = out?.error || 'Image needs cropping to match template aspect ratio.';
          callbacks.onRequiresCropping(errorMsg);
          setIsGenerating(false);
          return null;
        }
        
        const errorMsg = out?.error || 'Image generation failed to start.';
        toast.error(errorMsg);
        callbacks?.onError?.(errorMsg);
        setIsGenerating(false);
        
        // Dispatch friction event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('template-generation-failed', {
            detail: { error: errorMsg, templateSlug: options.templateSlug }
          }));
        }
        
        return null;
      }
      
      const jobId = out.jobId;
      console.log('[IMAGE] Job started:', jobId);
      
      // Poll for completion
      const pollInterval = 3000; // Poll every 3 seconds
      let pollCount = 0;
      
      const poll = async (): Promise<ImageGenerationResult | null> => {
        if (pollCount >= MAX_POLLS) {
          console.log('[IMAGE] Max polls reached, image may still be generating');
          toast.info('Image is still generating. Check your library in a few minutes.');
          setIsGenerating(false);
          return null;
        }
        pollCount++;
        
        try {
          const statusResp = await fetch(`/api/templates/generate/status?jobId=${encodeURIComponent(jobId)}`);
          const statusData = await statusResp.json().catch(() => ({}));
          
          console.log(`[IMAGE] Poll ${pollCount}: status=${statusData.status}`);
          
          if (statusResp.status === 402) {
            callbacks?.onInsufficientCredits?.();
            setIsGenerating(false);
            return null;
          }
          
          if (statusData.status === 'completed') {
            const result: ImageGenerationResult = {
              url: String(statusData.url),
              key: String(statusData.key || ''),
              credits: statusData.credits || 0
            };
            console.log('[IMAGE] Generation complete:', result.key);
            setIsGenerating(false);
            
            // Dispatch engagement event (always)
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('template-generated', {
                detail: { 
                  templateSlug: options.templateSlug,
                  key: result.key,
                  credits: result.credits
                }
              }));
            }
            
            // Check if this is user's first template and dispatch activation event
            if (statusData.isFirstTemplate === true) {
              console.log('[ACTIVATION] First template generated!');
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('first-template-generated', {
                  detail: { 
                    templateSlug: options.templateSlug,
                    key: result.key
                  }
                }));
              }
            }
            
            await callbacks?.onComplete?.(result);
            return result;
          }
          
          if (statusData.status === 'failed') {
            const errorMsg = statusData.error || 'Image generation failed.';
            console.error('[IMAGE] Generation failed:', errorMsg);
            toast.error(errorMsg);
            callbacks?.onError?.(errorMsg);
            setIsGenerating(false);
            
            // Dispatch friction event
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('template-generation-failed', {
                detail: { error: errorMsg, templateSlug: options.templateSlug }
              }));
            }
            
            return null;
          }
          
          // Still pending or processing - continue polling
          return new Promise((resolve) => {
            setTimeout(async () => {
              const result = await poll();
              resolve(result);
            }, pollInterval);
          });
        } catch (pollErr) {
          console.error('[IMAGE] Error polling status:', pollErr);
          toast.error('Failed to check generation status');
          callbacks?.onError?.('Failed to check generation status');
          setIsGenerating(false);
          return null;
        }
      };
      
      return await poll();
      
    } catch (err) {
      console.error('[IMAGE] Generation error:', err);
      const errorMsg = 'Failed to start image generation';
      toast.error(errorMsg);
      callbacks?.onError?.(errorMsg);
      setIsGenerating(false);
      return null;
    }
  }, []);

  return { generate, isGenerating };
}

