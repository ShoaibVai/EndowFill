/**
 * Navbar.tsx — Top navigation bar with branding and status indicators.
 */

import { FileText, Save, Clock, Database, HardDrive, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { StorageService } from '../../services/storage.service';
import { ThemeToggle } from '../settings/ThemeToggle';
import { useHelpTour } from '../../hooks/useHelpTour';

export function Navbar() {
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const hasUnsavedChanges = useAppStore((s) => s.hasUnsavedChanges);
  const pdfFileName = useAppStore((s) => s.pdfFileName);
  const { startTour } = useHelpTour();
  
  const setPdfFileName = useAppStore((s) => s.setPdfFileName);
  const setPdfmeTemplate = useAppStore((s) => s.setPdfmeTemplate);
  const setSchemaFields = useAppStore((s) => s.setSchemaFields);
  const setExcelColumns = useAppStore((s) => s.setExcelColumns);
  const setExcelRows = useAppStore((s) => s.setExcelRows);
  const setExcelFileName = useAppStore((s) => s.setExcelFileName);
  const setFieldBindings = useAppStore((s) => s.setFieldBindings);
  const addNotification = useAppStore((s) => s.addNotification);
  const pdfmeTemplate = useAppStore((s) => s.pdfmeTemplate);
  const basePdfBuffer = useAppStore((s) => s.basePdfBuffer);
  const schemaFields = useAppStore((s) => s.schemaFields);
  const fieldBindings = useAppStore((s) => s.fieldBindings);
  const validationRules = useAppStore((s) => s.validationRules);
  const conditionalRules = useAppStore((s) => s.conditionalRules);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);

  const saveToIndexedDB = async () => {
    if (!pdfmeTemplate || !basePdfBuffer) {
      addNotification({ message: 'No active template to save', level: 'warning' });
      return;
    }
    
    try {
      const idToSave = currentProjectId || `proj-${Date.now()}`;
      const existing = currentProjectId ? await StorageService.getProject(currentProjectId) : undefined;
      const snapshots = [
        ...(existing?.snapshots ?? []),
        {
          id: `snap-${Date.now()}`,
          createdAt: Date.now(),
          templateSchemas: pdfmeTemplate.schemas,
          schemaFields,
          fieldBindings,
        },
      ].slice(-10);

      await StorageService.saveProject({
        id: idToSave,
        name: pdfFileName || 'Untitled Project',
        lastModified: Date.now(),
        pdfFileName: pdfFileName || 'document.pdf',
        basePdf: basePdfBuffer,
        templateSchemas: pdfmeTemplate.schemas,
        schemaFields,
        fieldBindings,
        validationRules,
        conditionalRules,
        snapshots,
        generationOutputs: existing?.generationOutputs ?? [],
      });
      setCurrentProjectId(idToSave);
      addNotification({ message: 'Project saved successfully to DB!', level: 'success' });
    } catch {
      addNotification({ message: 'Failed to save project', level: 'error' });
    }
  };

  const loadTestData = () => {
    setPdfFileName('TestTemplate.pdf');
    const b64 = 'JVBERi0xLjQKMSAwIG9iago8PAovVGl0bGUgKP7/KQovQ3JlYXRvciAo/v8pCi9Qcm9kdWNlciAo/v8pCi9DcmVhdGlvbkRhdGUgKEQ6MjAyMzEwMTcxOTQ5MDFaKQo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMyAwIFIKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9Db3VudCAxCi9LaWRzIFsgNCAwIFIgXQo+PgplbmRvYmoKNCAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDUgMCBSCj4+Cj4+Ci9NZWRpYUJveCBbIDAgMCA1OTUuMjggODQxLjg5IF0KL0NvbnRlbnRzIDYgMCBSCj4+CjBlbmRvYmoKNSAwIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTUKL0Jhc2VGb250IC9IZWx2ZXRpY2EKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0xlbmd0aCAyMQo+PgpzdHJlYW0KQlQKL0YxIDEyIFRmCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAxMTEgMDAwMDAgbiAKMDAwMDAwMDE2MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMDUgMDAwMDAgbiAKMDAwMDAwMDM5MyAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDcKL1Jvb3QgMiAwIFIKL0luZm8gMSAwIFIKPj4Kc3RhcnR4cmVmCjQ2NgolJUVPRgo=';
    const binary = atob(b64);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);

    setPdfmeTemplate({
      basePdf: buf,
      schemas: [{
        'given_name': { name: 'given_name', type: 'text', position: { x: 10, y: 10 }, width: 50, height: 10 },
        'family_name': { name: 'family_name', type: 'text', position: { x: 10, y: 20 }, width: 50, height: 10 },
        'status': { name: 'status', type: 'text', position: { x: 10, y: 30 }, width: 50, height: 10 },
      }]
    });
    setSchemaFields([
      { name: 'given_name', type: 'text', position: { x: 10, y: 10 }, width: 50, height: 10 },
      { name: 'family_name', type: 'text', position: { x: 10, y: 20 }, width: 50, height: 10 },
      { name: 'status', type: 'text', position: { x: 10, y: 30 }, width: 50, height: 10 },
    ]);
    
    setExcelFileName('TestData.xlsx');
    setExcelColumns([
      { index: 0, header: 'Given Name', inferredType: 'text', sampleValues: ['John', 'Jane'] },
      { index: 1, header: 'Family Name', inferredType: 'text', sampleValues: ['Doe', 'Smith'] },
      { index: 2, header: 'Application Status', inferredType: 'text', sampleValues: ['pending', 'approved'] },
    ]);
    setExcelRows([
      { 'Given Name': 'John', 'Family Name': 'Doe', 'Application Status': 'pending' },
      { 'Given Name': 'Jane', 'Family Name': 'Smith', 'Application Status': 'approved' },
      { 'Given Name': 'Alice', 'Family Name': 'Johnson', 'Application Status': 'pending' },
    ]);
    setFieldBindings([]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <nav className="glass sticky top-0 z-50 px-6 py-3 flex items-center justify-between"
         style={{ borderBottom: '1px solid rgba(226, 232, 240, 0.8)' }}>
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
             style={{
               background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))',
               boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
             }}>
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold"
              style={{ color: 'var(--color-surface-900)', letterSpacing: '-0.02em' }}>
            PDF Template Master
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-surface-400)' }}>
            Design · Map · Generate
          </p>
        </div>
      </div>

      {/* Center — Active file */}
      {pdfFileName && (
        <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-lg"
             style={{ background: 'var(--color-surface-50)', border: '1px solid var(--color-surface-200)' }}>
          <FileText className="w-3.5 h-3.5" style={{ color: 'var(--color-brand-500)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-surface-700)' }}>
            {pdfFileName}
          </span>
        </div>
      )}

      {/* Right — Save status */}
      <div className="flex items-center gap-3">
        {hasUnsavedChanges && (
          <span className="badge badge-warning animate-fade-in">
            <Save className="w-3 h-3" />
            Unsaved
          </span>
        )}
        {lastSavedAt && !hasUnsavedChanges && (
          <span className="flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--color-surface-400)' }}>
            <Clock className="w-3 h-3" />
            Saved at {formatTime(lastSavedAt)}
          </span>
        )}
        <button onClick={saveToIndexedDB} className="btn btn-primary btn-sm text-xs shadow-sm" disabled={!basePdfBuffer}>
          <HardDrive className="w-3.5 h-3.5" /> Save to DB
        </button>
        <button onClick={loadTestData} className="btn btn-ghost btn-sm text-xs border border-indigo-200">
          <Database className="w-3.5 h-3.5" /> Test Data
        </button>
        <button onClick={startTour} className="btn btn-ghost btn-sm btn-icon text-xs" title="Start Guided Tour">
          <HelpCircle className="w-4 h-4" />
        </button>
        <ThemeToggle />
      </div>
    </nav>
  );
}
