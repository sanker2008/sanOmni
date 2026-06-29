# sanLabs PNG to SVG

## Status
Implemented. Last updated: 2026-06-29.

## Overview
PNG to SVG is a local sanLabs tool for converting bitmap images into SVG output through `imagetracerjs`. It is intended for flat icons, illustrations, logos, and other images where editable vector output is useful.

## Current Behavior
- Supports JPG, PNG, and WebP input through the shared local file picker.
- Keeps conversion local in the client; no third-party API is required for this tool.
- Provides tunable tracing parameters for color count, color merge ratio, blur radius, path omission, line smoothing, curve smoothing, and right-angle enhancement.
- Renders the generated SVG preview through an encoded SVG data URL so the preview matches the export content and avoids blank inline-SVG rendering.
- Provides side-by-side source and SVG previews.
- Mouse wheel zooms the active preview pane without showing scrollbars or scrolling the parent view.
- Left mouse drag pans the preview content.
- The preview reset control restores zoom to 100% and returns the view to the original position.
- Generated results can be cleared without removing the selected source image.
- SVG output can be saved to the sanLabs output folder.

## UX Notes
- The zoom badge in the preview corner doubles as the reset action and displays the current zoom percentage.
- Preview content disables native browser image dragging so pointer movement is handled by the preview pane.
- The SVG preview uses an `<img>` backed by a data URL rather than `dangerouslySetInnerHTML`; this keeps pointer handling consistent between the source image and generated SVG.

## Related Files
- `src/components/lab/png-to-svg/PngToSvg.tsx`
- `src/components/lab/LabView.tsx`
