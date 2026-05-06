import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'pdf-template-master-db';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

interface PDFProject {
  id: string;
  name: string;
  description?: string;
  lastModified: number;
  pdfFileName: string;
  basePdf: ArrayBuffer | string; // Large payload
  templateSchemas: unknown;
  schemaFields: unknown;
  fieldBindings: unknown;
  validationRules?: unknown;
  conditionalRules?: unknown;
  snapshots?: Array<{
    id: string;
    createdAt: number;
    templateSchemas: unknown;
    schemaFields: unknown;
    fieldBindings: unknown;
  }>;
  /** Optional list of previous generation outputs metadata */
  generationOutputs?: Array<{
    id: string;
    name: string;
    createdAt: number;
    zipBase64?: string;
    count?: number;
  }>;
  thumbnailBase64?: string; // For gallery view
}

interface PDFMasterDB extends DBSchema {
  projects: {
    key: string;
    value: PDFProject;
    indexes: {
      'by-date': number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PDFMasterDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PDFMasterDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-date', 'lastModified');
        }
      },
    });
  }
  return dbPromise;
}

export const StorageService = {
  /** Save a project to IndexedDB */
  async saveProject(project: PDFProject): Promise<void> {
    try {
      const db = await getDB();
      await db.put(STORE_NAME, project);
    } catch (error) {
      console.error('[StorageService] Failed to save project to IndexedDB', error);
      // Fallback to localStorage for small data if needed, but not recommended for basePdf
      throw error;
    }
  },

  /** Get a project by ID */
  async getProject(id: string): Promise<PDFProject | undefined> {
    try {
      const db = await getDB();
      return await db.get(STORE_NAME, id);
    } catch (error) {
      console.error('[StorageService] Failed to get project', error);
      return undefined;
    }
  },

  /** List all projects (without heavy basePdf payload for faster loading) */
  async listProjects(): Promise<Omit<PDFProject, 'basePdf'>[]> {
    try {
      const db = await getDB();
      const all = await db.getAllFromIndex(STORE_NAME, 'by-date');
      // Sort newest first
      all.sort((a, b) => b.lastModified - a.lastModified);
      
      // Strip basePdf to save memory in lists
      return all.map((p) => {
        const { basePdf, ...rest } = p;
        return rest;
      });
    } catch (error) {
      console.error('[StorageService] Failed to list projects', error);
      return [];
    }
  },

  /** Delete a project */
  async deleteProject(id: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete(STORE_NAME, id);
    } catch (error) {
      console.error('[StorageService] Failed to delete project', error);
      throw error;
    }
  },
};
