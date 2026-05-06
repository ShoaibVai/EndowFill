/**
 * TemplateEditor.tsx — The main editor layout combining sidebar + canvas + toolbar.
 */

import { EditorToolbar } from './EditorToolbar';
import { EditorSidebar } from './EditorSidebar';
import { EditorCanvas } from './EditorCanvas';

export function TemplateEditor() {
  return (
    <div className="flex flex-col flex-1 p-4 gap-3 animate-fade-in" style={{ minHeight: 0 }}>
      <EditorToolbar />
      <div className="flex flex-1 gap-4" style={{ minHeight: 0 }}>
        <EditorSidebar />
        <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
          <EditorCanvas />
        </div>
      </div>
    </div>
  );
}
