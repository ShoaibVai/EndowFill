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
    <nav aria-label="Main Navigation" className="tab-nav">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-nav__btn ${isActive ? 'tab-nav__btn--active' : ''}`}
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
