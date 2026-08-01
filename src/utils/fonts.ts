/**
 * fonts.ts — Font configuration for pdfme Designer & Generator.
 *
 * Provides a curated set of professional fonts (regular + bold variants):
 *   - Arial           (Liberation Sans — metric-compatible)
 *   - Times New Roman (Liberation Serif — metric-compatible)
 *   - Courier New     (Liberation Mono — metric-compatible)
 *   - Arimo, Tinos, Cousine (Google Croscore alternatives)
 *   - Roboto          (Android / Material Design default)
 *   - Roboto Slab     (professional slab-serif)
 *   - Open Sans       (clean, highly readable sans-serif)
 *   - Lora            (metric-compatible with Georgia)
 *   - Noto Sans       (broad Unicode coverage)
 *   - Merriweather    (elegant serif for documents)
 *
 * Each variant (Regular, Bold, Italic, Bold-Italic where available) is
 * registered as a separate font entry so users can pick them from the
 * pdfme Designer sidebar.
 *
 * Usage:
 *   import { getPdfmeFonts } from '../utils/fonts';
 *   const font = await getPdfmeFonts();
 *   new Designer({ ..., options: { font } });
 */

import type { Font } from '@pdfme/common';

// ---------------------------------------------------------------------------
// CDN base — jsDelivr mirrors GitHub repos with proper CORS headers
// ---------------------------------------------------------------------------
const BASE = 'https://cdn.jsdelivr.net/npm';
const LIB = 'https://cdn.jsdelivr.net/gh/shantigilbert/liberation-fonts-ttf@master';

// ---------------------------------------------------------------------------
// Font manifest — defines every font + variants we ship
// ---------------------------------------------------------------------------
interface FontVariant {
  /** Display name shown in the Designer dropdown */
  label: string;
  /** Remote URL to the font file */
  url: string;
  /** Whether this variant is the global fallback */
  fallback?: boolean;
}

