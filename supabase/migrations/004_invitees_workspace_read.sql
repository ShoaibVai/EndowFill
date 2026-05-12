-- Allow users with pending invites to view the workspace details
CREATE POLICY "workspaces: invitees can read"
  ON public.workspaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_invites wi
      WHERE wi.workspace_id = workspaces.id
        AND wi.invited_email = auth.email()
        AND wi.accepted_at IS NULL
        AND wi.expires_at > now()
    )
  );
