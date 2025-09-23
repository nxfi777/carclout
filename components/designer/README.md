# Designer Components

These components implement a simple layer-based image designer with a vertical toolbox, per-tool options bar, effects dropdown, transform controls, and a Photoshop-like selection.

Key files:

- `DesignerProvider.tsx`: Global store (tool, layers, selection)
- `DesignerShell.tsx`: Layout wiring toolbox, options, and canvas
- `DesignerCanvas.tsx`: Renders background, layers, optional car mask, and context menu
- `Toolbox.tsx`: Primary tools (select, text, marquee, shape, image, fill)
- `ToolOptionsBar.tsx`: Sub toolbars and Effects dropdown (shadow, glow)
- `TransformControls.tsx`: Resize handles for selected layer
- `MarqueeOverlay.tsx`: Drag to create rectangles/ellipses for shapes/fill
- `AddViaToolInteractions.tsx`: Double-click/paste helpers

Usage:

- Navigate to `/design`
- Double-click canvas with Text/Shape tool to add
- Drag selection to move; resize via corner handles
- Right-click for z-order and delete; use Effects to add glow/shadow
