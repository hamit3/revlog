import { useCallback, useEffect, useState } from 'react';
import { supabaseClient } from '../providers/supabaseClient';
import type { Product, Project, ProjectRole } from '../types/database';

export interface ProjectAccessResult {
  project: Project | null;
  role: ProjectRole | null;
  isOwner: boolean;
  canEditContent: boolean;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export interface ProductAccessResult {
  project: Project | null;
  product: Product | null;
  role: ProjectRole | null;
  isOwner: boolean;
  canEditProject: boolean;
  canEditContent: boolean;
  canManageProduct: boolean;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

interface CachedProjectAccess {
  project: Project | null;
  role: ProjectRole | null;
}

interface CachedProductAccess {
  project: Project | null;
  product: Product | null;
  role: ProjectRole | null;
}

const projectCache = new Map<string, CachedProjectAccess>();
const productCache = new Map<string, CachedProductAccess>();

export function clearProjectAccessCache(): void {
  projectCache.clear();
  productCache.clear();
}

export function useProjectAccess(projectId: string | undefined): ProjectAccessResult {
  const cached = projectId ? projectCache.get(projectId) : undefined;
  const [project, setProject] = useState<Project | null>(() => cached?.project ?? null);
  const [role, setRole] = useState<ProjectRole | null>(() => cached?.role ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(projectId && !cached));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setRole(null);
      setIsLoading(false);
      return;
    }

    if (!projectCache.has(projectId)) {
      setIsLoading(true);
    }
    setError(null);

    const [projectRes, roleRes] = await Promise.all([
      supabaseClient.from('projects').select('*').eq('id', projectId).maybeSingle(),
      supabaseClient.rpc('project_role', { p_project_id: projectId }),
    ]);

    if (projectRes.error) {
      setError(projectRes.error.message);
      setProject(null);
      setRole(null);
      projectCache.delete(projectId);
      setIsLoading(false);
      return;
    }

    const nextProject = (projectRes.data as Project | null) ?? null;
    const nextRole = (roleRes.data as ProjectRole | null) ?? null;
    projectCache.set(projectId, { project: nextProject, role: nextRole });

    setProject(nextProject);
    setRole(nextRole);
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId) {
        if (active) {
          setProject(null);
          setRole(null);
          setIsLoading(false);
        }
        return;
      }
      const [projectRes, roleRes] = await Promise.all([
        supabaseClient.from('projects').select('*').eq('id', projectId).maybeSingle(),
        supabaseClient.rpc('project_role', { p_project_id: projectId }),
      ]);
      if (!active) {
        return;
      }
      if (projectRes.error) {
        setError(projectRes.error.message);
        setProject(null);
        setRole(null);
        projectCache.delete(projectId);
      } else {
        setError(null);
        const nextProject = (projectRes.data as Project | null) ?? null;
        const nextRole = (roleRes.data as ProjectRole | null) ?? null;
        projectCache.set(projectId, { project: nextProject, role: nextRole });
        setProject(nextProject);
        setRole(nextRole);
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId]);

  const isOwner = role === 'owner';
  const canEditContent =
    (role === 'owner' || role === 'member') && Boolean(project) && !project?.archived;

  return {
    project,
    role,
    isOwner,
    canEditContent,
    isLoading,
    error,
    reload: load,
  };
}

export function useProductAccess(
  projectId: string | undefined,
  productId: string | undefined,
): ProductAccessResult {
  const cacheKey = projectId && productId ? `${projectId}:${productId}` : undefined;
  const cached = cacheKey ? productCache.get(cacheKey) : undefined;

  const [project, setProject] = useState<Project | null>(() => cached?.project ?? null);
  const [product, setProduct] = useState<Product | null>(() => cached?.product ?? null);
  const [role, setRole] = useState<ProjectRole | null>(() => cached?.role ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(projectId && productId && !cached));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !productId) {
      setProject(null);
      setProduct(null);
      setRole(null);
      setIsLoading(false);
      return;
    }

    if (!cacheKey || !productCache.has(cacheKey)) {
      setIsLoading(true);
    }
    setError(null);

    const [projectRes, productRes, roleRes] = await Promise.all([
      supabaseClient.from('projects').select('*').eq('id', projectId).maybeSingle(),
      supabaseClient
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('project_id', projectId)
        .maybeSingle(),
      supabaseClient.rpc('project_role', { p_project_id: projectId }),
    ]);

    if (projectRes.error || productRes.error) {
      setError(projectRes.error?.message ?? productRes.error?.message ?? null);
      setProject(null);
      setProduct(null);
      setRole(null);
      if (cacheKey) {
        productCache.delete(cacheKey);
      }
      setIsLoading(false);
      return;
    }

    const nextProject = (projectRes.data as Project | null) ?? null;
    const nextProduct = (productRes.data as Product | null) ?? null;
    const nextRole = (roleRes.data as ProjectRole | null) ?? null;

    if (cacheKey) {
      productCache.set(cacheKey, {
        project: nextProject,
        product: nextProduct,
        role: nextRole,
      });
    }

    setProject(nextProject);
    setProduct(nextProduct);
    setRole(nextRole);
    setIsLoading(false);
  }, [cacheKey, projectId, productId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !productId) {
        if (active) {
          setProject(null);
          setProduct(null);
          setRole(null);
          setIsLoading(false);
        }
        return;
      }
      const [projectRes, productRes, roleRes] = await Promise.all([
        supabaseClient.from('projects').select('*').eq('id', projectId).maybeSingle(),
        supabaseClient
          .from('products')
          .select('*')
          .eq('id', productId)
          .eq('project_id', projectId)
          .maybeSingle(),
        supabaseClient.rpc('project_role', { p_project_id: projectId }),
      ]);
      if (!active) {
        return;
      }
      if (projectRes.error || productRes.error) {
        setError(projectRes.error?.message ?? productRes.error?.message ?? null);
        setProject(null);
        setProduct(null);
        setRole(null);
        if (cacheKey) {
          productCache.delete(cacheKey);
        }
      } else {
        setError(null);
        const nextProject = (projectRes.data as Project | null) ?? null;
        const nextProduct = (productRes.data as Product | null) ?? null;
        const nextRole = (roleRes.data as ProjectRole | null) ?? null;

        if (cacheKey) {
          productCache.set(cacheKey, {
            project: nextProject,
            product: nextProduct,
            role: nextRole,
          });
        }

        setProject(nextProject);
        setProduct(nextProduct);
        setRole(nextRole);
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [cacheKey, projectId, productId]);

  const isOwner = role === 'owner';
  const canEditProject =
    (role === 'owner' || role === 'member') && Boolean(project) && !project?.archived;
  const canEditContent = canEditProject && Boolean(product) && !product?.archived;
  const canManageProduct = isOwner && Boolean(project) && !project?.archived && Boolean(product);

  return {
    project,
    product,
    role,
    isOwner,
    canEditProject,
    canEditContent,
    canManageProduct,
    isLoading,
    error,
    reload: load,
  };
}
