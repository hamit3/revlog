import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useNotification, useTranslate } from '@refinedev/core';
import { PageHeader } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Radio,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ExclamationCircleOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  LockOutlined,
  PlusOutlined,
  SaveOutlined,
  ToolOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { GerberViewerModal } from '../../components/gerber/GerberViewerModal';
import { useProductAccess, useProjectAccess } from '../../lib/useProjectAccess';
import { supabaseClient } from '../../providers/supabaseClient';
import { downloadProjectFileText, validateUploadFileSize } from '../../lib/storage';
import { sha256HexFromFile, sha256HexFromString } from '../../lib/sha256';
import { evaluateBomPnpCsvTexts, isLikelyBomName, isLikelyPnpName } from '../../lib/bomPnp';
import { isAnyGerberItem } from '../../lib/gerber';
import type {
  BomColumnMapping,
  BomPnpCheckRun,
  BomPnpFinding,
  BomPnpSeverity,
  BomPnpSummary,
  Item,
  ParsedBomRow,
  ParsedPnpRow,
  PnpColumnMapping,
  Product,
  Release,
} from '../../types/database';
import { ColumnMappingModal } from './ColumnMappingModal';
import { filterBomRows, filterFindings, filterPnpRows } from './bomPnpFilters';

export const BomPnpPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, productId } = useParams<{ projectId: string; productId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { open: notify } = useNotification();

  const [products, setProducts] = useState<Product[]>([]);
  const [effectiveProductId, setEffectiveProductId] = useState<string | undefined>(productId);

  const {
    project,
    product,
    canEditContent,
    isLoading: isAccessLoading,
  } = useProductAccess(projectId, effectiveProductId);

  const { project: fallbackProject } = useProjectAccess(projectId);

  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>(
    searchParams.get('releaseId') ?? '__preview__',
  );

  const [productItems, setProductItems] = useState<Item[]>([]);

  // Source selection states
  const [bomSourceType, setBomSourceType] = useState<'item' | 'local'>('item');
  const [selectedBomItemId, setSelectedBomItemId] = useState<string | undefined>();
  const [bomFileName, setBomFileName] = useState<string>('');
  const [bomSha256, setBomSha256] = useState<string>('');
  const [bomText, setBomText] = useState<string>('');

  const [pnpSourceType, setPnpSourceType] = useState<'item' | 'local'>('item');
  const [selectedPnpItemId, setSelectedPnpItemId] = useState<string | undefined>();
  const [pnpFileName, setPnpFileName] = useState<string>('');
  const [pnpSha256, setPnpSha256] = useState<string>('');
  const [pnpText, setPnpText] = useState<string>('');

  // Overrides & check results
  const [bomMappingOverride, setBomMappingOverride] = useState<BomColumnMapping | null>(null);
  const [pnpMappingOverride, setPnpMappingOverride] = useState<PnpColumnMapping | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState<boolean>(false);

  const [latestCheckRun, setLatestCheckRun] = useState<BomPnpCheckRun | null>(null);
  const [parsedBom, setParsedBom] = useState<ParsedBomRow[]>([]);
  const [parsedPnp, setParsedPnp] = useState<ParsedPnpRow[]>([]);
  const [findings, setFindings] = useState<BomPnpFinding[]>([]);
  const [summary, setSummary] = useState<BomPnpSummary | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters for tabs
  const [activeTab, setActiveTab] = useState<string>('findings');
  const [findingsSearch, setFindingsSearch] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<BomPnpSeverity | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'bom' | 'pnp' | 'cross'>('all');

  const [bomSearch, setBomSearch] = useState<string>('');
  const [bomPopFilter, setBomPopFilter] = useState<'all' | 'fitted' | 'dnp'>('all');
  const [bomIssuesOnly, setBomIssuesOnly] = useState<boolean>(false);

  const [pnpSearch, setPnpSearch] = useState<string>('');
  const [pnpSideFilter, setPnpSideFilter] = useState<'all' | 'top' | 'bottom' | 'unknown'>('all');
  const [pnpIssuesOnly, setPnpIssuesOnly] = useState<boolean>(false);

  // Gerber modal integration for PnP overlay on board
  const [gerberModalOpen, setGerberModalOpen] = useState<boolean>(false);
  const [releaseItemsFromDb, setReleaseItemsFromDb] = useState<
    { fileName: string; storagePath: string }[]
  >([]);

  const bomFileInputRef = useRef<HTMLInputElement | null>(null);
  const pnpFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync title
  useEffect(() => {
    document.title = `${t('bomPnp.pageTitle')}${product?.name ? ` - ${product.name}` : ''} | ${t('app.name')}`;
  }, [product?.name, t]);

  // Load products if not provided in URL
  useEffect(() => {
    if (!projectId) {
      return;
    }
    let active = true;
    void (async () => {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('project_id', projectId)
        .eq('archived', false)
        .order('position', { ascending: true });

      if (!active) {
        return;
      }
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      const list = (data as Product[]) ?? [];
      setProducts(list);
      if (!productId && list.length > 0 && !effectiveProductId) {
        setEffectiveProductId(list[0]?.id);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, productId, effectiveProductId]);

  // Load releases and product items
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !effectiveProductId) {
        if (active) {
          setIsLoading(false);
        }
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const [relRes, itemRes] = await Promise.all([
        supabaseClient
          .from('releases')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', effectiveProductId)
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('items')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', effectiveProductId)
          .eq('archived', false)
          .eq('kind', 'file')
          .order('created_at', { ascending: false }),
      ]);

      if (!active) {
        return;
      }

      if (relRes.error || itemRes.error) {
        setErrorMessage(relRes.error?.message ?? itemRes.error?.message ?? t('common.errorPrefix'));
        setIsLoading(false);
        return;
      }

      const relList = (relRes.data as Release[]) ?? [];
      const itmList = (itemRes.data as Item[]) ?? [];
      setReleases(relList);
      setProductItems(itmList);

      // Pre-select suggested BOM and PnP items if not already set
      const likelyBom = itmList.find(
        (i) => isLikelyBomName(i.title) || isLikelyBomName(i.file_name ?? ''),
      );
      if (likelyBom) {
        setSelectedBomItemId((prev) => prev || likelyBom.id);
      }
      const likelyPnp = itmList.find(
        (i) => isLikelyPnpName(i.title) || isLikelyPnpName(i.file_name ?? ''),
      );
      if (likelyPnp) {
        setSelectedPnpItemId((prev) => prev || likelyPnp.id);
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, effectiveProductId, t]);

  const selectedRelease = useMemo(() => {
    if (!selectedReleaseId || selectedReleaseId === '__preview__') {
      return null;
    }
    return releases.find((r) => r.id === selectedReleaseId) ?? null;
  }, [releases, selectedReleaseId]);

  const isPublishedRelease = selectedRelease?.status === 'published';

  const productGerberItems = useMemo(() => {
    return productItems
      .filter((itm) => isAnyGerberItem(itm.file_name) && itm.storage_path && itm.file_name)
      .map((itm) => ({ fileName: itm.file_name!, storagePath: itm.storage_path! }));
  }, [productItems]);

  const releaseGerberItems = useMemo(() => {
    return selectedRelease ? releaseItemsFromDb : productGerberItems;
  }, [selectedRelease, releaseItemsFromDb, productGerberItems]);

  // Load latest check run for selected release
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!selectedRelease) {
        if (active) {
          setLatestCheckRun(null);
        }
        return;
      }

      setIsLoading(true);
      const { data, error } = await supabaseClient
        .from('bom_pnp_check_runs')
        .select('*, profiles:created_by(id, full_name, email, created_at)')
        .eq('release_id', selectedRelease.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      const run = data as BomPnpCheckRun | null;
      setLatestCheckRun(run);

      if (run) {
        setParsedBom(run.parsed_bom ?? []);
        setParsedPnp(run.parsed_pnp ?? []);
        setFindings(run.findings ?? []);
        setSummary(run.summary ?? null);
        setBomFileName(run.bom_file_name ?? '');
        setBomSha256(run.bom_sha256 ?? '');
        setPnpFileName(run.pnp_file_name ?? '');
        setPnpSha256(run.pnp_sha256 ?? '');
        if (run.column_mapping) {
          setBomMappingOverride(run.column_mapping.bom ?? null);
          setPnpMappingOverride(run.column_mapping.pnp ?? null);
        }
      } else if (isPublishedRelease) {
        setParsedBom([]);
        setParsedPnp([]);
        setFindings([]);
        setSummary(null);
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedRelease, isPublishedRelease]);

  // Load selected BOM item text from Storage
  useEffect(() => {
    if (isPublishedRelease || bomSourceType !== 'item' || !selectedBomItemId) {
      return;
    }
    const itm = productItems.find((i) => i.id === selectedBomItemId);
    if (!itm?.storage_path) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const text = await downloadProjectFileText(itm.storage_path!);
        if (!active) {
          return;
        }
        setBomText(text);
        setBomFileName(itm.file_name ?? itm.title);
        setBomSha256(itm.sha256 ?? (await sha256HexFromString(text)));
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isPublishedRelease, bomSourceType, selectedBomItemId, productItems, t]);

  // Load selected PnP item text from Storage
  useEffect(() => {
    if (isPublishedRelease || pnpSourceType !== 'item' || !selectedPnpItemId) {
      return;
    }
    const itm = productItems.find((i) => i.id === selectedPnpItemId);
    if (!itm?.storage_path) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const text = await downloadProjectFileText(itm.storage_path!);
        if (!active) {
          return;
        }
        setPnpText(text);
        setPnpFileName(itm.file_name ?? itm.title);
        setPnpSha256(itm.sha256 ?? (await sha256HexFromString(text)));
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isPublishedRelease, pnpSourceType, selectedPnpItemId, productItems, t]);

  // Load Gerber files available for the active release
  useEffect(() => {
    if (!selectedRelease) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabaseClient
          .from('release_items')
          .select('file_name, storage_path')
          .eq('release_id', selectedRelease.id);

        if (!active || error || !data) {
          return;
        }

        const items = data
          .filter((ri) => isAnyGerberItem(ri.file_name) && ri.storage_path && ri.file_name)
          .map((ri) => ({ fileName: ri.file_name!, storagePath: ri.storage_path! }));
        setReleaseItemsFromDb(items);
      } catch {
        // Silently ignore
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedRelease]);

  // Run evaluation whenever texts or mapping overrides change (if not viewing stored published run)
  useEffect(() => {
    if (isPublishedRelease) {
      return;
    }
    let active = true;
    void (async () => {
      if (!bomText && !pnpText) {
        if (!latestCheckRun && active) {
          setParsedBom([]);
          setParsedPnp([]);
          setFindings([]);
          setSummary(null);
        }
        return;
      }

      try {
        const res = evaluateBomPnpCsvTexts({
          bomText: bomText || null,
          pnpText: pnpText || null,
          bomMappingOverride,
          pnpMappingOverride,
        });

        if (active) {
          setParsedBom(res.parsedBom);
          setParsedPnp(res.parsedPnp);
          setFindings(res.findings);
          setSummary(res.summary);
        }
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [
    isPublishedRelease,
    bomText,
    pnpText,
    bomMappingOverride,
    pnpMappingOverride,
    latestCheckRun,
    t,
  ]);

  // Current detection results for headers
  const evaluationResult = useMemo(() => {
    if (isPublishedRelease || (!bomText && !pnpText)) {
      return null;
    }
    return evaluateBomPnpCsvTexts({
      bomText: bomText || null,
      pnpText: pnpText || null,
      bomMappingOverride,
      pnpMappingOverride,
    });
  }, [isPublishedRelease, bomText, pnpText, bomMappingOverride, pnpMappingOverride]);

  const handleBomFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (!validateUploadFileSize(file.size)) {
      setErrorMessage(t('items.fileTooLarge', { maxMb: 100 }));
      return;
    }
    try {
      const text = await file.text();
      const hash = await sha256HexFromFile(file);
      setBomFileName(file.name);
      setBomSha256(hash);
      setBomText(text);
      setSelectedBomItemId(undefined);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
    }
  };

  const handlePnpFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (!validateUploadFileSize(file.size)) {
      setErrorMessage(t('items.fileTooLarge', { maxMb: 100 }));
      return;
    }
    try {
      const text = await file.text();
      const hash = await sha256HexFromFile(file);
      setPnpFileName(file.name);
      setPnpSha256(hash);
      setPnpText(text);
      setSelectedPnpItemId(undefined);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
    }
  };

  const handleSaveCheckRun = async () => {
    if (!projectId || !effectiveProductId || !selectedRelease) {
      return;
    }
    if (selectedRelease.status === 'published') {
      return;
    }
    if (!bomText && !pnpText) {
      setErrorMessage(t('bomPnp.noFilesSelected'));
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = evaluateBomPnpCsvTexts({
        bomText: bomText || null,
        pnpText: pnpText || null,
        bomMappingOverride,
        pnpMappingOverride,
      });

      const { data, error } = await supabaseClient
        .from('bom_pnp_check_runs')
        .insert({
          project_id: projectId,
          product_id: effectiveProductId,
          release_id: selectedRelease.id,
          bom_item_id: bomSourceType === 'item' ? selectedBomItemId || null : null,
          pnp_item_id: pnpSourceType === 'item' ? selectedPnpItemId || null : null,
          bom_file_name: bomFileName || null,
          bom_sha256: bomSha256 || null,
          pnp_file_name: pnpFileName || null,
          pnp_sha256: pnpSha256 || null,
          column_mapping: res.effectiveColumnMapping,
          parsed_bom: res.parsedBom,
          parsed_pnp: res.parsedPnp,
          findings: res.findings,
          summary: res.summary,
        })
        .select('*, profiles:created_by(id, full_name, email, created_at)')
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? t('common.errorPrefix'));
      }

      setLatestCheckRun(data as BomPnpCheckRun);
      notify?.({ type: 'success', message: t('bomPnp.checkSaved') });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
    } finally {
      setIsSaving(false);
    }
  };

  // Affected row indices for cross-filtering
  const affectedBomRows = useMemo(() => {
    const set = new Set<number>();
    for (const f of findings) {
      for (const r of f.affectedBomRows) {
        set.add(r);
      }
    }
    return set;
  }, [findings]);

  const affectedPnpRows = useMemo(() => {
    const set = new Set<number>();
    for (const f of findings) {
      for (const r of f.affectedPnpRows) {
        set.add(r);
      }
    }
    return set;
  }, [findings]);

  // Filtered views
  const filteredFindings = useMemo(
    () =>
      filterFindings(findings, {
        searchQuery: findingsSearch,
        severity: severityFilter,
        source: sourceFilter,
      }),
    [findings, findingsSearch, severityFilter, sourceFilter],
  );

  const filteredBomRows = useMemo(
    () =>
      filterBomRows(parsedBom, {
        searchQuery: bomSearch,
        population: bomPopFilter,
        issuesOnly: bomIssuesOnly,
        affectedRowNumbers: affectedBomRows,
      }),
    [parsedBom, bomSearch, bomPopFilter, bomIssuesOnly, affectedBomRows],
  );

  const filteredPnpRows = useMemo(
    () =>
      filterPnpRows(parsedPnp, {
        searchQuery: pnpSearch,
        side: pnpSideFilter,
        issuesOnly: pnpIssuesOnly,
        affectedRowNumbers: affectedPnpRows,
      }),
    [parsedPnp, pnpSearch, pnpSideFilter, pnpIssuesOnly, affectedPnpRows],
  );

  // Table columns definition
  const findingColumns: ColumnsType<BomPnpFinding> = [
    {
      title: t('bomPnp.columns.severity'),
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (sev: BomPnpSeverity) => {
        let bg: string = tokens.colors.draftBg;
        let border: string = tokens.colors.draftBorder;
        let color: string = tokens.colors.draftText;
        let icon = <InfoCircleOutlined aria-hidden="true" />;

        if (sev === 'error') {
          bg = tokens.colors.errorBg;
          border = tokens.colors.errorBorder;
          color = tokens.colors.errorText;
          icon = <ExclamationCircleOutlined aria-hidden="true" />;
        } else if (sev === 'warning') {
          bg = tokens.colors.warningBg;
          border = tokens.colors.warningBorder;
          color = tokens.colors.warningText;
          icon = <ExclamationCircleOutlined aria-hidden="true" />;
        }

        return (
          <Tag
            icon={icon}
            bordered
            style={{
              backgroundColor: bg,
              borderColor: border,
              color,
              marginInlineEnd: 0,
            }}
          >
            {t(`bomPnp.severity.${sev}`)}
          </Tag>
        );
      },
    },
    {
      title: t('bomPnp.columns.source'),
      dataIndex: 'source',
      key: 'source',
      width: 110,
      render: (src: string) => <Tag bordered>{t(`bomPnp.source.${src}`)}</Tag>,
    },
    {
      title: t('bomPnp.columns.designators'),
      dataIndex: 'designators',
      key: 'designators',
      width: 160,
      render: (des: string[]) =>
        des.length > 0 ? (
          <Typography.Text strong>{des.join(', ')}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        ),
    },
    {
      title: t('bomPnp.columns.affectedRows'),
      key: 'affectedRows',
      width: 150,
      render: (_val: unknown, record: BomPnpFinding) => {
        const parts: string[] = [];
        if (record.affectedBomRows.length > 0) {
          parts.push(`BOM: ${record.affectedBomRows.join(', ')}`);
        }
        if (record.affectedPnpRows.length > 0) {
          parts.push(`PnP: ${record.affectedPnpRows.join(', ')}`);
        }
        return parts.length > 0 ? (
          <span>{parts.join(' | ')}</span>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        );
      },
    },
    {
      title: t('bomPnp.columns.description'),
      dataIndex: 'message',
      key: 'message',
      render: (msg: string) => <span>{msg}</span>,
    },
  ];

  const bomColumns: ColumnsType<ParsedBomRow> = [
    {
      title: t('bomPnp.columns.row'),
      dataIndex: 'rowNumber',
      key: 'rowNumber',
      width: 65,
    },
    {
      title: t('bomPnp.columns.designators'),
      dataIndex: 'rawDesignators',
      key: 'rawDesignators',
      width: 140,
      render: (val: string, r: ParsedBomRow) => (
        <span style={{ fontWeight: affectedBomRows.has(r.rowNumber) ? 600 : 400 }}>{val}</span>
      ),
    },
    {
      title: t('bomPnp.columns.value'),
      dataIndex: 'value',
      key: 'value',
      width: 120,
    },
    {
      title: t('bomPnp.columns.footprint'),
      dataIndex: 'footprint',
      key: 'footprint',
      width: 130,
    },
    {
      title: t('bomPnp.columns.mpn'),
      dataIndex: 'mpn',
      key: 'mpn',
      render: (val: string) =>
        val ? (
          <span>{val}</span>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        ),
    },
    {
      title: t('bomPnp.columns.manufacturer'),
      dataIndex: 'manufacturer',
      key: 'manufacturer',
      render: (val: string) =>
        val || <Typography.Text type="secondary">{t('common.none')}</Typography.Text>,
    },
    {
      title: t('bomPnp.columns.quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 65,
      render: (val: number | null) => (val !== null ? val : '-'),
    },
    {
      title: t('bomPnp.columns.dnp'),
      dataIndex: 'dnp',
      key: 'dnp',
      width: 90,
      render: (dnp: boolean) =>
        dnp ? (
          <Tag
            bordered
            style={{
              backgroundColor: tokens.colors.draftBg,
              borderColor: tokens.colors.draftBorder,
              color: tokens.colors.draftText,
            }}
          >
            DNP
          </Tag>
        ) : (
          <Tag
            bordered
            style={{
              backgroundColor: tokens.colors.publishedBg,
              borderColor: tokens.colors.publishedBorder,
              color: tokens.colors.publishedText,
            }}
          >
            Fitted
          </Tag>
        ),
    },
    {
      title: t('bomPnp.columns.side'),
      dataIndex: 'side',
      key: 'side',
      width: 90,
      render: (side: string | null) => side || '-',
    },
  ];

  const pnpColumns: ColumnsType<ParsedPnpRow> = [
    {
      title: t('bomPnp.columns.row'),
      dataIndex: 'rowNumber',
      key: 'rowNumber',
      width: 65,
    },
    {
      title: t('bomPnp.columns.designator'),
      dataIndex: 'designator',
      key: 'designator',
      width: 120,
      render: (val: string, r: ParsedPnpRow) => (
        <span style={{ fontWeight: affectedPnpRows.has(r.rowNumber) ? 600 : 400 }}>{val}</span>
      ),
    },
    {
      title: t('bomPnp.columns.value'),
      dataIndex: 'value',
      key: 'value',
      width: 120,
    },
    {
      title: t('bomPnp.columns.footprint'),
      dataIndex: 'footprint',
      key: 'footprint',
      width: 130,
    },
    {
      title: t('bomPnp.columns.x'),
      dataIndex: 'x',
      key: 'x',
      width: 90,
      render: (val: number | null) => (val !== null ? val.toFixed(3) : '-'),
    },
    {
      title: t('bomPnp.columns.y'),
      dataIndex: 'y',
      key: 'y',
      width: 90,
      render: (val: number | null) => (val !== null ? val.toFixed(3) : '-'),
    },
    {
      title: t('bomPnp.columns.rotation'),
      dataIndex: 'rotation',
      key: 'rotation',
      width: 90,
      render: (val: number | null, r: ParsedPnpRow) =>
        val !== null ? `${val}°` : r.rawRotation || '-',
    },
    {
      title: t('bomPnp.columns.side'),
      dataIndex: 'side',
      key: 'side',
      width: 90,
      render: (side: string) => (
        <Tag bordered style={{ textTransform: 'capitalize' }}>
          {side}
        </Tag>
      ),
    },
  ];

  if (isAccessLoading || isLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  const effectiveProject = project || fallbackProject;
  if (!effectiveProject) {
    return <Alert type="error" showIcon message={t('projects.notFound')} />;
  }

  if (products.length === 0 && !product) {
    return (
      <PageHeader title={<PageHeaderTitle title={t('bomPnp.pageTitle')} />}>
        <Empty description={t('bomPnp.noProducts')} />
      </PageHeader>
    );
  }

  return (
    <PageHeader
      title={<PageHeaderTitle title={t('bomPnp.pageTitle')} subtitle={t('bomPnp.pageSubtitle')} />}
      extra={
        <Space size="small">
          {releaseGerberItems.length > 0 && (
            <Button
              icon={<EyeOutlined aria-hidden="true" />}
              onClick={() => setGerberModalOpen(true)}
            >
              {t('gerber.viewOnBoard')}
            </Button>
          )}
          {!isPublishedRelease && canEditContent && selectedRelease ? (
            <Button
              type="primary"
              icon={<SaveOutlined aria-hidden="true" />}
              loading={isSaving}
              disabled={!bomText && !pnpText}
              onClick={() => void handleSaveCheckRun()}
            >
              {t('bomPnp.runAndSaveCheck')}
            </Button>
          ) : null}
        </Space>
      }
    >
      {errorMessage && (
        <Alert
          type="error"
          showIcon
          closable
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
          style={{ marginBottom: tokens.spacing.lg }}
        />
      )}

      {/* Context selectors: Product and Release */}
      <Card style={{ marginBottom: tokens.spacing.lg }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: tokens.spacing.lg,
          }}
        >
          {!productId && (
            <div style={{ minWidth: 220 }}>
              <Typography.Text
                type="secondary"
                style={{ display: 'block', marginBottom: tokens.spacing.xs }}
              >
                {t('nav.product')}
              </Typography.Text>
              <Select
                value={effectiveProductId}
                style={{ width: '100%' }}
                options={products.map((p) => ({ label: p.name, value: p.id }))}
                onChange={(val) => {
                  setEffectiveProductId(val);
                  setSelectedReleaseId('__preview__');
                  setSearchParams({}, { replace: true });
                }}
              />
            </div>
          )}

          <div style={{ minWidth: 260 }}>
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginBottom: tokens.spacing.xs }}
            >
              {t('bomPnp.selectReleasePrompt')}
            </Typography.Text>
            <Select
              value={selectedReleaseId}
              style={{ width: '100%' }}
              onChange={(val) => {
                setSelectedReleaseId(val);
                if (val !== '__preview__') {
                  setSearchParams({ releaseId: val }, { replace: true });
                } else {
                  setSearchParams({}, { replace: true });
                }
              }}
              options={[
                { label: t('bomPnp.unsavedPreview'), value: '__preview__' },
                ...releases.map((r) => ({
                  label:
                    r.status === 'published'
                      ? t('bomPnp.releasePublished', { version: r.version_label })
                      : t('bomPnp.releaseDraft', { version: r.version_label }),
                  value: r.id,
                })),
              ]}
            />
          </div>

          {canEditContent && effectiveProductId && (
            <div style={{ marginTop: 'auto' }}>
              <Button
                icon={<PlusOutlined aria-hidden="true" />}
                onClick={() =>
                  navigate(`/projects/${projectId}/products/${effectiveProductId}/releases/new`)
                }
              >
                {t('bomPnp.createDraft')}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Published release banner */}
      {isPublishedRelease && (
        <Alert
          type="info"
          showIcon
          icon={<LockOutlined aria-hidden="true" />}
          message={t('bomPnp.readOnlyPublishedNotice')}
          style={{ marginBottom: tokens.spacing.lg }}
        />
      )}

      {/* File inputs & Mapping controls (when not viewing a published release) */}
      {!isPublishedRelease && (
        <Card style={{ marginBottom: tokens.spacing.lg }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: tokens.spacing.lg,
            }}
          >
            {/* BOM source selection */}
            <div>
              <Typography.Text strong style={{ display: 'block', marginBottom: tokens.spacing.xs }}>
                {t('bomPnp.bomSectionTitle')}
              </Typography.Text>
              <Radio.Group
                value={bomSourceType}
                onChange={(e) => setBomSourceType(e.target.value as 'item' | 'local')}
                style={{ marginBottom: tokens.spacing.sm }}
              >
                <Radio value="item">{t('bomPnp.sourceItem')}</Radio>
                <Radio value="local">{t('bomPnp.sourceLocal')}</Radio>
              </Radio.Group>

              {bomSourceType === 'item' ? (
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('bomPnp.selectItemPlaceholder')}
                  value={selectedBomItemId}
                  onChange={(val) => setSelectedBomItemId(val)}
                  options={productItems.map((itm) => ({
                    label: `${itm.title} (${itm.file_name})`,
                    value: itm.id,
                  }))}
                  allowClear
                />
              ) : (
                <div>
                  <input
                    ref={bomFileInputRef}
                    type="file"
                    accept=".csv,.txt,.tsv"
                    style={{ display: 'none' }}
                    onChange={(e) => void handleBomFileUpload(e)}
                  />
                  <Button
                    icon={<UploadOutlined aria-hidden="true" />}
                    onClick={() => bomFileInputRef.current?.click()}
                  >
                    {t('bomPnp.uploadFileButton')}
                  </Button>
                  {bomFileName && (
                    <span style={{ marginInlineStart: tokens.spacing.sm }}>{bomFileName}</span>
                  )}
                </div>
              )}

              {evaluationResult?.bomDetection && (
                <div
                  style={{
                    marginTop: tokens.spacing.xs,
                    display: 'flex',
                    gap: tokens.spacing.xs,
                    alignItems: 'center',
                  }}
                >
                  <Tag bordered>
                    {t('bomPnp.detectedFormat', { format: evaluationResult.bomDetection.format })}
                  </Tag>
                  {evaluationResult.bomDetection.needsColumnMapping && (
                    <Tag
                      bordered
                      style={{
                        backgroundColor: tokens.colors.warningBg,
                        borderColor: tokens.colors.warningBorder,
                        color: tokens.colors.warningText,
                      }}
                    >
                      {t('bomPnp.needsMappingBadge')}
                    </Tag>
                  )}
                </div>
              )}
            </div>

            {/* PnP source selection */}
            <div>
              <Typography.Text strong style={{ display: 'block', marginBottom: tokens.spacing.xs }}>
                {t('bomPnp.pnpSectionTitle')}
              </Typography.Text>
              <Radio.Group
                value={pnpSourceType}
                onChange={(e) => setPnpSourceType(e.target.value as 'item' | 'local')}
                style={{ marginBottom: tokens.spacing.sm }}
              >
                <Radio value="item">{t('bomPnp.sourceItem')}</Radio>
                <Radio value="local">{t('bomPnp.sourceLocal')}</Radio>
              </Radio.Group>

              {pnpSourceType === 'item' ? (
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('bomPnp.selectItemPlaceholder')}
                  value={selectedPnpItemId}
                  onChange={(val) => setSelectedPnpItemId(val)}
                  options={productItems.map((itm) => ({
                    label: `${itm.title} (${itm.file_name})`,
                    value: itm.id,
                  }))}
                  allowClear
                />
              ) : (
                <div>
                  <input
                    ref={pnpFileInputRef}
                    type="file"
                    accept=".csv,.pos,.txt,.xy"
                    style={{ display: 'none' }}
                    onChange={(e) => void handlePnpFileUpload(e)}
                  />
                  <Button
                    icon={<UploadOutlined aria-hidden="true" />}
                    onClick={() => pnpFileInputRef.current?.click()}
                  >
                    {t('bomPnp.uploadFileButton')}
                  </Button>
                  {pnpFileName && (
                    <span style={{ marginInlineStart: tokens.spacing.sm }}>{pnpFileName}</span>
                  )}
                </div>
              )}

              {evaluationResult?.pnpDetection && (
                <div
                  style={{
                    marginTop: tokens.spacing.xs,
                    display: 'flex',
                    gap: tokens.spacing.xs,
                    alignItems: 'center',
                  }}
                >
                  <Tag bordered>
                    {t('bomPnp.detectedFormat', { format: evaluationResult.pnpDetection.format })}
                  </Tag>
                  {evaluationResult.pnpDetection.needsColumnMapping && (
                    <Tag
                      bordered
                      style={{
                        backgroundColor: tokens.colors.warningBg,
                        borderColor: tokens.colors.warningBorder,
                        color: tokens.colors.warningText,
                      }}
                    >
                      {t('bomPnp.needsMappingBadge')}
                    </Tag>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: tokens.spacing.md,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: tokens.spacing.sm,
            }}
          >
            <Button
              icon={<ToolOutlined aria-hidden="true" />}
              disabled={!bomText && !pnpText}
              onClick={() => setMappingModalOpen(true)}
            >
              {t('bomPnp.mapColumns')}
            </Button>
          </div>
        </Card>
      )}

      {/* Summary overview cards */}
      {summary ? (
        <Card style={{ marginBottom: tokens.spacing.lg }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: tokens.spacing.md,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Space size={tokens.spacing.sm} wrap>
              <Tag
                bordered
                style={{
                  backgroundColor:
                    summary.error_count > 0 ? tokens.colors.errorBg : tokens.colors.publishedBg,
                  borderColor:
                    summary.error_count > 0
                      ? tokens.colors.errorBorder
                      : tokens.colors.publishedBorder,
                  color:
                    summary.error_count > 0 ? tokens.colors.errorText : tokens.colors.publishedText,
                  fontWeight: 600,
                }}
              >
                {t('bomPnp.summaryErrors', { count: summary.error_count })}
              </Tag>
              <Tag
                bordered
                style={{
                  backgroundColor:
                    summary.warning_count > 0 ? tokens.colors.warningBg : tokens.colors.draftBg,
                  borderColor:
                    summary.warning_count > 0
                      ? tokens.colors.warningBorder
                      : tokens.colors.draftBorder,
                  color:
                    summary.warning_count > 0 ? tokens.colors.warningText : tokens.colors.draftText,
                  fontWeight: 600,
                }}
              >
                {t('bomPnp.summaryWarnings', { count: summary.warning_count })}
              </Tag>
              <Tag bordered>{t('bomPnp.summaryInfo', { count: summary.info_count })}</Tag>
              <Tag bordered>
                {t('bomPnp.summaryBomCount', { count: summary.bom_component_count })}
              </Tag>
              <Tag bordered>{t('bomPnp.summaryPnpCount', { count: summary.pnp_row_count })}</Tag>
              <Tag bordered>{t('bomPnp.summaryDnpCount', { count: summary.bom_dnp_count })}</Tag>
            </Space>

            {(bomFileName || pnpFileName) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {bomFileName && (
                  <span className="revlog-secondary-text">
                    BOM: {bomFileName}{' '}
                    {bomSha256 && <span className="revlog-hash">({bomSha256.slice(0, 10)})</span>}
                  </span>
                )}
                {pnpFileName && (
                  <span className="revlog-secondary-text">
                    PnP: {pnpFileName}{' '}
                    {pnpSha256 && <span className="revlog-hash">({pnpSha256.slice(0, 10)})</span>}
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>
      ) : isPublishedRelease ? (
        <Card style={{ marginBottom: tokens.spacing.lg }}>
          <Empty description={t('bomPnp.noCheckRunRecorded')} />
        </Card>
      ) : null}

      {/* Main Tabs: Findings, BOM, PnP */}
      {(summary || findings.length > 0 || parsedBom.length > 0 || parsedPnp.length > 0) && (
        <Card styles={{ body: { padding: 0 } }}>
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k)}
            style={{ padding: `0 ${tokens.spacing.lg}px` }}
            items={[
              {
                key: 'findings',
                label: t('bomPnp.tabs.findings', { count: findings.length }),
                children: (
                  <div style={{ paddingBottom: tokens.spacing.lg }}>
                    <div
                      style={{
                        padding: `${tokens.spacing.md}px 0`,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: tokens.spacing.md,
                        alignItems: 'center',
                      }}
                    >
                      <Input
                        placeholder={t('bomPnp.filters.searchPlaceholder')}
                        value={findingsSearch}
                        onChange={(e) => setFindingsSearch(e.target.value)}
                        style={{ width: 220 }}
                        allowClear
                      />
                      <Select
                        value={severityFilter}
                        onChange={(v) => setSeverityFilter(v)}
                        style={{ width: 140 }}
                        options={[
                          { label: t('bomPnp.filters.severityAll'), value: 'all' },
                          { label: t('bomPnp.filters.severityError'), value: 'error' },
                          { label: t('bomPnp.filters.severityWarning'), value: 'warning' },
                          { label: t('bomPnp.filters.severityInfo'), value: 'info' },
                        ]}
                      />
                      <Select
                        value={sourceFilter}
                        onChange={(v) => setSourceFilter(v)}
                        style={{ width: 140 }}
                        options={[
                          { label: t('bomPnp.filters.sourceAll'), value: 'all' },
                          { label: t('bomPnp.filters.sourceBom'), value: 'bom' },
                          { label: t('bomPnp.filters.sourcePnp'), value: 'pnp' },
                          { label: t('bomPnp.filters.sourceCross'), value: 'cross' },
                        ]}
                      />
                    </div>

                    <div className="revlog-table-region" tabIndex={0}>
                      <Table<BomPnpFinding>
                        rowKey="id"
                        size="middle"
                        columns={findingColumns}
                        dataSource={filteredFindings}
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                        locale={{
                          emptyText: (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description={t('releases.noWarnings')}
                            />
                          ),
                        }}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'bom',
                label: t('bomPnp.tabs.bom', { count: parsedBom.length }),
                children: (
                  <div style={{ paddingBottom: tokens.spacing.lg }}>
                    <div
                      style={{
                        padding: `${tokens.spacing.md}px 0`,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: tokens.spacing.md,
                        alignItems: 'center',
                      }}
                    >
                      <Input
                        placeholder={t('bomPnp.filters.searchPlaceholder')}
                        value={bomSearch}
                        onChange={(e) => setBomSearch(e.target.value)}
                        style={{ width: 220 }}
                        allowClear
                      />
                      <Select
                        value={bomPopFilter}
                        onChange={(v) => setBomPopFilter(v)}
                        style={{ width: 150 }}
                        options={[
                          { label: t('bomPnp.filters.populationAll'), value: 'all' },
                          { label: t('bomPnp.filters.populationFitted'), value: 'fitted' },
                          { label: t('bomPnp.filters.populationDnp'), value: 'dnp' },
                        ]}
                      />
                      <Select
                        value={bomIssuesOnly ? 'issues' : 'all'}
                        onChange={(v) => setBomIssuesOnly(v === 'issues')}
                        style={{ width: 150 }}
                        options={[
                          { label: t('bomPnp.filters.issuesAll'), value: 'all' },
                          { label: t('bomPnp.filters.issuesOnly'), value: 'issues' },
                        ]}
                      />
                    </div>

                    <div className="revlog-table-region" tabIndex={0}>
                      <Table<ParsedBomRow>
                        rowKey="rowNumber"
                        size="middle"
                        columns={bomColumns}
                        dataSource={filteredBomRows}
                        pagination={{ pageSize: 25, showSizeChanger: true }}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'pnp',
                label: t('bomPnp.tabs.pnp', { count: parsedPnp.length }),
                children: (
                  <div style={{ paddingBottom: tokens.spacing.lg }}>
                    <div
                      style={{
                        padding: `${tokens.spacing.md}px 0`,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: tokens.spacing.md,
                        alignItems: 'center',
                      }}
                    >
                      <Input
                        placeholder={t('bomPnp.filters.searchPlaceholder')}
                        value={pnpSearch}
                        onChange={(e) => setPnpSearch(e.target.value)}
                        style={{ width: 220 }}
                        allowClear
                      />
                      <Select
                        value={pnpSideFilter}
                        onChange={(v) => setPnpSideFilter(v)}
                        style={{ width: 140 }}
                        options={[
                          { label: t('bomPnp.filters.sideAll'), value: 'all' },
                          { label: t('bomPnp.filters.sideTop'), value: 'top' },
                          { label: t('bomPnp.filters.sideBottom'), value: 'bottom' },
                          { label: t('bomPnp.filters.sideUnknown'), value: 'unknown' },
                        ]}
                      />
                      <Select
                        value={pnpIssuesOnly ? 'issues' : 'all'}
                        onChange={(v) => setPnpIssuesOnly(v === 'issues')}
                        style={{ width: 150 }}
                        options={[
                          { label: t('bomPnp.filters.issuesAll'), value: 'all' },
                          { label: t('bomPnp.filters.issuesOnly'), value: 'issues' },
                        ]}
                      />
                      {releaseGerberItems.length > 0 && (
                        <Button
                          icon={<EyeOutlined aria-hidden="true" />}
                          onClick={() => setGerberModalOpen(true)}
                        >
                          {t('gerber.viewOnBoard')}
                        </Button>
                      )}
                    </div>

                    <div className="revlog-table-region" tabIndex={0}>
                      <Table<ParsedPnpRow>
                        rowKey="rowNumber"
                        size="middle"
                        columns={pnpColumns}
                        dataSource={filteredPnpRows}
                        pagination={{ pageSize: 25, showSizeChanger: true }}
                      />
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* Column mapping modal */}
      <ColumnMappingModal
        open={mappingModalOpen}
        onClose={() => setMappingModalOpen(false)}
        bomHeaders={evaluationResult?.bomTable?.headers ?? []}
        pnpHeaders={evaluationResult?.pnpTable?.headers ?? []}
        currentBomMapping={bomMappingOverride ?? evaluationResult?.bomDetection?.mapping ?? null}
        currentPnpMapping={pnpMappingOverride ?? evaluationResult?.pnpDetection?.mapping ?? null}
        onApply={(bMap, pMap) => {
          setBomMappingOverride(bMap);
          setPnpMappingOverride(pMap);
        }}
        onResetToAuto={() => {
          setBomMappingOverride(null);
          setPnpMappingOverride(null);
        }}
      />

      {/* Gerber & PnP Board Viewer modal */}
      <GerberViewerModal
        open={gerberModalOpen}
        title={
          selectedRelease
            ? `${selectedRelease.version_label} · ${t('gerber.viewerTitle')}`
            : t('gerber.viewerTitle')
        }
        multipleItems={releaseGerberItems}
        releaseId={selectedRelease?.id}
        bomRows={parsedBom}
        pnpRows={parsedPnp}
        onClose={() => setGerberModalOpen(false)}
      />
    </PageHeader>
  );
};
