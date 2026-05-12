/**
 * Navbar.tsx — Top navigation bar with branding and status indicators.
 */

import { FileText, Save, Clock, Database, Cloud, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { TemplateService } from '../../services/template.service';
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
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setHasUnsavedChanges = useAppStore((s) => s.setHasUnsavedChanges);
  const setLastSavedAt = useAppStore((s) => s.setLastSavedAt);

  const saveToCloud = async () => {
    if (!pdfmeTemplate || !basePdfBuffer || !activeWorkspaceId) {
      addNotification({ message: 'No active template or workspace to save', level: 'warning' });
      return;
    }
    
    try {
      const patch = {
        name: pdfFileName || 'Untitled Template',
        pdfFileName,
        basePdf: basePdfBuffer,
        templateSchemas: pdfmeTemplate.schemas,
        schemaFields,
        fieldBindings,
        validationRules,
        conditionalRules,
        lastModified: Date.now(),
      };

      if (currentProjectId) {
        await TemplateService.updateTemplate(currentProjectId, patch);
      } else {
        const created = await TemplateService.createTemplate(activeWorkspaceId, {
          ...patch,
          snapshots: [],
        });
        setCurrentProjectId(created.id);
      }
      
      setLastSavedAt(Date.now());
      setHasUnsavedChanges(false);
      addNotification({ message: 'Project saved successfully to Cloud!', level: 'success' });
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
    <div className="px-6 py-3 flex items-center justify-between">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-600 shadow-md shadow-indigo-600/30">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
            PDF Template Master
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Design · Map · Generate
          </p>
        </div>
      </div>

      {/* Center — Active file */}
      {pdfFileName && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <FileText className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {pdfFileName}
          </span>
        </div>
      )}

      {/* Right — Save status */}
      <div className="flex items-center gap-3">
        {hasUnsavedChanges && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 animate-fade-in">
            <Save className="w-3 h-3" />
            Unsaved
          </span>
        )}
        {lastSavedAt && !hasUnsavedChanges && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Clock className="w-3.5 h-3.5" />
            Saved {formatTime(lastSavedAt)}
          </span>
        )}
        <button 
          onClick={saveToCloud} 
          disabled={!basePdfBuffer || !activeWorkspaceId}
          aria-label="Save project to cloud"
          className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Cloud className="w-4 h-4" /> Save
        </button>
        <button 
          onClick={loadTestData} 
          aria-label="Load test data"
          className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 transition-colors"
        >
          <Database className="w-4 h-4" /> Test Data
        </button>
        <button 
          onClick={startTour} 
          aria-label="Start guided tour"
          title="Start Guided Tour"
          className="inline-flex items-center justify-center p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
        <div className="ml-1 pl-3 border-l border-slate-200 dark:border-slate-700">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
