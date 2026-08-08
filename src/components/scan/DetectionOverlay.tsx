/**
 * DetectionOverlay.tsx — Clickable highlight boxes over a rendered PDF page.
 *
 * - Renders one box per OCR detection on the given page, positioned with
 *   normalized % coordinates (bboxToOverlayStyle).
 * - Boxes are clickable in both modes; clicking selects the linked item.
 * - In edit mode the overlay captures pointer events and reports a drag
 *   rectangle back to the page (which owns the "label the new box" step).
 */

import { useMemo, useRef } from 'react';
import {
  bboxToOverlayStyle,
  normalizeBBoxFromPoints,
  normalizePointerPoint,
} from '../../utils/pdfViewer';
import type { NormalizedPoint } from '../../utils/pdfViewer';
import type { Detection, OcrBBox } from '../../types/scan.types';

interface DetectionOverlayProps {
  /** Page currently displayed (boxes for other pages are ignored). */
  pageIndex: number;
  /** All visible detections; filtered to `pageIndex` internally. */
  detections: Detection[];
  /** detectionId → itemId lookup for selection/highlight linkage. */
  detectionToItem: Record<string, string>;
  /** Currently selected item (its linked box gets the strong highlight). */
  selectedItemId: string | null;
  /** Hovered item in the list (its linked box gets a soft highlight). */
  hoveredItemId: string | null;
  /** Edit mode: drag anywhere to create a box. */
  editMode: boolean;
/** In-progress drag rectangle (normalized), if a draw is happening. */
drawRect: OcrBBox | null;
/** Called when a box is clicked (box id) — page resolves the item. */
onSelect: (detectionId: string) => void;
/** Pointer press started a drag (normalized point). */
onDrawStart: (point: NormalizedPoint) => void;
/** Pointer moved during a drag (normalized bbox of the drag so far). */
onDrawMove: (bbox: OcrBBox) => void;
/** Pointer released (normalized bbox of the finished drag). */
onDrawEnd: (bbox: OcrBBox) => void;
}

export function DetectionOverlay({
  pageIndex,
  detections,
  detectionToItem,
  selectedItemId,
  hoveredItemId,
  editMode,
  drawRect,
  onSelect,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
}: DetectionOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drawStartRef = useRef<NormalizedPoint | null>(null);

  const pageDetections = useMemo(
    () => detections.filter((detection) => detection.pageIndex === pageIndex),
    [detections, pageIndex]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode || event.button !== 0 || !rootRef.current) return;
    event.preventDefault();
    const point = normalizePointerPoint(event.nativeEvent, rootRef.current);
    drawStartRef.current = point;
    rootRef.current.setPointerCapture(event.pointerId);
    onDrawStart(point);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drawStartRef.current;
    if (!start || !rootRef.current) return;
    const point = normalizePointerPoint(event.nativeEvent, rootRef.current);
    onDrawMove(normalizeBBoxFromPoints(start, point));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drawStartRef.current;
    if (!start || !rootRef.current) return;
    drawStartRef.current = null;
    const point = normalizePointerPoint(event.nativeEvent, rootRef.current);
    // Always report the end so the page clears its draw state; the page
    // ignores sub-minimum boxes (simple clicks in edit mode).
    onDrawEnd(normalizeBBoxFromPoints(start, point));
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-10 select-none"
      style={{
        pointerEvents: editMode ? 'auto' : 'none',
        cursor: editMode ? 'crosshair' : 'default',
        touchAction: editMode ? 'none' : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {pageDetections.map((detection) => {
        const linkedItemId = detectionToItem[detection.id];
        const isActive =
          linkedItemId != null &&
          (linkedItemId === selectedItemId || linkedItemId === hoveredItemId);
        const showLabel = detection.bbox.width > 0.07 && detection.bbox.height > 0.025;
        return (
          <button
            key={detection.id}
            id={`scan-det-${detection.id}`}
            type="button"
            data-detection-id={detection.id}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect(detection.id)}
            title={detection.text || detection.label}
            aria-label={detection.label}
            className={[
              'absolute z-10 rounded-[3px] border transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              isActive
                ? 'border-primary-600 bg-primary-500/25 ring-2 ring-primary-500/30'
                : 'border-primary-400/70 bg-primary-400/10 hover:border-primary-500 hover:bg-primary-400/20',
            ].join(' ')}
            style={bboxToOverlayStyle(detection.bbox)}
          >
            {showLabel && (
              <span className="absolute left-0 top-0 max-w-full truncate rounded-br rounded-tl bg-primary-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
                {detection.label}
              </span>
            )}
          </button>
        );
      })}

      {drawRect && (
        <div
          className="pointer-events-none absolute z-20 border-2 border-dashed border-primary-500 bg-primary-400/10"
          style={bboxToOverlayStyle(drawRect)}
        />
      )}

      {editMode && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-md dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200">
          Click &amp; drag on the page to add a box
        </div>
      )}
    </div>
  );
}
