/**
 * FieldOverlay.tsx — Clickable, color-coded field boxes over a rendered PDF
 * page (flow 2 — turn a form PDF into a fillable PDF).
 *
 * Adaptation of DetectionOverlay (scan review) for form fields:
 *  - boxes are colored per fieldType (text=blue, checkbox=purple,
 *    image=green, signature=amber) with an always-visible label chip;
 *  - the selected field gets a white+color ring so it stands out;
 *  - edit mode captures pointer events and reports a drag rectangle back to
 *    the page, which owns the "label + type the new field" step.
 *
 * Positions use the shared normalized % helpers from utils/pdfViewer.
 */

import { useMemo, useRef } from 'react';
import {
  bboxToOverlayStyle,
  normalizeBBoxFromPoints,
  normalizePointerPoint,
} from '../../utils/pdfViewer';
import type { NormalizedPoint } from '../../utils/pdfViewer';
import type { OcrBBox, ReviewField } from '../../types/scan.types';
import { FIELD_TYPE_STYLES } from './fieldTypeStyles';

interface FieldOverlayProps {
  /** Page currently displayed (fields for other pages are ignored). */
  pageIndex: number;
  /** All reviewed fields; filtered to `pageIndex` internally. */
  fields: ReviewField[];
  /** Currently selected field (its box gets the strong ring). */
  selectedFieldId: string | null;
  /** Hovered field in the list (soft highlight). */
  hoveredFieldId: string | null;
  /** Edit mode: drag anywhere to draw a new field box. */
  editMode: boolean;
  /** In-progress drag rectangle (normalized), if a draw is happening. */
  drawRect: OcrBBox | null;
  /** Called when a box is clicked (field id). */
  onSelect: (fieldId: string) => void;
  /** Pointer press started a drag (normalized point). */
  onDrawStart: (point: NormalizedPoint) => void;
  /** Pointer moved during a drag (normalized bbox of the drag so far). */
  onDrawMove: (bbox: OcrBBox) => void;
  /** Pointer released (normalized bbox of the finished drag). */
  onDrawEnd: (bbox: OcrBBox) => void;
}

export function FieldOverlay({
  pageIndex,
  fields,
  selectedFieldId,
  hoveredFieldId,
  editMode,
  drawRect,
  onSelect,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
}: FieldOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drawStartRef = useRef<NormalizedPoint | null>(null);

  const pageFields = useMemo(
    () => fields.filter((field) => field.pageIndex === pageIndex),
    [fields, pageIndex]
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
      {pageFields.map((field) => {
        const isActive =
          field.id === selectedFieldId || field.id === hoveredFieldId;
        const style = FIELD_TYPE_STYLES[field.fieldType] ?? FIELD_TYPE_STYLES.text;
        return (
          <button
            key={field.id}
            id={`field-box-${field.id}`}
            type="button"
            data-field-id={field.id}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect(field.id)}
            title={`${field.label} (${style.label})`}
            aria-label={`${field.label}, ${style.label} field`}
            className="absolute z-10 rounded-[3px] border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            style={{
              ...bboxToOverlayStyle(field.bbox),
              borderColor: style.border,
              backgroundColor: style.fill,
              boxShadow: isActive ? `0 0 0 2px #ffffff, 0 0 0 4px ${style.border}` : undefined,
            }}
          >
            <span
              className="absolute left-0 top-0 max-w-full truncate rounded-br rounded-tl px-1 py-0.5 text-[10px] font-semibold leading-none text-white"
              style={{ backgroundColor: style.chip }}
            >
              {field.label}
            </span>
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
        <div className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-md dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200">
          Click &amp; drag on the page to add a field
        </div>
      )}
    </div>
  );
}
