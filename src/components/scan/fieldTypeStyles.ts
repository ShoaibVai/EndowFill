/**
 * fieldTypeStyles.ts — Per-type visual tokens for the field review overlay
 * and list. Kept outside the components so react-refresh fast refresh works
 * (a file that only exports components refreshes reliably; constants shared
 * between components live here).
 *
 * Colors come from the Tailwind palette and work in both themes (the box
 * fill is a translucent tint on top of the rendered page).
 */

import type { DetectedFieldType } from '../../types/scan.types';

export interface FieldTypeStyle {
  border: string;
  fill: string;
  chip: string;
  label: string;
}

export const FIELD_TYPE_STYLES: Record<DetectedFieldType, FieldTypeStyle> = {
  text: { border: '#3b82f6', fill: 'rgba(59, 130, 246, 0.14)', chip: '#2563eb', label: 'Text' },
  checkbox: { border: '#a855f7', fill: 'rgba(168, 85, 247, 0.14)', chip: '#9333ea', label: 'Checkbox' },
  image: { border: '#22c55e', fill: 'rgba(34, 197, 94, 0.14)', chip: '#16a34a', label: 'Image' },
  signature: { border: '#f59e0b', fill: 'rgba(245, 158, 11, 0.14)', chip: '#d97706', label: 'Signature' },
};
