import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface VideoGenerationOptions {
  templateId?: string;
  templateSlug?: string;
  startImage: Blob;
  duration?: string;
  variables?: Record<string, string>;
}

export interface VideoGenerationResult {
  url: string;
  key: string;
  credits: number;
}

export function useAsyncVideoGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (
    options: VideoGenerationOptions,
    callbacks?: {
      onComplete?: (result: VideoGenerationResult) => void | Promise<void>;
      onError?: (error: string) => void;
      onInsufficientCredits?: () => void;
    }
  ) => {
    setIsGenerating(true);
    
    try {
      // Start async video generation with multipart form data
      const formData = new FormData();
      const file = new File([options.startImage], `start-frame-${Date.now()}.png`, { type: 'image/png' });
      formData.append('startImage', file);
      
      const { startImage: _startImage, ...restOptions } = options;
      formData.append('data', JSON.stringify(restOptions));
      
      const resp = await fetch('/api/templates/video', {
        method: 'POST',
        body: formData
      });
      
      const out = await resp.json().catch(() => ({}));
      
      if (resp.status === 402) {
        callbacks?.onInsufficientCredits?.();
        setIsGenerating(false);
        return null;
      }
      
      if (!resp.ok || !out?.jobId) {
        console.error('[VIDEO] Failed to start:', out);
        const errorMsg = out?.error || 'Video generation failed to start.';
        toast.error(errorMsg);
        callbacks?.onError?.(errorMsg);
        setIsGenerating(false);
        return null;
      }
      
      const jobId = out.jobId;
      console.log('[VIDEO] Job started:', jobId);
      
      // Poll for completion
      const pollInterval = 3000; // Poll every 3 seconds
      const maxPolls = 200; // Max 10 minutes (200 * 3s = 600s)
      let pollCount = 0;
      
      const poll = async (): Promise<VideoGenerationResult | null> => {
        if (pollCount >= maxPolls) {
          console.log('[VIDEO] Max polls reached, video may still be generating');
          toast.info('Video is still generating. Check your library in a few minutes.');
          setIsGenerating(false);
          return null;
        }
        pollCount++;
        
        try {
          const statusResp = await fetch(`/api/templates/video/status?jobId=${encodeURIComponent(jobId)}`);
          const statusData = await statusResp.json().catch(() => ({}));
          
          console.log(`[VIDEO] Poll ${pollCount}: status=${statusData.status}`);
          
          if (statusResp.status === 402) {
            callbacks?.onInsufficientCredits?.();
            setIsGenerating(false);
            return null;
          }
          
          if (statusData.status === 'completed') {
            const result: VideoGenerationResult = {
              url: String(statusData.url),
              key: String(statusData.key || ''),
              credits: statusData.credits || 0
            };
            console.log('[VIDEO] Generation complete:', result.key);
            setIsGenerating(false);
            
            await callbacks?.onComplete?.(result);
            return result;
          }
          
          if (statusData.status === 'failed') {
            const errorMsg = statusData.error || 'Video generation failed.';
            console.error('[VIDEO] Generation failed:', errorMsg);
            toast.error(errorMsg);
            callbacks?.onError?.(errorMsg);
            setIsGenerating(false);
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
          console.error('[VIDEO] Error polling status:', pollErr);
          // Continue polling even on error - might be transient network issue
          return new Promise((resolve) => {
            setTimeout(async () => {
              const result = await poll();
              resolve(result);
            }, pollInterval);
          });
        }
      };
      
      // Start polling immediately
      return await poll();
      
    } catch (err) {
      console.error('[VIDEO] Unexpected error:', err);
      toast.error('An unexpected error occurred. Please try again.');
      callbacks?.onError?.('An unexpected error occurred');
      setIsGenerating(false);
      return null;
    }
  }, []);

  return {
    generate,
    isGenerating
  };
}

