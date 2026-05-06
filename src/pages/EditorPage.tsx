/**
 * EditorPage.tsx — Full editor page (Phase 1 primary view).
 */

import { TemplateEditor } from '../components/editor/TemplateEditor';

export function EditorPage() {
  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
      <TemplateEditor />
    </div>
  );
}
