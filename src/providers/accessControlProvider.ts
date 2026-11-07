import type { AccessControlProvider } from '@refinedev/core';
import type { ProjectRole } from '../types/database';
import { supabaseClient } from './supabaseClient';

export function canPerformProjectAction(
  role: ProjectRole | null | undefined,
  resource: string | undefined,
  action: string,
): boolean {
  if (resource === 'projects' && (action === 'list' || action === 'create')) {
    return true;
  }

  if (!role) {
    return false;
  }

  if (action === 'list' || action === 'show') {
    return true;
  }

  if (
    resource === 'projects' ||
    resource === 'products' ||
    resource === 'categories' ||
    resource === 'project_members'
  ) {
    return role === 'owner';
  }

  if (
    resource === 'items' ||
    resource === 'releases' ||
    resource === 'release_items' ||
    resource === 'project_releases' ||
    resource === 'project_release_products'
  ) {
    return role === 'owner' || role === 'member';
  }

  return false;
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action, params }) => {
    if (resource === 'projects' && (action === 'list' || action === 'create')) {
      return { can: true };
    }

    const explicitRole = params?.role as ProjectRole | undefined;
    const projectId = params?.projectId as string | undefined;

    let role: ProjectRole | null = explicitRole ?? null;
    if (!role && projectId) {
      const { data } = await supabaseClient.rpc('project_role', {
        p_project_id: projectId,
      });
      role = (data as ProjectRole | null) ?? null;
    }

    return {
      can: canPerformProjectAction(role, resource, action),
    };
  },
};
