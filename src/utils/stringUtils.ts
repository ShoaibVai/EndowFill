/**
 * stringUtils.ts — String manipulation and matching utilities.
 */

/**
 * Calculates the Levenshtein distance between two strings.
 * Used for auto-matching PDF field names to Excel column headers.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalizes a string for comparison (lowercase, alphanumeric only).
 */
export function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the best match for a field name among a list of column headers.
 * Returns the column index, or -1 if no good match is found.
 */
export function findBestColumnMatch(fieldName: string, columnHeaders: string[]): number {
  const normalizedField = normalizeForMatch(fieldName);
  let bestMatchIndex = -1;
  let bestDistance = Infinity;

  // Exact substring match first (if field is "name", and column is "first name")
  for (let i = 0; i < columnHeaders.length; i++) {
    const normCol = normalizeForMatch(columnHeaders[i]);
    if (normCol === normalizedField) {
      return i; // Exact normalized match is the best possible
    }
  }

  // Fallback to Levenshtein distance
  for (let i = 0; i < columnHeaders.length; i++) {
    const normCol = normalizeForMatch(columnHeaders[i]);
    const dist = levenshteinDistance(normalizedField, normCol);
    
    // Set a threshold for what we consider a "good" match based on string length
    const threshold = Math.max(3, normalizedField.length * 0.4);
    
    if (dist < bestDistance && dist <= threshold) {
      bestDistance = dist;
      bestMatchIndex = i;
    }
  }

  return bestMatchIndex;
}
