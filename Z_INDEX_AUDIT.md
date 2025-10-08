# Z-Index Audit & Normalization Plan

## Current Usage Summary

### Usage Counts
- `-z-10`: 11 instances
- `z-0`: 84 instances  
- `z-10`: 571 instances (most common)
- `z-20`: 104 instances
- `z-30`: 79 instances
- `z-40`: 17 instances
- `z-50`: 134 instances

### Current Semantic Hierarchy

#### `-z-10` - Background Elements (11 uses)
- Decorative backgrounds that should be behind all content
- Examples: gradient backgrounds in error pages, decorative elements

#### `z-0` - Base Layer (84 uses)
- Base content layer
- Neutral positioning
- Electric border component base, carousel base elements

#### `z-10` - Content Overlays (571 uses)
**Most common layer** - Used for:
- Badges and labels on images
- Selection checkboxes on thumbnails
- Icon overlays on cards
- Controls on transform handles
- Loading skeletons
- General overlays that need to appear above content

#### `z-20` - Sticky Headers & Secondary Overlays (104 uses)
- Sticky headers in content tabs
- Secondary overlays that need to appear above z-10 elements
- Close buttons on carousels
- Electric border on desktop (md breakpoint)
- Control bars in layer editor

#### `z-30` - Mid-Level Components (79 uses)
- Phone component internal layers
- Folder component internal stacking
- Mid-level UI components with complex internal structure

#### `z-40` - Mobile Panels (17 uses)
- Mobile sidebar panels (showroom channels, members)
- Phone component status bar area
- Components that need to overlay most content on mobile

#### `z-50` - Top-Level Overlays (134 uses)
**Second most common** - Used for:
- Modals and dialogs
- Dropdown menus
- Tooltips
- Popovers
- Mention autocomplete
- Selection rectangles
- Phone component top interactive layer
- Any UI that should appear above everything else

## Analysis

### Current System Characteristics
✅ **Pros:**
- Clear hierarchical separation
- Follows Tailwind's default scale
- Proper ordering (no conflicts)
- Room for insertion between levels

❌ **Cons:**
- **Jumps are too large** (increments of 10)
- Could cause confusion (why 10 vs 20?)
- Waste of numeric space
- Not semantic enough

### Recommended Normalization

Instead of 10-unit jumps, use a **tighter, more semantic scale**:

```
-1: Backgrounds (behind content)
 0: Base layer (default)
 1: Content overlays (badges, labels, controls)
 2: Sticky headers, secondary overlays
 3: Mid-level components
 4: Mobile panels, drawers
 5: Modals, dropdowns, tooltips (top-level)
```

This provides:
- **Cleaner mental model** (single digits)
- **Same separation** (5 distinct levels)
- **Room to grow** (can add 1.5, 2.5 if needed using arbitrary values)
- **More intuitive** (lower = further back, higher = more forward)

## Migration Strategy

### Option A: Gradual Migration (Recommended)
1. Add custom z-index scale to Tailwind config
2. Migrate components file-by-file
3. Test each component after migration
4. Can be done incrementally over time

### Option B: Big Bang Migration
1. Global find/replace for each level
2. Thorough testing required
3. Higher risk but faster completion

### Custom Tailwind Config
```typescript
// tailwind.config.ts
theme: {
  extend: {
    zIndex: {
      'background': '-1',
      'base': '0',
      'overlay': '1',
      'sticky': '2',
      'component': '3',
      'panel': '4',
      'modal': '5',
    }
  }
}
```

## Mapping Table

| Current | New | Semantic Name | Usage |
|---------|-----|---------------|-------|
| `-z-10` | `-z-1` or `z-background` | Background | Decorative backgrounds |
| `z-0` | `z-0` or `z-base` | Base | Base layer |
| `z-10` | `z-1` or `z-overlay` | Overlay | Badges, labels, controls |
| `z-20` | `z-2` or `z-sticky` | Sticky | Sticky headers |
| `z-30` | `z-3` or `z-component` | Component | Complex components |
| `z-40` | `z-4` or `z-panel` | Panel | Mobile panels |
| `z-50` | `z-5` or `z-modal` | Modal | Modals, dropdowns |

## Next Steps

1. **Decision**: Choose migration strategy
2. **Config**: Update Tailwind config with new scale
3. **Migrate**: Update components using chosen strategy
4. **Test**: Verify no visual regressions
5. **Document**: Update component guidelines

## Questions to Consider

1. Do you want to use semantic names (z-modal) or numeric (z-5)?
2. Should we migrate all at once or incrementally?
3. Are there any specific components that need special attention during migration?

