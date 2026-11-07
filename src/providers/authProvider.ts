import type { AuthProvider } from '@refinedev/core';
import { supabaseClient } from './supabaseClient';
import type { Profile } from '../types/database';

export interface LoginParams {
  email: string;
  password: string;
}

export interface RegisterParams {
  email: string;
  password: string;
  fullName: string;
}

export const authProvider: AuthProvider = {
  login: async (params: LoginParams) => {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: params.email.trim(),
      password: params.password,
    });

    if (error) {
      return {
        success: false,
        error: {
          name: 'LoginError',
          message: error.message,
        },
      };
    }

    if (data.session) {
      return {
        success: true,
        redirectTo: '/projects',
      };
    }

    return {
      success: false,
      error: {
        name: 'LoginError',
        message: 'Authentication failed.',
      },
    };
  },

  register: async (params: RegisterParams) => {
    const { data, error } = await supabaseClient.auth.signUp({
      email: params.email.trim(),
      password: params.password,
      options: {
        data: {
          full_name: params.fullName.trim(),
        },
      },
    });

    if (error) {
      return {
        success: false,
        error: {
          name: 'RegisterError',
          message: error.message,
        },
      };
    }

    if (data.session) {
      return {
        success: true,
        redirectTo: '/projects',
      };
    }

    return {
      success: true,
      redirectTo: '/login',
    };
  },

  logout: async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      return {
        success: false,
        error: {
          name: 'LogoutError',
          message: error.message,
        },
      };
    }
    return {
      success: true,
      redirectTo: '/login',
    };
  },

  check: async () => {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) {
      return {
        authenticated: false,
        redirectTo: '/login',
        logout: true,
      };
    }
    return {
      authenticated: true,
    };
  },

  getPermissions: async (params?: { projectId?: string }) => {
    if (!params?.projectId) {
      return null;
    }
    const { data, error } = await supabaseClient.rpc('project_role', {
      p_project_id: params.projectId,
    });
    if (error) {
      return null;
    }
    return data as string | null;
  },

  getIdentity: async () => {
    const { data } = await supabaseClient.auth.getUser();
    const user = data.user;
    if (!user) {
      return null;
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('id, full_name, email, created_at')
      .eq('id', user.id)
      .maybeSingle();

    const typedProfile = profile as Profile | null;

    return {
      id: user.id,
      email: typedProfile?.email ?? user.email ?? '',
      name:
        typedProfile?.full_name ||
        (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
        user.email ||
        '',
    };
  },

  onError: async (error) => {
    if (error?.status === 401 || error?.statusCode === 401) {
      return {
        logout: true,
        redirectTo: '/login',
      };
    }
    return { error };
  },
};
