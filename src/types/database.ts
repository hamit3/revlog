export type ProjectRole = 'owner' | 'member' | 'viewer';
export type ItemKind = 'file' | 'link';
export type ReleaseStatus = 'draft' | 'published';
export type ProductType = 'hardware' | 'software' | 'mixed';
export type ProductTemplate = 'hardware_software' | 'hardware_only' | 'software_only' | 'empty';
export type ProjectTemplate = 'hardware_product' | 'empty';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  project_id: string;
  name: string;
  code: string | null;
  product_type: ProductType;
  description: string | null;
  archived: boolean;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
  profiles?: Profile | null;
}

export interface Category {
  id: string;
  project_id: string;
  product_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
}

export interface Item {
  id: string;
  project_id: string;
  product_id: string;
  category_id: string;
  title: string;
  kind: ItemKind;
  version_label: string;
  note: string | null;
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  sha256: string | null;
  archived: boolean;
  created_by: string;
  created_at: string;
  profiles?: Profile | null;
}

export interface Release {
  id: string;
  project_id: string;
  product_id: string;
  version_label: string;
  notes: string | null;
  status: ReleaseStatus;
  published_at: string | null;
  published_by: string | null;
  manifest_hash: string | null;
  created_at: string;
  profiles?: Profile | null;
}

export interface ReleaseItem {
  id: string;
  release_id: string;
  item_id: string;
  category_name: string | null;
  category_position: number | null;
  title: string | null;
  kind: ItemKind | null;
  version_label: string | null;
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  sha256: string | null;
  created_at: string;
}

export interface ProjectRelease {
  id: string;
  project_id: string;
  version_label: string;
  notes: string | null;
  status: ReleaseStatus;
  published_at: string | null;
  published_by: string | null;
  manifest_hash: string | null;
  created_at: string;
  profiles?: Profile | null;
}

export interface ProjectReleaseProduct {
  id: string;
  project_release_id: string;
  product_id: string;
  release_id: string;
  product_name: string | null;
  product_code: string | null;
  product_type: ProductType | null;
  product_position: number | null;
  release_version_label: string | null;
  release_manifest_hash: string | null;
  release_published_at: string | null;
  created_at: string;
}
