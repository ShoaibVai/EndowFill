/**
 * services/workspace.service.ts
 *
 * All CRUD operations for workspaces, members, and invites.
 * Every call goes through Supabase RLS, so users only see data
 * they are authorised to see.
 */

import { supabase } from '../utils/supabase';
import { toError } from '../utils/supabaseError';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by?: string;
  joined_at: string;
  /** Joined from profiles */
  profile?: {
    email?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  invited_email: string;
  role: WorkspaceRole;
  token: string;
  invited_by?: string;
  expires_at: string;
  accepted_at?: string;
}

export interface WorkspaceWithMeta extends Workspace {
  role: WorkspaceRole;          // current user's role
  member_count: number;
  template_count: number;
  members: WorkspaceMember[];   // first few for avatars
}

export type JoinRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface JoinRequest {
  id: string;
  workspace_id: string;
  user_id: string;
  message?: string;
  status: JoinRequestStatus;
  requested_at: string;
  processed_at?: string;
  processed_by?: string;
  /** Joined from profiles */
  profile?: {
    email?: string;
    full_name?: string;
    avatar_url?: string;
  };
  /** Joined from workspaces */
  workspace?: {
    name?: string;
    description?: string;
  };
}

// ── Workspace CRUD ─────────────────────────────────────────────────────────────

