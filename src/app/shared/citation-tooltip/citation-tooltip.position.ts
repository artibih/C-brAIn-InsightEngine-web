
export interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}








export interface CitationTooltipPlacement {
  left: number;
  top: number | null;
  bottom: number | null;
  maxHeight: number;
}


const TOOLTIP_WIDTH = 380;

const GAP = 8;

const EDGE_MARGIN = 12;

const PREFERRED_HEIGHT = 360;

const MIN_HEIGHT = 160;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);


export const DEFAULT_CITATION_TOOLTIP_PLACEMENT: CitationTooltipPlacement = {
  left: 0,
  top: 0,
  bottom: null,
  maxHeight: PREFERRED_HEIGHT,
};






export function placeCitationTooltip(
  anchor: AnchorRect,
  viewport: { width: number; height: number },
): CitationTooltipPlacement {
  const spaceBelow = viewport.height - anchor.bottom;
  const spaceAbove = anchor.top;

  const fitsBelow = spaceBelow >= PREFERRED_HEIGHT + GAP + EDGE_MARGIN;
  const placeAbove = !fitsBelow && spaceAbove > spaceBelow;

  const left = clamp(
    anchor.left,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, viewport.width - TOOLTIP_WIDTH - EDGE_MARGIN),
  );

  const available = (placeAbove ? spaceAbove : spaceBelow) - GAP - EDGE_MARGIN;
  const maxHeight = Math.max(available, MIN_HEIGHT);

  return placeAbove
    ? { left, top: null, bottom: viewport.height - anchor.top + GAP, maxHeight }
    : { left, top: anchor.bottom + GAP, bottom: null, maxHeight };
}
