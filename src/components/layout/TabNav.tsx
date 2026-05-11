/**
 * TabNav.tsx — Dual-tab navigation between Editor and Bulk Generate pages.
 */

import { PenTool, Zap, FolderKanban } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ActiveTab } from '../../types/pdfme.types';

const tabs: { id: ActiveTab; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: 'projects',
    label: 'Projects',
    icon: <FolderKanban className="w-4 h-4" />,
    description: 'Saved templates',
  },
  {
    id: 'editor',
    label: 'Template Editor',
    icon: <PenTool className="w-4 h-4" />,
    description: 'Design & map fields',
  },
  {
    id: 'generate',
    label: 'Bulk Generate',
    icon: <Zap className="w-4 h-4" />,
    description: 'Create PDFs en masse',
  },
];

export function TabNav() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  if (activeTab === 'projects') {
    return null;
  }

  return (
    <nav aria-label="Main Navigation" className="flex items-center gap-1 px-4">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`
              group flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium
              transition-all duration-200 outline-none
              focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
              dark:focus-visible:ring-offset-slate-900 whitespace-nowrap
              ${isActive
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                : 'text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
              }
            `
            }
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            role="tab"
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
