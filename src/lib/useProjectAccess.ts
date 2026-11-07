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

export function useProjectAccess(projectId: string | undefined): ProjectAccessResult {
  const [project, setProject] = useState<Project | null>(null);
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setRole(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const [projectRes, roleRes] = await Promise.all([
      supabaseClient.from('projects').select('*').eq('id', projectId).maybeSingle(),
      supabaseClient.rpc('project_role', { p_project_id: projectId }),
    ]);

    if (projectRes.error) {
      setError(projectRes.error.message);
      setProject(null);
      setRole(null);
      setIsLoading(false);
      return;
    }

    setProject((projectRes.data as Project | null) ?? null);
    setRole((roleRes.data as ProjectRole | null) ?? null);
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
      } else {
        setError(null);
        setProject((projectRes.data as Project | null) ?? null);
        setRole((roleRes.data as ProjectRole | null) ?? null);
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
  const [project, setProject] = useState<Project | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !productId) {
      setProject(null);
      setProduct(null);
      setRole(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
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
      setIsLoading(false);
      return;
    }

    setProject((projectRes.data as Project | null) ?? null);
    setProduct((productRes.data as Product | null) ?? null);
    setRole((roleRes.data as ProjectRole | null) ?? null);
    setIsLoading(false);
  }, [projectId, productId]);

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
      } else {
        setError(null);
        setProject((projectRes.data as Project | null) ?? null);
        setProduct((productRes.data as Product | null) ?? null);
        setRole((roleRes.data as ProjectRole | null) ?? null);
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, productId]);

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
