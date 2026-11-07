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

export type BomPnpSeverity = 'error' | 'warning' | 'info';
export type BomPnpFormat = 'kicad' | 'altium' | 'generic' | 'unrecognized';
export type BomPnpFindingCode =
  | 'missing_mpn'
  | 'duplicate_bom_designator'
  | 'empty_value'
  | 'empty_footprint'
  | 'dnp_entry'
  | 'missing_in_pnp'
  | 'extra_in_pnp'
  | 'dnp_present_in_pnp'
  | 'duplicate_pnp_designator'
  | 'side_mismatch'
  | 'rotation_anomaly';
export type BomBoardSide = 'top' | 'bottom' | 'unknown';

export interface BomColumnMapping {
  designators: string | null;
  mpn?: string | null;
  value?: string | null;
  footprint?: string | null;
  dnp?: string | null;
  dnpPolarity?: 'dnp' | 'fitted';
  quantity?: string | null;
  manufacturer?: string | null;
  side?: string | null;
}

export interface PnpColumnMapping {
  designator: string | null;
  value?: string | null;
  footprint?: string | null;
  x?: string | null;
  y?: string | null;
  rotation?: string | null;
  side?: string | null;
}

export interface BomPnpColumnMapping {
  bom?: BomColumnMapping | null;
  pnp?: PnpColumnMapping | null;
}

export interface ParsedBomRow {
  rowNumber: number;
  rawDesignators: string;
  designators: string[];
  mpn: string;
  value: string;
  footprint: string;
  quantity: number | null;
  manufacturer: string;
  dnp: boolean;
  side: BomBoardSide | null;
}

export interface ParsedPnpRow {
  rowNumber: number;
  designator: string;
  value: string;
  footprint: string;
  x: number | null;
  y: number | null;
  rawRotation: string;
  rotation: number | null;
  rawSide: string;
  side: BomBoardSide;
}

export interface BomPnpFinding {
  id: string;
  code: BomPnpFindingCode;
  severity: BomPnpSeverity;
  source: 'bom' | 'pnp' | 'cross';
  designators: string[];
  affectedBomRows: number[];
  affectedPnpRows: number[];
  message: string;
}

export interface BomPnpSummary {
  error_count: number;
  warning_count: number;
  info_count: number;
  bom_row_count: number;
  bom_component_count: number;
  bom_dnp_count: number;
  pnp_row_count: number;
}

export interface BomPnpCheckRun {
  id: string;
  project_id: string;
  product_id: string;
  release_id: string;
  bom_item_id: string | null;
  pnp_item_id: string | null;
  bom_file_name: string | null;
  bom_sha256: string | null;
  pnp_file_name: string | null;
  pnp_sha256: string | null;
  column_mapping: BomPnpColumnMapping;
  parsed_bom: ParsedBomRow[];
  parsed_pnp: ParsedPnpRow[];
  findings: BomPnpFinding[];
  summary: BomPnpSummary;
  created_by: string;
  created_at: string;
  profiles?: Profile | null;
}

export interface ReleaseShareLink {
  id: string;
  release_id: string;
  project_id: string;
  product_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
  profiles?: Profile | null;
}

export interface AuditLog {
  id: string;
  project_id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PublicSharedReleaseItem {
  id: string;
  title: string | null;
  kind: ItemKind;
  version_label: string | null;
  file_name: string | null;
  file_size: number | null;
  sha256: string | null;
  url: string | null;
  storage_path: string | null;
  category_name: string | null;
  category_position: number | null;
}

export interface PublicSharedRelease {
  link: {
    id: string;
    expires_at: string;
    created_at: string;
  };
  project: {
    id: string;
    name: string;
    description: string | null;
  };
  product: {
    id: string;
    name: string;
    code: string | null;
    kind: string | null;
  };
  release: {
    id: string;
    version_label: string;
    notes: string | null;
    release_date: string | null;
    published_at: string | null;
    manifest_hash: string | null;
    publisher: string;
  };
  items: PublicSharedReleaseItem[];
}

export type ChecklistRuleSeverity = 'warning' | 'blocking';

export interface ReleaseChecklistRule {
  id: string;
  project_id: string;
  category_name: string;
  item_name_pattern: string;
  severity: ChecklistRuleSeverity;
  description: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