export const WorkspaceService = {

  /** List all workspaces the current user belongs to */
  async listMyWorkspaces(): Promise<WorkspaceWithMeta[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get workspaces + member data in one query using a join
    const { data: memberRows, error } = await supabase
      .from('workspace_members')
      .select(`
        role,
        workspace:workspaces (
          id, name, description, created_by, created_at, updated_at
        )
      `)
      .eq('user_id', user.id);

    if (error) throw toError(error);
    if (!memberRows?.length) return [];

    const workspaceIds = memberRows.map((r) => (r.workspace as unknown as Workspace).id);

    // Get member counts
    const { data: memberCounts } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .in('workspace_id', workspaceIds);

    // Get template counts
    const { data: templateCounts } = await supabase
      .from('workspace_templates')
      .select('workspace_id')
      .in('workspace_id', workspaceIds);

    // Get first 5 members for each workspace (for avatar display)
    const { data: allMembers } = await supabase
      .from('workspace_members')
      .select('id, workspace_id, user_id, role, joined_at')
      .in('workspace_id', workspaceIds)
      .limit(50);

    return memberRows.map((r) => {
      const ws = r.workspace as unknown as Workspace;
      const memberCount = memberCounts?.filter(m => m.workspace_id === ws.id).length ?? 0;
      const templateCount = templateCounts?.filter(t => t.workspace_id === ws.id).length ?? 0;
      const members = (allMembers ?? [])
        .filter(m => m.workspace_id === ws.id)
        .slice(0, 5) as unknown as WorkspaceMember[];

      return {
        ...ws,
        role: r.role as WorkspaceRole,
        member_count: memberCount,
        template_count: templateCount,
        members,
      };
    });
  },

  /** Create a new workspace and add creator as owner */
  async createWorkspace(name: string, description?: string): Promise<Workspace> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use a single RPC call to avoid RLS self-referencing issue
    const { data: ws, error: wsError } = await supabase
      .from('workspaces')
      .insert({ name, description, created_by: user.id })
      .select()
      .single();

    if (wsError) {
      throw new Error(wsError.message || 'Failed to create workspace');
    }

    // Use service role bypass via an RPC to avoid RLS chicken-and-egg problem
    const { error: memberError } = await supabase.rpc('add_workspace_owner', {
      p_workspace_id: ws.id,
      p_user_id: user.id,
    });

    if (memberError) {
      // Fallback: try direct insert (works with the 'self-join via invite' RLS path)
      const { error: fallbackError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: ws.id,
          user_id: user.id,
          role: 'owner',
          invited_by: user.id,
        });

      if (fallbackError) {
        // Clean up the orphaned workspace
        await supabase.from('workspaces').delete().eq('id', ws.id);
        throw new Error(fallbackError.message || 'Failed to add creator as owner');
      }
    }

    return ws as Workspace;
  },

  /** Get a single workspace by ID */
  async getWorkspace(id: string): Promise<WorkspaceWithMeta | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: ws, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !ws) return null;

    const { data: myMembership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!myMembership) return null; // user is not a member

    const { data: members } = await supabase
      .from('workspace_members')
      .select('id, workspace_id, user_id, role, joined_at')
      .eq('workspace_id', id);

    const { data: templateCounts } = await supabase
      .from('workspace_templates')
      .select('id')
      .eq('workspace_id', id);

    return {
      ...(ws as Workspace),
      role: myMembership.role as WorkspaceRole,
      member_count: members?.length ?? 0,
      template_count: templateCounts?.length ?? 0,
      members: (members ?? []) as unknown as WorkspaceMember[],
    };
  },

  /** Rename / update a workspace */
  async updateWorkspace(id: string, patch: Partial<Pick<Workspace, 'name' | 'description'>>): Promise<void> {
    const { error } = await supabase
      .from('workspaces')
      .update(patch)
      .eq('id', id);
    if (error) throw toError(error);
  },

  /** Delete a workspace (owner only — enforced by RLS) */
  async deleteWorkspace(id: string): Promise<void> {
    const { error } = await supabase
      .from('workspaces')
      .delete()
      .eq('id', id);
    if (error) throw toError(error);
  },

  // ── Members ────────────────────────────────────────────────────────────────

  /** Update a member's role */
  async updateMemberRole(workspaceId: string, memberId: string, role: WorkspaceRole): Promise<void> {
    const { error } = await supabase
      .from('workspace_members')
      .update({ role })
      .eq('id', memberId)
      .eq('workspace_id', workspaceId);
    if (error) throw toError(error);
  },

  /** Remove a member from a workspace */
  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);
    if (error) throw toError(error);
  },

  // ── Invites ────────────────────────────────────────────────────────────────

  /** Create an invite and return the invite record (with token) */
  async createInvite(workspaceId: string, email: string, role: 'editor' | 'viewer'): Promise<WorkspaceInvite> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('workspace_invites')
      .insert({
        workspace_id: workspaceId,
        invited_email: email.toLowerCase().trim(),
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) throw toError(error);
    return data as WorkspaceInvite;
  },

  /** List all pending invites for a workspace */
  async listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const { data, error } = await supabase
      .from('workspace_invites')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false });

    if (error) throw toError(error);
    return (data ?? []) as WorkspaceInvite[];
  },

  /** Revoke an invite */
  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await supabase
      .from('workspace_invites')
      .delete()
      .eq('id', inviteId);
    if (error) throw toError(error);
  },

  /** Get all pending invites for the current user (in-app notifications) */
  async getMyPendingInvites(): Promise<{
    id: string;
    workspace_id: string;
    workspace_name: string;
    role: WorkspaceRole;
    invited_by: string;
    invited_by_name?: string;
    invited_by_email?: string;
    created_at: string;
    expires_at: string;
  }[]> {
    const { data, error } = await supabase.rpc('get_my_pending_invites');
    if (error) throw toError(error);
    return (data ?? []) as any;
  },

  /** Accept an invite by ID (for in-app acceptance) */
  async acceptInviteById(inviteId: string): Promise<string> {
    const { data, error } = await supabase.rpc('accept_invite_by_id', {
      p_invite_id: inviteId,
    });
    if (error) throw toError(error);
    return data as string;
  },

  /** Decline an invite by ID */
  async declineInvite(inviteId: string): Promise<void> {
    const { error } = await supabase.rpc('decline_invite', {
      p_invite_id: inviteId,
    });
    if (error) throw toError(error);
  },

  /** Look up an invite by token (public — no auth required for read) */
  async getInviteByToken(token: string): Promise<(WorkspaceInvite & { workspace: Workspace }) | null> {
    const { data, error } = await supabase
      .from('workspace_invites')
      .select(`*, workspace:workspaces(id, name, description)`)
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as (WorkspaceInvite & { workspace: Workspace });
  },

  /** Accept an invite — adds user as member and marks invite accepted */
  async acceptInvite(token: string): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Must be signed in to accept an invite');

    const invite = await WorkspaceService.getInviteByToken(token);
    if (!invite) throw new Error('Invite not found or expired');

    // Add as member
    const { error: memberError } = await supabase
      .from('workspace_members')
      .upsert({
        workspace_id: invite.workspace_id,
        user_id: user.id,
        role: invite.role,
        invited_by: invite.invited_by,
      }, { onConflict: 'workspace_id,user_id' });

    if (memberError) throw memberError;

    // Mark invite accepted
    await supabase
      .from('workspace_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('token', token);

    return invite.workspace_id;
  },

  // ── Join Requests ───────────────────────────────────────────────────────

  /** Create a join request for the current user */
  async createJoinRequest(workspaceId: string, message?: string): Promise<JoinRequest> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('workspace_join_requests')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        message: message?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('You already have a pending request for this workspace');
      }
      throw toError(error);
    }
    return data as JoinRequest;
  },

  /** List pending join requests for a workspace (owner/editor only) */
  async listJoinRequests(workspaceId: string): Promise<JoinRequest[]> {
    const { data, error } = await supabase
      .from('workspace_join_requests')
      .select(`
        *,
        profile:profiles(email, full_name, avatar_url)
      `)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (error) throw toError(error);
    return (data ?? []) as unknown as JoinRequest[];
  },

  /** List join requests made by the current user */
  async listMyJoinRequests(): Promise<JoinRequest[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('workspace_join_requests')
      .select(`
        *,
        workspace:workspaces(name, description)
      `)
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false });

    if (error) throw toError(error);
    return (data ?? []) as unknown as JoinRequest[];
  },

  /** Check if the current user has a pending request for a workspace */
  async hasPendingJoinRequest(workspaceId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('workspace_join_requests')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (error) return false;
    return !!data;
  },

  /** Accept a join request — adds user as member (owner only) */
  async acceptJoinRequest(requestId: string, role: WorkspaceRole): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get the request
    const { data: request, error: fetchError } = await supabase
      .from('workspace_join_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .maybeSingle();

    if (fetchError || !request) throw new Error('Join request not found');

    // Add as member
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: request.workspace_id,
        user_id: request.user_id,
        role,
        invited_by: user.id,
      });

    if (memberError) {
      if (memberError.code === '23505') {
        throw new Error('User is already a member of this workspace');
      }
      throw memberError;
    }

    // Update request status
    const { error: updateError } = await supabase
      .from('workspace_join_requests')
      .update({
        status: 'accepted',
        processed_at: new Date().toISOString(),
        processed_by: user.id,
      })
      .eq('id', requestId);

    if (updateError) throw toError(updateError);
  },

  /** Reject a join request (owner only) */
  async rejectJoinRequest(requestId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('workspace_join_requests')
      .update({
        status: 'rejected',
        processed_at: new Date().toISOString(),
        processed_by: user.id,
      })
      .eq('id', requestId);

    if (error) throw toError(error);
  },

  /** Cancel a join request (user can cancel their own pending request) */
  async cancelJoinRequest(requestId: string): Promise<void> {
    const { error } = await supabase
      .from('workspace_join_requests')
      .delete()
      .eq('id', requestId);

    if (error) throw toError(error);
  },
};
