/**
 * components/workspace/MemberAvatars.tsx
 *
 * Displays overlapping avatar circles for workspace members,
 * with tooltip on hover and a +N overflow badge.
 */

import type { WorkspaceMember } from '../../services/workspace.service';

interface MemberAvatarsProps {
  members: WorkspaceMember[];
  maxVisible?: number;
  size?: number;
}

function initials(m: WorkspaceMember): string {
  const name = m.profile?.full_name || m.profile?.email || '?';
  return name.slice(0, 2).toUpperCase();
}

const ROLE_COLORS: Record<string, string> = {
  owner:  'var(--color-primary-500)',
  editor: '#10b981',
  viewer: '#94a3b8',
};

export function MemberAvatars({ members, maxVisible = 5, size = 32 }: MemberAvatarsProps) {
  const visible = members.slice(0, maxVisible);
  const overflow = members.length - maxVisible;

  return (
    <div className="member-avatars" style={{ '--avatar-size': `${size}px` } as React.CSSProperties}>
      {visible.map((m, i) => (
        <div
          key={m.id}
          className="member-avatar"
          style={{ zIndex: visible.length - i, borderColor: ROLE_COLORS[m.role] }}
          title={`${m.profile?.full_name || m.profile?.email || 'Member'} (${m.role})`}
        >
          {m.profile?.avatar_url ? (
            <img src={m.profile.avatar_url} alt={m.profile.full_name || ''} />
          ) : (
            <span>{initials(m)}</span>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div className="member-avatar member-avatar--overflow" title={`+${overflow} more members`}>
          +{overflow}
        </div>
      )}
    </div>
  );
}
