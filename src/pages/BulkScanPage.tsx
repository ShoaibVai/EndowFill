/**
 * BulkScanPage.tsx — bulk AI document scan (flow 5, "bulk scan").
 *
 * Wraps the BulkScanPanel queue: upload many student documents, scan them
 * sequentially against the self-hosted OCR + extract endpoints, review the
 * per-file results, then send everything to the Bulk Generate tab where the
 * existing Web-Worker PDF engine produces one PDF per file (zipped).
 */

import { Files } from 'lucide-react';
import { BulkScanPanel } from '../components/bulk/BulkScanPanel';
import { PageHeader } from '../components/ui/PageHeader';

export function BulkScanPage() {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 animate-fade-in">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          ai
          icon={<Files className="h-5 w-5" />}
          title="Bulk AI Document Scan"
          subtitle="Scan many student documents at once — each file is OCR'd sequentially on your server's CPU, then sent to Bulk Generate."
        />

        <BulkScanPanel />
      </div>
    </div>
  );
}
