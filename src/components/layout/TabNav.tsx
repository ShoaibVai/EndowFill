/**
 * TabNav.tsx — Durable application navigation (replaces the fragile tab strip).
 *
 * The old implementation returned `null` whenever `activeTab === 'projects'`,
 * which made every nav item disappear on the Projects page — the single
 * biggest reason the AI features were undiscoverable. This version NEVER
 * hides: it renders a persistent experience at every breakpoint:
 *
 *  - Desktop (≥1024px): sticky left sidebar with grouped nav (Workspace /
 *    AI Workflow) — icon + label + description, clear active state.
 *  - Mobile (<1024px): fixed bottom tab bar (Projects, Editor, AI Scan,
 *    Generate) + a "More" drawer with the remaining items.
 *
 * Switching still uses the Zustand `activeTab` contract — no routing changes.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Files,
  FolderKanban,
  HelpCircle,
  LayoutGrid,
  Menu,
  PenTool,
  ScanText,
  Sparkles,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ActiveTab } from '../../types/pdfme.types';

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const WORKSPACE_ITEMS: NavItem[] = [
  {
    id: 'projects',
    label: 'Projects',
    icon: <FolderKanban className="w-[18px] h-[18px]" />,
    description: 'Saved templates',
  },
  {
    id: 'editor',
    label: 'Template Editor',
    icon: <PenTool className="w-[18px] h-[18px]" />,
    description: 'Design & map fields',
  },
];

const AI_ITEMS: NavItem[] = [
  {
    id: 'scan',
    label: 'AI Scan',
    icon: <ScanText className="w-[18px] h-[18px]" />,
    description: 'Extract data from a document',
  },
  {
    id: 'form-fields',
    label: 'Form Fields',
    icon: <WandSparkles className="w-[18px] h-[18px]" />,
    description: 'Make forms fillable',
  },
  {
    id: 'bulk-scan',
    label: 'Bulk Scan',
    icon: <Files className="w-[18px] h-[18px]" />,
    description: 'Scan many documents',
  },
  {
    id: 'generate',
    label: 'Bulk Generate',
    icon: <Zap className="w-[18px] h-[18px]" />,
    description: 'Create PDFs en masse',
  },
];

/** Mobile bottom-bar shortcut (4 most important destinations). */
const BOTTOM_ITEMS: NavItem[] = [
  WORKSPACE_ITEMS[0],
  WORKSPACE_ITEMS[1],
  AI_ITEMS[0],
  AI_ITEMS[3],
];

function NavItemButton({
  item,
  active,
  onSelect,
  className,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (id: ActiveTab) => void;
  className: string;
}) {
  return (
    <button
      key={item.id}
      id={`tab-${item.id}`}
      onClick={() => onSelect(item.id)}
      className={className}
      aria-current={active ? 'page' : undefined}
      title={`${item.label} — ${item.description}`}
    >
      <span className="app-nav-item__icon">{item.icon}</span>
      <span className="app-nav-item__body">
        <span className="app-nav-item__label">{item.label}</span>
        <span className="app-nav-item__desc">{item.description}</span>
      </span>
    </button>
  );
}

