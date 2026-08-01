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
const GH = 'https://cdn.jsdelivr.net/gh/google/fonts@main';
const LIB = 'https://cdn.jsdelivr.net/gh/shantigilbert/liberation-fonts-ttf@master';

// ---------------------------------------------------------------------------
// Font manifest — defines every font + variants we ship
// ---------------------------------------------------------------------------
interface FontVariant {
  /** Display name shown in the Designer dropdown */
  label: string;
  /** Remote URL to the .ttf file */
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
  { label: 'Arimo',              url: `${GH}/apache/arimo/static/Arimo-Regular.ttf` },
  { label: 'Arimo Bold',         url: `${GH}/apache/arimo/static/Arimo-Bold.ttf` },
  { label: 'Arimo Italic',       url: `${GH}/apache/arimo/static/Arimo-Italic.ttf` },
  { label: 'Arimo Bold Italic',  url: `${GH}/apache/arimo/static/Arimo-BoldItalic.ttf` },

  // ── Tinos (alternative serif) ───────────────────────────────
  { label: 'Tinos',              url: `${GH}/apache/tinos/Tinos-Regular.ttf` },
  { label: 'Tinos Bold',         url: `${GH}/apache/tinos/Tinos-Bold.ttf` },
  { label: 'Tinos Italic',       url: `${GH}/apache/tinos/Tinos-Italic.ttf` },
  { label: 'Tinos Bold Italic',  url: `${GH}/apache/tinos/Tinos-BoldItalic.ttf` },

  // ── Cousine (alternative monospace) ─────────────────────────
  { label: 'Cousine',             url: `${GH}/apache/cousine/Cousine-Regular.ttf` },
  { label: 'Cousine Bold',        url: `${GH}/apache/cousine/Cousine-Bold.ttf` },
  { label: 'Cousine Italic',      url: `${GH}/apache/cousine/Cousine-Italic.ttf` },
  { label: 'Cousine Bold Italic', url: `${GH}/apache/cousine/Cousine-BoldItalic.ttf` },

  // ── Roboto ──────────────────────────────────────────────────
  { label: 'Roboto',              url: `${GH}/ofl/roboto/static/Roboto-Regular.ttf` },
  { label: 'Roboto Bold',         url: `${GH}/ofl/roboto/static/Roboto-Bold.ttf` },
  { label: 'Roboto Italic',       url: `${GH}/ofl/roboto/static/Roboto-Italic.ttf` },
  { label: 'Roboto Bold Italic',  url: `${GH}/ofl/roboto/static/Roboto-BoldItalic.ttf` },

  // ── Open Sans ───────────────────────────────────────────────
  { label: 'Open Sans',              url: `${GH}/ofl/opensans/static/OpenSans-Regular.ttf` },
  { label: 'Open Sans Bold',         url: `${GH}/ofl/opensans/static/OpenSans-Bold.ttf` },
  { label: 'Open Sans Italic',       url: `${GH}/ofl/opensans/static/OpenSans-Italic.ttf` },
  { label: 'Open Sans Bold Italic',  url: `${GH}/ofl/opensans/static/OpenSans-BoldItalic.ttf` },

  // ── Lora (≈ Georgia) ────────────────────────────────────────
  { label: 'Lora',              url: `${GH}/ofl/lora/static/Lora-Regular.ttf` },
  { label: 'Lora Bold',         url: `${GH}/ofl/lora/static/Lora-Bold.ttf` },
  { label: 'Lora Italic',       url: `${GH}/ofl/lora/static/Lora-Italic.ttf` },
  { label: 'Lora Bold Italic',  url: `${GH}/ofl/lora/static/Lora-BoldItalic.ttf` },

  // ── Noto Sans (broad Unicode) ───────────────────────────────
  { label: 'Noto Sans',              url: `${GH}/ofl/notosans/NotoSans-Regular.ttf` },
  { label: 'Noto Sans Bold',         url: `${GH}/ofl/notosans/NotoSans-Bold.ttf` },
  { label: 'Noto Sans Italic',       url: `${GH}/ofl/notosans/NotoSans-Italic.ttf` },
  { label: 'Noto Sans Bold Italic',  url: `${GH}/ofl/notosans/NotoSans-BoldItalic.ttf` },

  // ── Merriweather (elegant serif) ────────────────────────────
  { label: 'Merriweather',              url: `${GH}/ofl/merriweather/Merriweather-Regular.ttf` },
  { label: 'Merriweather Bold',         url: `${GH}/ofl/merriweather/Merriweather-Bold.ttf` },
  { label: 'Merriweather Italic',       url: `${GH}/ofl/merriweather/Merriweather-Italic.ttf` },
  { label: 'Merriweather Bold Italic',  url: `${GH}/ofl/merriweather/Merriweather-BoldItalic.ttf` },

  // ── Roboto Slab (slab-serif) ────────────────────────────────
  { label: 'Roboto Slab',       url: `${GH}/ofl/robotoslab/static/RobotoSlab-Regular.ttf` },
  { label: 'Roboto Slab Bold',  url: `${GH}/ofl/robotoslab/static/RobotoSlab-Bold.ttf` },
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
