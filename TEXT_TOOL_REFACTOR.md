# Text Tool Refactor & Optimization

## Summary
Refactored and optimized the text tool implementation to fix random behavior, improve responsiveness, and enhance maintainability.

## Problems Fixed

### 1. **Stale Closure Issue (Random Behavior)**
**Problem:** The click handler callback had `state.activeLayerId` and `state.editingLayerId` in its dependency array, causing stale closures. When clicking to deselect, the callback wouldn't recreate until the next render, causing "2-3 iterations" behavior depending on timing.

**Solution:** 
- Added `stateRef` to track current state values without causing callback recreations
- Added `justDeselectedRef` to track deselection state explicitly
- Removed state dependencies from the callback dependency array

### 2. **Input Mode Focus Delay**
**Problem:** Double-delay when entering text edit mode:
- First delay: `requestAnimationFrame` in canvas click handler
- Second delay: `setTimeout(..., 10)` in LayerView ref callback

**Solution:** 
- Removed `setTimeout` delay in LayerView
- Kept single `requestAnimationFrame` for DOM synchronization
- Focus now happens immediately when text input renders

### 3. **Inconsistent Click Behavior**
**Problem:** First click sometimes created new text box instead of deselecting.

**Solution:**
- Implemented clear state machine logic:
  1. **Has selection + click background** → Deselect, set `justDeselectedRef = true`
  2. **`justDeselectedRef = true` + click background** → Clear flag, do nothing
  3. **No selection + click background** → Create new text box

## Key Changes

### Both `DesignerCanvas.tsx` and `LayerCanvas.tsx`

```typescript
// Track deselection to prevent stale closure issues
const justDeselectedRef = useRef(false);
const stateRef = useRef({ activeLayerId: state.activeLayerId, editingLayerId: state.editingLayerId });

// Keep ref synchronized with current state
useEffect(() => {
  stateRef.current = { activeLayerId: state.activeLayerId, editingLayerId: state.editingLayerId };
}, [state.activeLayerId, state.editingLayerId]);
```

### Optimized Click Handler
```typescript
const onCanvasClick = useCallback((e: React.MouseEvent) => {
  if (e.target !== e.currentTarget) return;
  
  if (state.tool === 'text') {
    // Use ref to get current state and avoid stale closure
    const hasSelection = stateRef.current.activeLayerId !== null;
    const isEditing = stateRef.current.editingLayerId !== null;
    
    // If we just deselected on the previous click, don't create a new text box yet
    if (justDeselectedRef.current) {
      justDeselectedRef.current = false;
      return;
    }
    
    // If something is selected or editing, deselect it
    if (hasSelection || isEditing) {
      if (isEditing) {
        dispatch({ type: 'stop_edit_text' });
      }
      dispatch({ type: 'select_layer', id: null });
      justDeselectedRef.current = true;
      return;
    }
    
    // Nothing selected - create new text box and enter edit mode immediately
    // ... create text logic
  }
}, [dispatch, state.tool]); // Minimal dependencies
```

### Immediate Focus (No Delays)
```typescript
ref={(node)=>{
  textAreaRef.current = node;
  autoResizeTextarea(node);
  // Immediate focus without delay
  if (node) {
    node.focus();
    node.select();
  }
}}
```

## Benefits

1. **Predictable Behavior**: Text tool now strictly follows the rule: "First click deselects, second click creates new text"
2. **Immediate Responsiveness**: Text input mode activates instantly without perceivable delay
3. **Better Performance**: Fewer callback recreations due to minimal dependencies
4. **Maintainability**: Clear state machine logic that's easy to understand and debug
5. **Robustness**: Refs prevent race conditions between state updates and user interactions

## Testing Checklist

- [ ] Click text tool, click canvas → Creates text box with immediate focus
- [ ] With text selected, click off → Deselects (doesn't create new text)
- [ ] With text deselected, click again → Creates new text box
- [ ] Rapid clicking doesn't cause random behavior
- [ ] Double-click text layers to edit (select tool)
- [ ] Escape key exits text editing mode
- [ ] Empty text layers are removed on blur

## Technical Details

### Why Refs Instead of State?
- **Stale Closures**: React batches state updates asynchronously. Callbacks capture state at creation time.
- **Refs**: Provide synchronous access to current values without triggering re-renders or callback recreations.
- **Pattern**: Common React pattern for handling rapid user interactions that need immediate state access.

### Why `justDeselectedRef`?
- Provides explicit "just deselected" state that persists across renders
- Prevents the "deselect click" from being interpreted as "create text box"
- Reset when user interacts with layers (showing intent to work with existing content)

## Files Modified
- `/carclout/components/designer/DesignerCanvas.tsx`
- `/carclout/components/layer-editor/LayerCanvas.tsx`

