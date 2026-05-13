/**
 * EmptyState.tsx — Reusable empty/placeholder component for when no data is loaded.
 */

import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 animate-fade-in">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100))',
          color: 'var(--color-primary-500)',
        }}
      >
        {icon}
      </div>
      <h3
        className="text-lg font-semibold mb-2"
        style={{ color: 'var(--color-surface-800)' }}
      >
        {title}
      </h3>
      <p
        className="text-sm text-center max-w-sm mb-6"
        style={{ color: 'var(--color-surface-400)', lineHeight: 1.6 }}
      >
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
