/**
 * PageHeader.tsx — Shared page header for feature pages.
 *
 * Consistent icon tile + title + subtitle + actions across every
 * workspace page (Projects, Editor, AI Scan, Form Fields, Bulk Scan,
 * Bulk Generate).
 */

import type { ReactNode } from 'react';

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Renders the "AI" gradient variant of the icon tile. */
  ai?: boolean;
}

export function PageHeader({ icon, title, subtitle, actions, ai = false }: PageHeaderProps) {
  return (
    <div className="page-head">
      <div className={`page-head__icon ${ai ? 'page-head__icon--ai' : ''}`} aria-hidden="true">
        {icon}
      </div>
      <div className="page-head__body">
        <h2 className="page-head__title">{title}</h2>
        {subtitle && <p className="page-head__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}
