/**
 * services/preference.service.ts
 *
 * CRUD operations for user_preferences stored in Supabase.
 * Manages user UI state (theme, sidebar, tabs, notifications) with cloud sync.
 */

import { supabase } from '../utils/supabase';
import { toError } from '../utils/supabaseError';

export interface UserPreferences {
  id: string;
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  last_active_tab: 'projects' | 'editor' | 'bulk';
  sidebar_collapsed: boolean;
  notifications_enabled: boolean;
  ui_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by?: string;
}

export const PreferenceService = {
  /**
   * Get user preferences, or return defaults if not found
   */
  async getPreferences(userId: string): Promise<UserPreferences> {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw toError(error);

    // Return existing preferences or sensible defaults
    if (data) {
      return data as UserPreferences;
    }

    return {
      id: '',
      user_id: userId,
      theme: 'system',
      last_active_tab: 'projects',
      sidebar_collapsed: false,
      notifications_enabled: true,
      ui_state: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  /**
   * Update a single preference field (theme, sidebar, etc.)
   */
  async updatePreference(
    userId: string,
    key: keyof Omit<UserPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'updated_by'>,
    value: unknown
  ): Promise<void> {
    const { data: existing, error: getError } = await supabase
      .from('user_preferences')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (getError) throw toError(getError);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('user_preferences')
        .update({ [key]: value, updated_by: user.id })
        .eq('user_id', userId);
      if (error) throw toError(error);
    } else {
      // Create new with defaults
      const defaults = {
        user_id: userId,
        theme: 'system',
        last_active_tab: 'projects',
        sidebar_collapsed: false,
        notifications_enabled: true,
        ui_state: {},
      };
      const { error } = await supabase
        .from('user_preferences')
        .insert({ ...defaults, [key]: value, updated_by: user.id });
      if (error) throw toError(error);
    }
  },

  /**
   * Bulk update multiple preferences at once
   */
  async updateAllPreferences(
    userId: string,
    updates: Partial<Omit<UserPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'updated_by'>>
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existing, error: getError } = await supabase
      .from('user_preferences')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (getError) throw toError(getError);

    if (existing) {
      // Update
      const { error } = await supabase
        .from('user_preferences')
        .update({ ...updates, updated_by: user.id })
        .eq('user_id', userId);
      if (error) throw toError(error);
    } else {
      // Create
      const defaults = {
        user_id: userId,
        theme: 'system',
        last_active_tab: 'projects',
        sidebar_collapsed: false,
        notifications_enabled: true,
        ui_state: {},
      };
      const { error } = await supabase
        .from('user_preferences')
        .insert({ ...defaults, ...updates, updated_by: user.id });
      if (error) throw toError(error);
    }
  },
};

