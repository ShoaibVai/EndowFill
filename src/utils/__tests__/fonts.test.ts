import { describe, it, expect } from 'vitest';
import { getPdfmeFonts, getFontFamilies, getFontLabels } from '../fonts';

describe('fonts utility', () => {
  it('returns valid pdfme Font mapping structure', () => {
    const fonts = getPdfmeFonts();
    expect(fonts).toBeDefined();
    expect(fonts['Arial']).toEqual({
      data: 'https://cdn.jsdelivr.net/gh/shantigilbert/liberation-fonts-ttf@master/LiberationSans-Regular.ttf',
      fallback: true,
    });
    expect(fonts['Roboto']).toEqual({
      data: 'https://cdn.jsdelivr.net/npm/@fontsource/roboto/files/roboto-latin-400-normal.woff',
      fallback: false,
    });
  });

  it('returns unique base font families', () => {
    const families = getFontFamilies();
    expect(families).toContain('Arial');
    expect(families).toContain('Roboto');
    expect(families).toContain('Open Sans');
    expect(families).toContain('Lora');
    expect(families).toContain('Noto Sans');
    expect(families).toContain('Merriweather');
    expect(families.length).toBeGreaterThanOrEqual(10);
  });

  it('returns all font variant labels', () => {
    const labels = getFontLabels();
    expect(labels).toContain('Roboto');
    expect(labels).toContain('Roboto Bold');
    expect(labels).toContain('Roboto Italic');
    expect(labels).toContain('Roboto Bold Italic');
    expect(labels.length).toBeGreaterThanOrEqual(30);
  });
});