export function TabNav() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSelect = (tab: ActiveTab) => {
    setActiveTab(tab);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="app-sidebar" aria-label="Main navigation">
        {/* Workspace group */}
        <div className="app-nav-section">
          <span className="app-nav-section__label">Workspace</span>
          {WORKSPACE_ITEMS.map((item) => (
            <NavItemButton
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onSelect={handleSelect}
              className={`app-nav-item ${activeTab === item.id ? 'app-nav-item--active' : ''}`}
            />
          ))}
        </div>

        {/* AI Workflow group */}
        <div className="app-nav-section">
          <span className="app-nav-section__label">
            AI Workflow
            <span className="app-nav-ai-badge">
              <Sparkles className="w-[10px] h-[10px]" />
              AI
            </span>
          </span>
          {AI_ITEMS.map((item) => (
            <NavItemButton
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onSelect={handleSelect}
              className={`app-nav-item ${activeTab === item.id ? 'app-nav-item--active' : ''}`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="app-sidebar__footer">
          <a href="#/home" className="app-nav-item" onClick={(e) => { e.preventDefault(); navigate('/home'); }}>
            <span className="app-nav-item__icon"><LayoutGrid className="w-[18px] h-[18px]" /></span>
            <span className="app-nav-item__body">
              <span className="app-nav-item__label">Back to Workspaces</span>
              <span className="app-nav-item__desc">Switch workspace or sign out</span>
            </span>
          </a>
          <button
            type="button"
            onClick={() => {
              // Help tour is triggered from the top bar; here we simply
              // surface the same affordance for keyboard/sidebar users.
              document.getElementById('help-tour-btn')?.click();
            }}
            className="app-nav-item"
          >
            <span className="app-nav-item__icon"><HelpCircle className="w-[18px] h-[18px]" /></span>
            <span className="app-nav-item__body">
              <span className="app-nav-item__label">Guided tour</span>
              <span className="app-nav-item__desc">See the Scan → Map → Generate flow</span>
            </span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom bar ───────────────────────────────────────── */}
      <nav className="app-bottom-bar" aria-label="Main navigation (mobile)">
        {BOTTOM_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              onClick={() => handleSelect(item.id)}
              className={`app-bottom-item ${active ? 'app-bottom-item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`app-bottom-item ${drawerOpen ? 'app-bottom-item--active' : ''}`}
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
        >
          <Menu className="w-[20px] h-[20px]" />
          <span>More</span>
        </button>
      </nav>

      {/* ── Mobile "More" drawer ────────────────────────────────────── */}
      {drawerOpen && (
        <>
          <div
            className="app-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="app-drawer" role="dialog" aria-modal="true" aria-label="More navigation">
            <div className="app-drawer__handle" />
            <div className="app-drawer__title">All tools</div>

            <div className="flex flex-col gap-1 pb-3">
              <span className="app-nav-section__label">Workspace</span>
              {WORKSPACE_ITEMS.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`tab-${item.id}`}
                    onClick={() => handleSelect(item.id)}
                    className={`app-drawer-item ${active ? 'app-drawer-item--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="app-drawer-item__icon">{item.icon}</span>
                    <span className="flex flex-col min-w-0">
                      <span className="app-drawer-item__label">{item.label}</span>
                      <span className="app-drawer-item__desc">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-1 pb-3">
              <span className="app-nav-section__label">
                AI Workflow
                <span className="app-nav-ai-badge">
                  <Sparkles className="w-[10px] h-[10px]" /> AI
                </span>
              </span>
              {AI_ITEMS.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`tab-${item.id}`}
                    onClick={() => handleSelect(item.id)}
                    className={`app-drawer-item ${active ? 'app-drawer-item--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="app-drawer-item__icon">{item.icon}</span>
                    <span className="flex flex-col min-w-0">
                      <span className="app-drawer-item__label">{item.label}</span>
                      <span className="app-drawer-item__desc">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="app-drawer-item"
              onClick={() => {
                setDrawerOpen(false);
                document.getElementById('help-tour-btn')?.click();
              }}
            >
              <span className="app-drawer-item__icon"><HelpCircle className="w-[18px] h-[18px]" /></span>
              <span className="flex flex-col min-w-0">
                <span className="app-drawer-item__label">Guided tour</span>
                <span className="app-drawer-item__desc">See the Scan → Map → Generate flow</span>
              </span>
            </button>

            <button
              type="button"
              className="app-drawer-item"
              onClick={() => {
                setDrawerOpen(false);
                navigate('/home');
              }}
            >
              <span className="app-drawer-item__icon"><LayoutGrid className="w-[18px] h-[18px]" /></span>
              <span className="flex flex-col min-w-0">
                <span className="app-drawer-item__label">Back to Workspaces</span>
                <span className="app-drawer-item__desc">Switch workspace or sign out</span>
              </span>
            </button>

            <button
              type="button"
              className="app-drawer-item"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              <span className="app-drawer-item__icon"><X className="w-[18px] h-[18px]" /></span>
              <span className="flex flex-col min-w-0">
                <span className="app-drawer-item__label">Close</span>
                <span className="app-drawer-item__desc">Keep working in the current view</span>
              </span>
            </button>
          </div>
        </>
      )}
    </>
  );
}
