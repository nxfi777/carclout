"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLayerEditor } from "./LayerEditorProvider";
import type { BrushStroke } from "@/types/layer-editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Sparkles, Undo2, Redo2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import CreditDepletionDrawer from "@/components/credit-depletion-drawer";
import { useCreditDepletion } from "@/lib/use-credit-depletion";

// Debug flag - set to true to show bounding box preview and image preview
const DEBUG_MODE = false;

export default function DrawToEditOverlay() {
  const { state, dispatch } = useLayerEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [strokeHistory, setStrokeHistory] = useState<BrushStroke[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const creditDepletion = useCreditDepletion();
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 1920, height: 1080 });
  const [canvasStyle, setCanvasStyle] = useState<{ width: string; height: string; left: string; top: string }>({ 
    width: '100%', 
    height: '100%', 
    left: '0', 
    top: '0' 
  });
  const previousBackgroundUrlRef = useRef<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processingJobRef = useRef<boolean>(false);

  const isBrushTool = state.tool === 'brush';
  const annotation = state.drawToEditAnnotation;
  
  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      processingJobRef.current = false;
    };
  }, []);

  // Load background image and set canvas to match its dimensions and position
  useEffect(() => {
    if (!state.backgroundUrl) return;
    
    // Check if background actually changed
    const backgroundChanged = previousBackgroundUrlRef.current !== state.backgroundUrl;
    previousBackgroundUrlRef.current = state.backgroundUrl;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;
      
      // Get the actual displayed size of the background image (which uses object-contain)
      const bgImg = document.querySelector('[data-canvas-root] img[alt="bg"]') as HTMLImageElement | null;
      if (bgImg) {
        // The background image uses object-contain, so we need to calculate its actual displayed size and position
        const containerRect = bgImg.parentElement?.getBoundingClientRect();
        if (containerRect) {
          const containerAspect = containerRect.width / containerRect.height;
          const imageAspect = imgWidth / imgHeight;
          
          let displayWidth, displayHeight, offsetX, offsetY;
          if (imageAspect > containerAspect) {
            // Image is wider - constrained by width
            displayWidth = containerRect.width;
            displayHeight = containerRect.width / imageAspect;
            offsetX = 0;
            offsetY = (containerRect.height - displayHeight) / 2;
          } else {
            // Image is taller - constrained by height
            displayHeight = containerRect.height;
            displayWidth = containerRect.height * imageAspect;
            offsetX = (containerRect.width - displayWidth) / 2;
            offsetY = 0;
          }
          
          console.log('[DrawToEditOverlay] Canvas setup:', {
            original: { width: imgWidth, height: imgHeight },
            container: { width: containerRect.width, height: containerRect.height },
            display: { width: displayWidth, height: displayHeight },
            offset: { x: offsetX, y: offsetY }
          });
          
          // Set canvas to match image dimensions (for high-quality drawing)
          setCanvasDimensions({ width: imgWidth, height: imgHeight });
          
          // Set canvas style to match the displayed image size and position
          setCanvasStyle({
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            left: `${offsetX}px`,
            top: `${offsetY}px`
          });
        } else {
          setCanvasDimensions({ width: imgWidth, height: imgHeight });
          setCanvasStyle({ width: '100%', height: '100%', left: '0', top: '0' });
        }
      } else {
        setCanvasDimensions({ width: imgWidth, height: imgHeight });
        setCanvasStyle({ width: '100%', height: '100%', left: '0', top: '0' });
      }
      
      // Clear any existing strokes when background changes
      // (coordinates would be invalid for new dimensions)
      if (backgroundChanged && annotation?.strokes && annotation.strokes.length > 0) {
        console.log('[DrawToEditOverlay] Clearing strokes due to background change');
        dispatch({ type: 'clear_draw_to_edit' });
        setStrokeHistory([]);
        setHistoryIndex(-1);
      }
    };
    img.onerror = (e) => {
      console.error('[DrawToEditOverlay] Failed to load background image:', state.backgroundUrl, e);
      // Fallback to default dimensions
      setCanvasDimensions({ width: 1920, height: 1080 });
      setCanvasStyle({ width: '100%', height: '100%', left: '0', top: '0' });
    };
    // Note: We don't set crossOrigin here because we're only reading dimensions,
    // not drawing to canvas or reading pixel data. This avoids CORS issues with R2.
    img.src = state.backgroundUrl;
  }, [state.backgroundUrl, annotation, dispatch]);

  // Initialize annotation when brush tool is activated
  useEffect(() => {
    if (isBrushTool && !annotation) {
      dispatch({ type: 'start_draw_to_edit' });
    }
  }, [isBrushTool, annotation, dispatch]);

  // Update canvas position/size on window resize
  useEffect(() => {
    if (!state.backgroundUrl) return;
    
    const updateCanvasPosition = () => {
      const bgImg = document.querySelector('[data-canvas-root] img[alt="bg"]') as HTMLImageElement | null;
      if (!bgImg) return;
      
      const containerRect = bgImg.parentElement?.getBoundingClientRect();
      if (!containerRect) return;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const containerAspect = containerRect.width / containerRect.height;
      const imageAspect = canvas.width / canvas.height;
      
      let displayWidth, displayHeight, offsetX, offsetY;
      if (imageAspect > containerAspect) {
        displayWidth = containerRect.width;
        displayHeight = containerRect.width / imageAspect;
        offsetX = 0;
        offsetY = (containerRect.height - displayHeight) / 2;
      } else {
        displayHeight = containerRect.height;
        displayWidth = containerRect.height * imageAspect;
        offsetX = (containerRect.width - displayWidth) / 2;
        offsetY = 0;
      }
      
      setCanvasStyle({
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
        left: `${offsetX}px`,
        top: `${offsetY}px`
      });
    };
    
    window.addEventListener('resize', updateCanvasPosition);
    return () => window.removeEventListener('resize', updateCanvasPosition);
  }, [state.backgroundUrl]);

  const handleUndoStroke = useCallback(() => {
    if (!annotation || historyIndex < 0) return;
    
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    
    // Update annotation with strokes up to new index
    const newStrokes = strokeHistory.slice(0, newIndex + 1);
    if (newStrokes.length === 0) {
      dispatch({ type: 'clear_draw_to_edit' });
      dispatch({ type: 'start_draw_to_edit' });
    } else {
      // Rebuild annotation with new strokes
      dispatch({ type: 'clear_draw_to_edit' });
      dispatch({ type: 'start_draw_to_edit' });
      newStrokes.forEach(stroke => {
        dispatch({ type: 'add_brush_stroke', stroke });
      });
    }
  }, [annotation, historyIndex, strokeHistory, dispatch]);

  const handleRedoStroke = useCallback(() => {
    if (!annotation || historyIndex >= strokeHistory.length - 1) return;
    
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    
    // Add the next stroke
    const stroke = strokeHistory[newIndex];
    if (stroke) {
      dispatch({ type: 'add_brush_stroke', stroke });
    }
  }, [annotation, historyIndex, strokeHistory, dispatch]);

  // Keyboard shortcuts for stroke undo/redo (when drawing)
  useEffect(() => {
    if (!isBrushTool) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleUndoStroke();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z' && !e.altKey) {
        e.preventDefault();
        handleRedoStroke();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBrushTool, handleUndoStroke, handleRedoStroke]);


  // Sync stroke history with annotation
  useEffect(() => {
    if (annotation?.strokes) {
      setStrokeHistory(annotation.strokes);
      setHistoryIndex(annotation.strokes.length - 1);
    }
  }, [annotation?.strokes]);

  const calculateBoundingBox = useCallback((includeCurrentStroke = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    // Determine if we have any strokes to process
    const hasStrokes = annotation && annotation.strokes.length > 0;
    const hasCurrentStroke = includeCurrentStroke && currentStroke.length > 0;
    
    // If no strokes, return the full canvas as bounding box
    if (!hasStrokes && !hasCurrentStroke) {
      return {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Process finalized strokes
    if (annotation?.strokes) {
      annotation.strokes.forEach((stroke) => {
        // Stroke width is already in canvas coordinates
        const halfWidth = stroke.width / 2;
        
        stroke.points.forEach((point) => {
          minX = Math.min(minX, point.x - halfWidth);
          minY = Math.min(minY, point.y - halfWidth);
          maxX = Math.max(maxX, point.x + halfWidth);
          maxY = Math.max(maxY, point.y + halfWidth);
        });
      });
    }

    // Process current stroke being drawn (for preview)
    if (includeCurrentStroke && currentStroke.length > 0) {
      // Scale brush size from display to canvas coordinates for current stroke
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaledBrushSize = brushSize * scaleX;
      const halfWidth = scaledBrushSize / 2;
      
      currentStroke.forEach((point) => {
        minX = Math.min(minX, point.x - halfWidth);
        minY = Math.min(minY, point.y - halfWidth);
        maxX = Math.max(maxX, point.x + halfWidth);
        maxY = Math.max(maxY, point.y + halfWidth);
      });
    }

    // Add padding (in canvas coordinates)
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const padding = 30 * scaleX;
    
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(canvas.width, maxX + padding);
    maxY = Math.min(canvas.height, maxY + padding);

    return {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
    };
  }, [annotation, currentStroke, brushSize]);

  // Draw strokes on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !annotation) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Create a temporary canvas for merging strokes with lighten mode
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Use lighter blend mode to merge ALL strokes together (not per-stroke)
    tempCtx.globalCompositeOperation = 'lighten';

    // Draw all strokes on temp canvas
    annotation.strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      tempCtx.strokeStyle = 'rgba(91, 108, 255, 0.8)'; // More opaque to show better
      tempCtx.lineWidth = stroke.width;
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';

      tempCtx.beginPath();
      tempCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      
      for (let i = 1; i < stroke.points.length; i++) {
        tempCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      
      tempCtx.stroke();
    });

    // Draw current stroke being drawn
    if (currentStroke.length > 1) {
      // Scale brush size from display to canvas coordinates
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaledBrushSize = brushSize * scaleX;
      
      tempCtx.strokeStyle = 'rgba(91, 108, 255, 0.8)';
      tempCtx.lineWidth = scaledBrushSize;
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';

      tempCtx.beginPath();
      tempCtx.moveTo(currentStroke[0].x, currentStroke[0].y);
      
      for (let i = 1; i < currentStroke.length; i++) {
        tempCtx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      
      tempCtx.stroke();
    }

    // Draw the merged result onto main canvas
    ctx.drawImage(tempCanvas, 0, 0);

    // DEBUG: Draw bounding box preview if we have strokes (include current stroke for accurate preview)
    if (DEBUG_MODE && (annotation.strokes.length > 0 || currentStroke.length > 0)) {
      const bbox = calculateBoundingBox(true); // Include current stroke in preview
      if (bbox) {
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
        ctx.setLineDash([]);

        // Draw corner markers
        const markerSize = 10;
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        // Top-left
        ctx.fillRect(bbox.x - 2, bbox.y - 2, markerSize, 4);
        ctx.fillRect(bbox.x - 2, bbox.y - 2, 4, markerSize);
        // Top-right
        ctx.fillRect(bbox.x + bbox.width - markerSize + 2, bbox.y - 2, markerSize, 4);
        ctx.fillRect(bbox.x + bbox.width - 2, bbox.y - 2, 4, markerSize);
        // Bottom-left
        ctx.fillRect(bbox.x - 2, bbox.y + bbox.height - 2, markerSize, 4);
        ctx.fillRect(bbox.x - 2, bbox.y + bbox.height - markerSize + 2, 4, markerSize);
        // Bottom-right
        ctx.fillRect(bbox.x + bbox.width - markerSize + 2, bbox.y + bbox.height - 2, markerSize, 4);
        ctx.fillRect(bbox.x + bbox.width - 2, bbox.y + bbox.height - markerSize + 2, 4, markerSize);
      }
    }
  }, [annotation, currentStroke, brushSize, calculateBoundingBox]);

  const getCanvasPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    
    // Canvas now directly matches the displayed image, so simple scaling works
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isBrushTool) return;
    
    const point = getCanvasPoint(e);
    if (!point) return;

    setIsDrawing(true);
    setCurrentStroke([point]);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [isBrushTool, getCanvasPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isBrushTool) return;

    const point = getCanvasPoint(e);
    if (!point) return;

    setCurrentStroke(prev => [...prev, point]);
  }, [isDrawing, isBrushTool, getCanvasPoint]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isBrushTool) return;

    const point = getCanvasPoint(e);
    if (point) {
      const finalStroke = [...currentStroke, point];
      
      // Calculate scaled brush width (from display pixels to canvas pixels)
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const scaleX = canvas && rect ? canvas.width / rect.width : 1;
      const scaledBrushSize = brushSize * scaleX;
      
      // Add stroke to annotation with scaled width
      const stroke: BrushStroke = {
        points: finalStroke,
        color: 'rgba(91, 108, 255, 0.5)',
        width: scaledBrushSize, // Use scaled width in canvas coordinates
      };
      
      dispatch({ type: 'add_brush_stroke', stroke });
      
      // Update history for undo/redo
      const newHistory = [...strokeHistory.slice(0, historyIndex + 1), stroke];
      setStrokeHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }

    setIsDrawing(false);
    setCurrentStroke([]);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, [isDrawing, isBrushTool, currentStroke, brushSize, getCanvasPoint, dispatch, strokeHistory, historyIndex]);

  const handleDone = useCallback(async () => {
    if (!annotation) return;

    // Allow clicking Done even without drawing - use whole canvas if no strokes
    const bbox = calculateBoundingBox(false); // Don't include current stroke (should be empty by now)
    if (!bbox) return;

    // Log bounding box and scaling info for debugging
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      console.log('[DrawToEditOverlay] Bounding box calculated:', {
        bbox,
        canvasSize: { width: canvas.width, height: canvas.height },
        displaySize: { width: rect.width, height: rect.height },
        scale: { scaleX, scaleY },
        strokeCount: annotation.strokes.length,
        strokeWidths: annotation.strokes.map(s => s.width)
      });

      // Generate preview of the cropped region
      try {
        console.log('[DrawToEditOverlay] Starting preview generation...');
        const bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          bgImg.onload = () => {
            console.log('[DrawToEditOverlay] Background image loaded for preview');
            resolve();
          };
          bgImg.onerror = (err) => {
            console.error('[DrawToEditOverlay] Failed to load background image:', err);
            reject(err);
          };
          bgImg.src = state.backgroundUrl || '';
        });

        const imgWidth = bgImg.naturalWidth || bgImg.width;
        const imgHeight = bgImg.naturalHeight || bgImg.height;
        console.log('[DrawToEditOverlay] Image dimensions:', { imgWidth, imgHeight });

        // Create a temporary canvas matching the image size
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgWidth;
        tempCanvas.height = imgHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) throw new Error('Failed to get context');

        // Draw the background image
        tempCtx.drawImage(bgImg, 0, 0, imgWidth, imgHeight);

        // Extract the bounding box region
        const { x, y, width, height } = bbox;
        console.log('[DrawToEditOverlay] Extracting region:', { x, y, width, height });
        
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = width;
        previewCanvas.height = height;
        const previewCtx = previewCanvas.getContext('2d');
        if (!previewCtx) throw new Error('Failed to get preview context');

        previewCtx.drawImage(tempCanvas, x, y, width, height, 0, 0, width, height);
        
        const previewUrl = previewCanvas.toDataURL('image/png');
        console.log('[DrawToEditOverlay] Preview URL generated, length:', previewUrl.length);
        setPreviewImageUrl(previewUrl);
      } catch (error) {
        console.error('[DrawToEditOverlay] Failed to generate preview:', error);
        setPreviewImageUrl(null);
      }
    }

    dispatch({ type: 'finalize_draw_to_edit', boundingBox: bbox });
    setShowPromptDialog(true);
  }, [annotation, calculateBoundingBox, dispatch, state.backgroundUrl]);

  const handleClear = useCallback(() => {
    dispatch({ type: 'clear_draw_to_edit' });
    setCurrentStroke([]);
    setStrokeHistory([]);
    setHistoryIndex(-1);
  }, [dispatch]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!annotation?.boundingBox) {
      toast.error('No area selected');
      return;
    }

    // Check credits before generating (90 base + potential 10 for car overlap)
    try {
      const creditsResponse = await fetch('/api/credits', { cache: 'no-store' });
      const creditsData = await creditsResponse.json();
      const currentCredits = typeof creditsData?.credits === 'number' ? creditsData.credits : 0;
      
      // Estimate max cost (100 credits in case of car overlap)
      const maxCost = 100;
      const insufficientCredits = creditDepletion.checkAndTrigger(currentCredits, maxCost);
      
      if (insufficientCredits) {
        return;
      }
    } catch (error) {
      console.error('Failed to check credits:', error);
      // Continue anyway - the API will handle the credit check
    }

    setIsGenerating(true);
    
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not found');

      // Get the actual background image
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        bgImg.onload = () => resolve();
        bgImg.onerror = reject;
        bgImg.src = state.backgroundUrl || '';
      });

      const imgWidth = bgImg.naturalWidth || bgImg.width;
      const imgHeight = bgImg.naturalHeight || bgImg.height;

      console.log('[draw-to-edit] Image and canvas dimensions:', { 
        imgWidth, 
        imgHeight, 
        canvasWidth: canvas.width, 
        canvasHeight: canvas.height,
        match: imgWidth === canvas.width && imgHeight === canvas.height
      });

      // Create a temporary canvas matching the image size for the full image
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imgWidth;
      tempCanvas.height = imgHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Failed to get context');

      // Draw the background image at its natural size
      tempCtx.drawImage(bgImg, 0, 0, imgWidth, imgHeight);
      
      const originalImageDataUrl = tempCanvas.toDataURL('image/png');

      // Canvas now matches image dimensions, so bounding box is already in image coordinates!
      const { x, y, width, height } = annotation.boundingBox;

      console.log('[draw-to-edit] Bounding box (image coordinates):', annotation.boundingBox);
      
      // Extract the annotated region
      const regionCanvas = document.createElement('canvas');
      regionCanvas.width = width;
      regionCanvas.height = height;
      const regionCtx = regionCanvas.getContext('2d');
      if (!regionCtx) throw new Error('Failed to get region context');
      
      regionCtx.drawImage(tempCanvas, x, y, width, height, 0, 0, width, height);
      const regionDataUrl = regionCanvas.toDataURL('image/png');

      // Call API with bounding box in image coordinates
      console.log('[draw-to-edit] Calling API');
      
      const response = await fetch('/api/tools/draw-to-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          imageDataUrl: regionDataUrl,
          boundingBox: annotation.boundingBox, // Already in image coordinates
          originalImageDataUrl,
          carMaskUrl: state.carMaskUrl,
        }),
      });

      let result;
      try {
        const text = await response.text();
        console.log('[draw-to-edit] API response text:', text.substring(0, 200));
        result = text ? JSON.parse(text) : { error: 'Empty response' };
      } catch (parseError) {
        console.error('[draw-to-edit] Failed to parse response:', parseError);
        result = { error: 'Invalid JSON response' };
      }

      // Handle insufficient credits from API response
      if (response.status === 402) {
        const currentCredits = result.currentCredits || 0;
        const requiredCredits = result.requiredCredits || 90;
        creditDepletion.checkAndTrigger(currentCredits, requiredCredits);
        return;
      }

      if (!response.ok) {
        const errorMessage = result.error || result.message || `Failed to generate (${response.status})`;
        console.error('Draw-to-edit API error:', { 
          status: response.status, 
          statusText: response.statusText,
          result 
        });
        throw new Error(errorMessage);
      }
      
      // Handle async response - job has been queued
      if (result.status === 'pending' && result.jobId) {
        const jobId = result.jobId;
        const credits = result.credits;
        console.log(`[draw-to-edit] Job queued: ${jobId}, credits: ${credits}`);
        
        // Clear any existing polling interval
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        
        // Reset processing flag
        processingJobRef.current = false;
        
        // Poll for completion
        pollIntervalRef.current = setInterval(async () => {
          try {
            // Skip if we're already processing a completion
            if (processingJobRef.current) {
              return;
            }
            
            const statusResponse = await fetch(`/api/tools/status?jobId=${jobId}`);
            if (!statusResponse.ok) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setIsGenerating(false);
              toast.error('Failed to check job status');
              return;
            }
            
            const statusResult = await statusResponse.json();
            console.log(`[draw-to-edit] Job ${jobId} status:`, statusResult.status);
            
            if (statusResult.status === 'completed') {
              // Set flag to prevent duplicate processing
              processingJobRef.current = true;
              
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              
              // Use the key to construct proper API URL instead of direct R2 URL
              const resultUrl = statusResult.key 
                ? `/api/storage/file?key=${encodeURIComponent(statusResult.key)}`
                : statusResult.url;
              
              // Apply the result
              dispatch({
                type: 'apply_draw_to_edit_result',
                newBackgroundUrl: resultUrl,
                originalImageDataUrl,
              });

              setShowPromptDialog(false);
              setPrompt('');
              setPreviewImageUrl(null);
              dispatch({ type: 'set_tool', tool: 'select' });
              setIsGenerating(false);
              
              // Refresh credits
              try {
                window.dispatchEvent(new CustomEvent('credits-refresh'));
              } catch {}
              
            } else if (statusResult.status === 'failed') {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setIsGenerating(false);
              toast.error(statusResult.error || 'Generation failed');
            }
            // Otherwise keep polling (status is 'pending' or 'processing')
          } catch (pollError) {
            console.error('Error polling job status:', pollError);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsGenerating(false);
            toast.error('Failed to check job status');
          }
        }, 2000); // Poll every 2 seconds
        
        return; // Don't execute the old sync code below, keep isGenerating true while polling
      }
      
      // Fallback: Handle old synchronous response format (shouldn't happen anymore)
      if (result.resultUrl) {
        dispatch({
          type: 'apply_draw_to_edit_result',
          newBackgroundUrl: result.resultUrl,
          originalImageDataUrl,
        });

        // Update car mask if it was re-cut
        if (result.newCarMaskUrl) {
          dispatch({ type: 'set_mask', url: result.newCarMaskUrl });
        }

        setShowPromptDialog(false);
        setPrompt('');
        setPreviewImageUrl(null);
        dispatch({ type: 'set_tool', tool: 'select' });
        setIsGenerating(false);
      } else {
        // Unknown response format
        setIsGenerating(false);
      }
    } catch (error) {
      console.error('Draw-to-edit error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate edit');
      setIsGenerating(false);
    }
  }, [prompt, annotation, state.backgroundUrl, state.carMaskUrl, dispatch, creditDepletion]);

  if (!isBrushTool || !annotation) return null;

  return (
    <>
      {/* Loading overlay during generation */}
      {isGenerating && (
        <div className="absolute inset-0 bg-black/50 z-2 flex items-center justify-center pointer-events-auto">
          <div className="bg-[var(--card)] rounded-lg p-6 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <div className="text-white text-sm font-medium">Generating your edit...</div>
            <div className="text-white/70 text-xs">This may take a moment</div>
          </div>
        </div>
      )}

      {/* Overlay canvas for drawing */}
      <canvas
        ref={canvasRef}
        className="absolute pointer-events-auto cursor-crosshair touch-none"
        data-draw-to-edit-canvas
        width={canvasDimensions.width}
        height={canvasDimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ 
          opacity: 0.8,
          width: canvasStyle.width,
          height: canvasStyle.height,
          left: canvasStyle.left,
          top: canvasStyle.top
        }}
      />

      {/* Control panel */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-4 z-1 pointer-events-auto">
        {/* Left side: Brush size */}
        <div className="flex items-center gap-3 bg-[var(--card)] rounded-lg px-4 py-2 border border-[var(--border)] shadow-sm">
          <span className="text-sm text-white/70 whitespace-nowrap">Brush Size</span>
          <Slider
            value={[brushSize]}
            onValueChange={(value) => setBrushSize(value[0])}
            min={5}
            max={50}
            step={1}
            className="w-32"
          />
          <span className="text-sm text-white font-medium w-8 text-right">{brushSize}</span>
        </div>

        {/* Right side: Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndoStroke}
            disabled={historyIndex < 0}
            title="Undo stroke (Cmd/Ctrl+Z)"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRedoStroke}
            disabled={historyIndex >= strokeHistory.length - 1}
            title="Redo stroke (Cmd/Ctrl+Shift+Z)"
          >
            <Redo2 className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!annotation.strokes.length}
          >
            <X className="size-4 mr-2" />
            Clear
          </Button>
          <Button
            size="sm"
            onClick={handleDone}
          >
            <Sparkles className="size-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Prompt dialog */}
      <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>What should we change on this car?</DialogTitle>
            <DialogDescription>
              Describe the exact tweak you want in the selected area. For example: &quot;switch the paint to satin red&quot; or &quot;turn these wheels matte black&quot;
            </DialogDescription>
          </DialogHeader>
          
          {/* DEBUG: Preview of the cropped region */}
          {DEBUG_MODE && (
            <div className="border border-border rounded-lg overflow-hidden bg-black/20">
              <div className="text-xs text-white/60 px-3 py-2 border-b border-border bg-black/30 flex items-center justify-between">
                <span>Preview of selected region:</span>
                {annotation?.boundingBox && (
                  <span className="font-mono text-white/40">
                    {annotation.boundingBox.width} × {annotation.boundingBox.height}px
                  </span>
                )}
              </div>
              {previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={previewImageUrl} 
                  alt="Preview of selected region" 
                  className="w-full h-auto max-h-[300px] object-contain bg-black/10"
                />
              ) : (
                <div className="flex items-center justify-center h-32 text-white/40 text-sm">
                  Generating preview...
                </div>
              )}
            </div>
          )}
          
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., add a forged carbon hood or brighten the headlights..."
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPromptDialog(false);
                setPrompt('');
                setPreviewImageUrl(null);
              }}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}>
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit depletion drawer */}
      <CreditDepletionDrawer
        open={creditDepletion.isOpen}
        onOpenChange={creditDepletion.close}
        currentPlan={creditDepletion.currentPlan}
        creditsRemaining={creditDepletion.creditsRemaining}
        requiredCredits={creditDepletion.requiredCredits}
      />
    </>
  );
}

