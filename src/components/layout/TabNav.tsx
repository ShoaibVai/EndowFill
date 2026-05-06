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
    <div className="flex items-center gap-2 px-6 py-3"
         style={{ background: 'var(--color-surface-50)', borderBottom: '1px solid var(--color-surface-200)' }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-medium
              transition-all duration-200 cursor-pointer
              ${isActive
                ? ''
                : 'hover:bg-white/60'
              }
            `}
            style={
              isActive
                ? {
                    background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))',
                    color: 'white',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                  }
                : {
                    color: 'var(--color-surface-500)',
                  }
            }
            aria-selected={isActive}
            role="tab"
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className="hidden lg:inline text-xs opacity-70 ml-1">
              — {tab.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
