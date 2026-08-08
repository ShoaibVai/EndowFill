/**
 * TemplateEditor.tsx — The main editor layout: toolbar on top, canvas in the
 * center, and the fields panel on the RIGHT (the global app nav sidebar stays
 * on the left — avoids a double sidebar band on the editor tab).
 */

import { EditorToolbar } from './EditorToolbar';
import { EditorSidebar } from './EditorSidebar';
import { EditorCanvas } from './EditorCanvas';

export function TemplateEditor() {
  return (
    <div className="flex flex-col flex-1 p-4 gap-3 animate-fade-in" style={{ minHeight: 0 }}>
      <EditorToolbar />
      <div className="flex flex-1 gap-4" style={{ minHeight: 0 }}>
        <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
          <EditorCanvas />
        </div>
        <EditorSidebar />
      </div>
    </div>
  );
}
