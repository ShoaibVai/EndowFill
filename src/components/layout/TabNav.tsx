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

  return (
    <nav aria-label="Main Navigation" className="flex items-center gap-2 px-6 py-2 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`
              group flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium
              transition-all duration-200 outline-none
              focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
              dark:focus-visible:ring-offset-slate-900 whitespace-nowrap
              ${isActive
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              }
            `}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            role="tab"
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className={`hidden lg:inline text-xs transition-opacity ${isActive ? 'opacity-80' : 'opacity-60 group-hover:opacity-100'}`}>
              — {tab.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
