/**
 * utils/storageHelpers.ts
 *
 * Helper functions for Supabase Storage interactions.
 * Handles file uploads, signed URLs, and cleanup.
 */

import { supabase } from './supabase';

const EXCEL_BUCKET = 'excel-uploads';
const OUTPUT_BUCKET = 'generation-outputs';
const SIGNED_URL_EXPIRY_DAYS = 7; // 7 days for download links

/**
 * Upload an Excel file to Supabase Storage
 * @param workspaceId - workspace ID for path organization
 * @param file - File object from input
 * @returns { path, url, error }
 */
export async function uploadExcelFile(
  workspaceId: string,
  file: File
): Promise<{ path: string; url: string }> {
  if (!file) throw new Error('No file provided');
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('File size exceeds 50MB limit');
  }

  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${workspaceId}/${timestamp}-${sanitizedName}`;

  const { data, error } = await supabase.storage
    .from(EXCEL_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  // Get public URL for storage reference
  const { data: urlData } = supabase.storage
    .from(EXCEL_BUCKET)
    .getPublicUrl(path);

  return {
    path: data.path,
    url: urlData.publicUrl,
  };
}

/**
 * Upload a generated PDF ZIP file to Supabase Storage
 * @param jobId - generation job ID
 * @param zipBuffer - ArrayBuffer containing ZIP data
 * @param filename - desired filename (e.g., "pdfs_2024_05_11.zip")
 * @returns { path, url, error }
 */
export async function uploadGenerationZip(
  jobId: string,
  zipBuffer: ArrayBuffer,
  filename: string
): Promise<{ path: string; url: string }> {
  if (!zipBuffer || zipBuffer.byteLength === 0) {
    throw new Error('No zip data provided');
  }

  const blob = new Blob([zipBuffer], { type: 'application/zip' });
  const timestamp = Date.now();
  const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${jobId}/${timestamp}-${sanitizedName}`;

  const { data, error } = await supabase.storage
    .from(OUTPUT_BUCKET)
    .upload(path, blob, {
      contentType: 'application/zip',
      cacheControl: '31536000', // 1 year, immutable
      upsert: false,
    });

  if (error) throw error;

  // Get public URL for storage reference
  const { data: urlData } = supabase.storage
    .from(OUTPUT_BUCKET)
    .getPublicUrl(path);

  return {
    path: data.path,
    url: urlData.publicUrl,
  };
}

/**
 * Get a temporary signed URL for secure file download
 * Useful for private files or controlling access
 * @param bucketName - 'excel-uploads' or 'generation-outputs'
 * @param path - file path in storage
 * @param expirySeconds - how long URL is valid (default 7 days)
 * @returns signed URL
 */
export async function getSignedUrl(
  bucketName: 'excel-uploads' | 'generation-outputs',
  path: string,
  expirySeconds?: number
): Promise<string> {
  const expiryTime = expirySeconds || SIGNED_URL_EXPIRY_DAYS * 24 * 60 * 60;

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(path, expiryTime);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteStorageFile(
  bucketName: 'excel-uploads' | 'generation-outputs',
  path: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucketName)
    .remove([path]);

  if (error) throw error;
}

/**
 * Download file content directly (for client-side processing)
 * Limited to smaller files due to memory constraints
 */
export async function downloadFile(
  bucketName: 'excel-uploads' | 'generation-outputs',
  path: string
): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .download(path);

  if (error) throw error;
  return data.arrayBuffer();
}

/**
 * Get file metadata (size, created, updated)
 */
export async function getFileMetadata(
  bucketName: 'excel-uploads' | 'generation-outputs',
  path: string
): Promise<{ size?: number; created?: string; updated?: string } | null> {
  const { data: list, error } = await supabase.storage
    .from(bucketName)
    .list(path.split('/').slice(0, -1).join('/'), {
      limit: 100,
      offset: 0,
    });

  if (error) {
    console.error('Failed to list files:', error);
    return null;
  }

  const filename = path.split('/').pop();
  const file = list?.find((f) => f.name === filename);
  return file
    ? {
        size: file.metadata?.size,
        created: file.created_at ?? undefined,
        updated: file.updated_at ?? undefined,
      }
    : null;
}