const FONT_MANIFEST: FontVariant[] = [
  // ── Arial (Liberation Sans — metric-compatible) ─────────────
  { label: 'Arial',              url: `${LIB}/LiberationSans-Regular.ttf`, fallback: true },
  { label: 'Arial Bold',         url: `${LIB}/LiberationSans-Bold.ttf` },
  { label: 'Arial Italic',       url: `${LIB}/LiberationSans-Italic.ttf` },
  { label: 'Arial Bold Italic',  url: `${LIB}/LiberationSans-BoldItalic.ttf` },

  // ── Times New Roman (Liberation Serif — metric-compatible) ──
  { label: 'Times New Roman',              url: `${LIB}/LiberationSerif-Regular.ttf` },
  { label: 'Times New Roman Bold',         url: `${LIB}/LiberationSerif-Bold.ttf` },
  { label: 'Times New Roman Italic',       url: `${LIB}/LiberationSerif-Italic.ttf` },
  { label: 'Times New Roman Bold Italic',  url: `${LIB}/LiberationSerif-BoldItalic.ttf` },

  // ── Courier New (Liberation Mono — metric-compatible) ───────
  { label: 'Courier New',              url: `${LIB}/LiberationMono-Regular.ttf` },
  { label: 'Courier New Bold',         url: `${LIB}/LiberationMono-Bold.ttf` },
  { label: 'Courier New Italic',       url: `${LIB}/LiberationMono-Italic.ttf` },
  { label: 'Courier New Bold Italic',  url: `${LIB}/LiberationMono-BoldItalic.ttf` },

  // ── Arimo (alternative sans-serif) ──────────────────────────
  { label: 'Arimo',              url: `${BASE}/@fontsource/arimo/files/arimo-latin-400-normal.woff` },
  { label: 'Arimo Bold',         url: `${BASE}/@fontsource/arimo/files/arimo-latin-700-normal.woff` },
  { label: 'Arimo Italic',       url: `${BASE}/@fontsource/arimo/files/arimo-latin-400-italic.woff` },
  { label: 'Arimo Bold Italic',  url: `${BASE}/@fontsource/arimo/files/arimo-latin-700-italic.woff` },

  // ── Tinos (alternative serif) ───────────────────────────────
  { label: 'Tinos',              url: `${BASE}/@fontsource/tinos/files/tinos-latin-400-normal.woff` },
  { label: 'Tinos Bold',         url: `${BASE}/@fontsource/tinos/files/tinos-latin-700-normal.woff` },
  { label: 'Tinos Italic',       url: `${BASE}/@fontsource/tinos/files/tinos-latin-400-italic.woff` },
  { label: 'Tinos Bold Italic',  url: `${BASE}/@fontsource/tinos/files/tinos-latin-700-italic.woff` },

  // ── Cousine (alternative monospace) ─────────────────────────
  { label: 'Cousine',             url: `${BASE}/@fontsource/cousine/files/cousine-latin-400-normal.woff` },
  { label: 'Cousine Bold',        url: `${BASE}/@fontsource/cousine/files/cousine-latin-700-normal.woff` },
  { label: 'Cousine Italic',      url: `${BASE}/@fontsource/cousine/files/cousine-latin-400-italic.woff` },
  { label: 'Cousine Bold Italic', url: `${BASE}/@fontsource/cousine/files/cousine-latin-700-italic.woff` },

  // ── Roboto ──────────────────────────────────────────────────
  { label: 'Roboto',              url: `${BASE}/@fontsource/roboto/files/roboto-latin-400-normal.woff` },
  { label: 'Roboto Bold',         url: `${BASE}/@fontsource/roboto/files/roboto-latin-700-normal.woff` },
  { label: 'Roboto Italic',       url: `${BASE}/@fontsource/roboto/files/roboto-latin-400-italic.woff` },
  { label: 'Roboto Bold Italic',  url: `${BASE}/@fontsource/roboto/files/roboto-latin-700-italic.woff` },

  // ── Open Sans ───────────────────────────────────────────────
  { label: 'Open Sans',              url: `${BASE}/@fontsource/open-sans/files/open-sans-latin-400-normal.woff` },
  { label: 'Open Sans Bold',         url: `${BASE}/@fontsource/open-sans/files/open-sans-latin-700-normal.woff` },
  { label: 'Open Sans Italic',       url: `${BASE}/@fontsource/open-sans/files/open-sans-latin-400-italic.woff` },
  { label: 'Open Sans Bold Italic',  url: `${BASE}/@fontsource/open-sans/files/open-sans-latin-700-italic.woff` },

  // ── Lora (≈ Georgia) ────────────────────────────────────────
  { label: 'Lora',              url: `${BASE}/@fontsource/lora/files/lora-latin-400-normal.woff` },
  { label: 'Lora Bold',         url: `${BASE}/@fontsource/lora/files/lora-latin-700-normal.woff` },
  { label: 'Lora Italic',       url: `${BASE}/@fontsource/lora/files/lora-latin-400-italic.woff` },
  { label: 'Lora Bold Italic',  url: `${BASE}/@fontsource/lora/files/lora-latin-700-italic.woff` },

  // ── Noto Sans (broad Unicode) ───────────────────────────────
  { label: 'Noto Sans',              url: `${BASE}/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff` },
  { label: 'Noto Sans Bold',         url: `${BASE}/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff` },
  { label: 'Noto Sans Italic',       url: `${BASE}/@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff` },
  { label: 'Noto Sans Bold Italic',  url: `${BASE}/@fontsource/noto-sans/files/noto-sans-latin-700-italic.woff` },

  // ── Merriweather (elegant serif) ────────────────────────────
  { label: 'Merriweather',              url: `${BASE}/@fontsource/merriweather/files/merriweather-latin-400-normal.woff` },
  { label: 'Merriweather Bold',         url: `${BASE}/@fontsource/merriweather/files/merriweather-latin-700-normal.woff` },
  { label: 'Merriweather Italic',       url: `${BASE}/@fontsource/merriweather/files/merriweather-latin-400-italic.woff` },
  { label: 'Merriweather Bold Italic',  url: `${BASE}/@fontsource/merriweather/files/merriweather-latin-700-italic.woff` },

  // ── Roboto Slab (slab-serif) ────────────────────────────────
  { label: 'Roboto Slab',       url: `${BASE}/@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff` },
  { label: 'Roboto Slab Bold',  url: `${BASE}/@fontsource/roboto-slab/files/roboto-slab-latin-700-normal.woff` },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the pdfme `Font` configuration object.
 *
 * pdfme will lazily fetch each font URL the first time it's needed,
 * so we just pass the URL strings here — no upfront downloads.
 */
export function getPdfmeFonts(): Font {
  const font: Font = {};

  for (const v of FONT_MANIFEST) {
    font[v.label] = {
      data: v.url,
      fallback: v.fallback ?? false,
    };
  }

  return font;
}

/**
 * All available font family labels (useful for UI dropdowns).
 * Returns unique base family names (without "Bold" / "Italic" suffixes).
 */
export function getFontFamilies(): string[] {
  const families = new Set<string>();
  for (const v of FONT_MANIFEST) {
    // Strip " Bold", " Italic", " Bold Italic" to get base name
    const base = v.label
      .replace(/ Bold Italic$/, '')
      .replace(/ Bold$/, '')
      .replace(/ Italic$/, '');
    families.add(base);
  }
  return Array.from(families);
}

/**
 * All individual font variant labels — these are the names
 * that appear in the pdfme Designer's font picker.
 */
export function getFontLabels(): string[] {
  return FONT_MANIFEST.map((v) => v.label);
}
