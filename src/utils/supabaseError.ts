/**
 * utils/supabaseError.ts
 *
 * Helper functions for handling Supabase errors.
 * Ensures all Supabase errors are wrapped in proper Error objects with readable messages.
 */

/**
 * Convert a Supabase error object to a proper Error instance
 * Supabase returns error objects with { message, code, details, hint } structure
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as any;
    const message =
      err.message ||
      err.details ||
      err.hint ||
      JSON.stringify(error);
    return new Error(message);
  }

  return new Error(String(error) || 'Unknown error');
}

/**
 * Extract a human-readable message from a Supabase error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as any;
    return err.message || err.details || err.hint || JSON.stringify(error);
  }

  return String(error) || 'Unknown error';
}
