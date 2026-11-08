import type { ThemeConfig } from 'antd';

export const tokens = {
  colors: {
    background: '#FAFAF9',
    surface: '#FFFFFF',
    surfaceSubtle: '#F4F5F6',
    surfaceSelected: '#EDF3FC',
    textPrimary: '#1F2328',
    textSecondary: '#59636E',
    border: '#D8DEE4',
    borderSubtle: '#EAECEF',
    accent: '#1F5FBF',
    accentHover: '#194E9E',
    accentActive: '#143F80',
    publishedText: '#1A7F37',
    publishedBg: '#EFF7F1',
    publishedBorder: '#B4DEC0',
    draftText: '#48515B',
    draftBg: '#F3F4F6',
    draftBorder: '#D8DEE4',
    errorText: '#C92A2A',
    errorBg: '#FFF5F5',
    errorBorder: '#F2B8B5',
    warningText: '#8A5A00',
    warningBg: '#FFFDF2',
    warningBorder: '#E6D39A',
    white: '#FFFFFF',
    gerberCanvasBg: '#0F1318',
    gerberGridDot: 'rgba(255, 255, 255, 0.08)',
    gerberDotBorder: 'rgba(0, 0, 0, 0.15)',
    gerberCopperTop: '#E58E26',
    gerberCopperBottom: '#3B82F6',
    gerberSilkscreen: '#F8FAFC',
    gerberSoldermaskTop: '#10B981',
    gerberSoldermaskBottom: '#047857',
    gerberOutline: '#F43F5E',
    gerberDrill: '#94A3B8',
    gerberOther: '#64748B',
    viewer3dCanvasBg: '#0F1318',
    viewer3dGrid: '#334155',
    viewer3dMaskBg: 'rgba(15, 19, 24, 0.75)',
    pnpOverlayComponentBg: 'rgba(59, 130, 246, 0.25)',
    pnpOverlayComponentBorder: '#1F5FBF',
    pnpOverlayPin1Marker: '#F43F5E',
    pnpOverlaySelected: 'rgba(229, 142, 38, 0.35)',
    pnpOverlaySelectedBorder: '#E58E26',
    pnpOverlayHoverBorder: '#3B82F6',
    pnpOverlayText: '#F8FAFC',
    maskBg: 'rgba(31, 35, 40, 0.42)',
    subtleShadow: '0 1px 2px rgba(31, 35, 40, 0.05)',
    cardShadow: '0 1px 2px rgba(31, 35, 40, 0.04), 0 1px 3px rgba(31, 35, 40, 0.03)',
    elevatedShadow: '0 8px 24px rgba(31, 35, 40, 0.08), 0 2px 6px rgba(31, 35, 40, 0.04)',
    focusRingShadow: '0 0 0 2px rgba(31, 95, 191, 0.16)',
  },
  typography: {
    fontFamilySans:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontFamilyMono:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSizeSm: 12,
    fontSizeBase: 13,
    fontSizeLg: 14,
    fontSizeXl: 16,
    fontSizeHeading1: 18,
    fontSizeHeading2: 15,
    fontSizeHeading3: 14,
    fontSizeHeading4: 13,
    fontSizeHeading5: 12,
    lineHeightSm: 1.5,
    lineHeightBase: 1.5,
    lineHeightLg: 1.5,
    lineHeightHeading1: 1.3333,
    lineHeightHeading2: 1.4,
    lineHeightHeading3: 1.4286,
    lineHeightHeading4: 1.4615,
    lineHeightHeading5: 1.5,
    fontWeightStrong: 600,
  },
  radius: {
    xs: 4,
    sm: 4,
    md: 6,
    lg: 8,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
  },
  layout: {
    maxContentWidth: 1280,
    headerHeight: 48,
    siderWidth: 232,
    siderCollapsedWidth: 60,
    authCardWidth: 400,
    categorySidebarWidth: 256,
  },
} as const;

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: tokens.colors.accent,
    colorPrimaryHover: tokens.colors.accentHover,
    colorPrimaryActive: tokens.colors.accentActive,
    colorLink: tokens.colors.accent,
    colorLinkHover: tokens.colors.accentHover,
    colorLinkActive: tokens.colors.accentActive,
    colorSuccess: tokens.colors.publishedText,
    colorSuccessBg: tokens.colors.publishedBg,
    colorSuccessBorder: tokens.colors.publishedBorder,
    colorError: tokens.colors.errorText,
    colorErrorBg: tokens.colors.errorBg,
    colorErrorBorder: tokens.colors.errorBorder,
    colorWarning: tokens.colors.warningText,
    colorWarningBg: tokens.colors.warningBg,
    colorWarningBorder: tokens.colors.warningBorder,
    colorText: tokens.colors.textPrimary,
    colorTextSecondary: tokens.colors.textSecondary,
    colorTextHeading: tokens.colors.textPrimary,
    colorBgLayout: tokens.colors.background,
    colorBgContainer: tokens.colors.surface,
    colorBgElevated: tokens.colors.surface,
    colorBgMask: tokens.colors.maskBg,
    colorBorder: tokens.colors.border,
    colorBorderSecondary: tokens.colors.borderSubtle,
    colorSplit: tokens.colors.borderSubtle,
    fontFamily: tokens.typography.fontFamilySans,
    fontFamilyCode: tokens.typography.fontFamilyMono,
    fontSizeSM: tokens.typography.fontSizeSm,
    fontSize: tokens.typography.fontSizeBase,
    fontSizeLG: tokens.typography.fontSizeLg,
    fontSizeXL: tokens.typography.fontSizeXl,
    fontSizeHeading1: tokens.typography.fontSizeHeading1,
    fontSizeHeading2: tokens.typography.fontSizeHeading2,
    fontSizeHeading3: tokens.typography.fontSizeHeading3,
    fontSizeHeading4: tokens.typography.fontSizeHeading4,
    fontSizeHeading5: tokens.typography.fontSizeHeading5,
    lineHeightSM: tokens.typography.lineHeightSm,
    lineHeight: tokens.typography.lineHeightBase,
    lineHeightLG: tokens.typography.lineHeightLg,
    lineHeightHeading1: tokens.typography.lineHeightHeading1,
    lineHeightHeading2: tokens.typography.lineHeightHeading2,
    lineHeightHeading3: tokens.typography.lineHeightHeading3,
    lineHeightHeading4: tokens.typography.lineHeightHeading4,
    lineHeightHeading5: tokens.typography.lineHeightHeading5,
    fontWeightStrong: tokens.typography.fontWeightStrong,
    controlHeight: 30,
    borderRadius: tokens.radius.md,
    borderRadiusLG: tokens.radius.lg,
    borderRadiusSM: tokens.radius.sm,
    borderRadiusXS: tokens.radius.xs,
    boxShadow: tokens.colors.cardShadow,
    boxShadowSecondary: tokens.colors.elevatedShadow,
    controlOutline: 'transparent',
  },
  components: {
    Typography: {
      titleMarginTop: 0,
      titleMarginBottom: 0,
    },
    Layout: {
      bodyBg: tokens.colors.background,
      headerBg: tokens.colors.surface,
      headerHeight: tokens.layout.headerHeight,
      headerPadding: '0 20px',
      siderBg: tokens.colors.surface,
      lightSiderBg: tokens.colors.surface,
      lightTriggerBg: tokens.colors.surface,
      lightTriggerColor: tokens.colors.textSecondary,
      triggerBg: tokens.colors.surface,
      triggerColor: tokens.colors.textSecondary,
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemColor: tokens.colors.textSecondary,
      itemHoverColor: tokens.colors.textPrimary,
      itemHoverBg: tokens.colors.surfaceSubtle,
      itemSelectedColor: tokens.colors.accent,
      itemSelectedBg: tokens.colors.surfaceSelected,
      itemBorderRadius: tokens.radius.md,
      activeBarBorderWidth: 0,
      itemHeight: 32,
      itemMarginBlock: 2,
      itemMarginInline: 6,
      itemPaddingInline: 10,
      iconSize: 14,
      collapsedIconSize: 16,
      iconMarginInlineEnd: 8,
      collapsedWidth: tokens.layout.siderCollapsedWidth,
      groupTitleFontSize: 11,
      groupTitleLineHeight: 1.4,
      groupTitleColor: tokens.colors.textSecondary,
    },
    Card: {
      boxShadowTertiary: tokens.colors.cardShadow,
      headerBg: tokens.colors.surface,
      headerFontSize: 14,
      headerFontSizeSM: 13,
      headerHeight: 42,
      headerHeightSM: 36,
      paddingLG: 16,
    },
    Table: {
      headerBg: tokens.colors.surfaceSubtle,
      headerColor: tokens.colors.textSecondary,
      headerSplitColor: 'transparent',
      borderColor: tokens.colors.borderSubtle,
      rowHoverBg: tokens.colors.surfaceSubtle,
      rowSelectedBg: tokens.colors.surfaceSelected,
      rowSelectedHoverBg: tokens.colors.surfaceSelected,
      cellFontSize: tokens.typography.fontSizeBase,
      cellFontSizeMD: tokens.typography.fontSizeBase,
      cellFontSizeSM: tokens.typography.fontSizeSm,
      cellPaddingBlockMD: 10,
      cellPaddingInlineMD: 12,
    },
    Statistic: {
      titleFontSize: 12,
      contentFontSize: 18,
    },
    Button: {
      defaultShadow: 'none',
      primaryShadow: 'none',
      dangerShadow: 'none',
      fontWeight: 500,
    },
    Input: {
      activeShadow: tokens.colors.focusRingShadow,
      errorActiveShadow: 'none',
      warningActiveShadow: 'none',
    },
    Select: {
      optionSelectedBg: tokens.colors.surfaceSelected,
    },
    Tabs: {
      inkBarColor: tokens.colors.accent,
      itemSelectedColor: tokens.colors.accent,
      itemHoverColor: tokens.colors.accentHover,
      itemColor: tokens.colors.textSecondary,
    },
    Descriptions: {
      labelBg: tokens.colors.surfaceSubtle,
    },
    Segmented: {
      trackBg: tokens.colors.surfaceSubtle,
      itemSelectedBg: tokens.colors.surface,
      itemColor: tokens.colors.textSecondary,
      itemSelectedColor: tokens.colors.textPrimary,
    },
  },
};

export function applyThemeCssVariables(target?: HTMLElement): void {
  if (typeof document === 'undefined' && !target) {
    return;
  }
  const root = target ?? document.documentElement;
  root.style.setProperty('--revlog-bg', tokens.colors.background);
  root.style.setProperty('--revlog-surface', tokens.colors.surface);
  root.style.setProperty('--revlog-surface-subtle', tokens.colors.surfaceSubtle);
  root.style.setProperty('--revlog-surface-selected', tokens.colors.surfaceSelected);
  root.style.setProperty('--revlog-text-primary', tokens.colors.textPrimary);
  root.style.setProperty('--revlog-text-secondary', tokens.colors.textSecondary);
  root.style.setProperty('--revlog-border', tokens.colors.border);
  root.style.setProperty('--revlog-border-subtle', tokens.colors.borderSubtle);
  root.style.setProperty('--revlog-accent', tokens.colors.accent);
  root.style.setProperty('--revlog-accent-hover', tokens.colors.accentHover);
  root.style.setProperty('--revlog-published-text', tokens.colors.publishedText);
  root.style.setProperty('--revlog-published-bg', tokens.colors.publishedBg);
  root.style.setProperty('--revlog-published-border', tokens.colors.publishedBorder);
  root.style.setProperty('--revlog-draft-text', tokens.colors.draftText);
  root.style.setProperty('--revlog-draft-bg', tokens.colors.draftBg);
  root.style.setProperty('--revlog-draft-border', tokens.colors.draftBorder);
  root.style.setProperty('--revlog-error-text', tokens.colors.errorText);
  root.style.setProperty('--revlog-error-bg', tokens.colors.errorBg);
  root.style.setProperty('--revlog-error-border', tokens.colors.errorBorder);
  root.style.setProperty('--revlog-warning-text', tokens.colors.warningText);
  root.style.setProperty('--revlog-warning-bg', tokens.colors.warningBg);
  root.style.setProperty('--revlog-warning-border', tokens.colors.warningBorder);
  root.style.setProperty('--revlog-gerber-canvas-bg', tokens.colors.gerberCanvasBg);
  root.style.setProperty('--revlog-pnp-overlay-bg', tokens.colors.pnpOverlayComponentBg);
  root.style.setProperty('--revlog-pnp-overlay-border', tokens.colors.pnpOverlayComponentBorder);
  root.style.setProperty('--revlog-pnp-overlay-pin1', tokens.colors.pnpOverlayPin1Marker);
  root.style.setProperty('--revlog-pnp-overlay-selected', tokens.colors.pnpOverlaySelected);
  root.style.setProperty(
    '--revlog-pnp-overlay-selected-border',
    tokens.colors.pnpOverlaySelectedBorder,
  );
  root.style.setProperty('--revlog-pnp-overlay-hover-border', tokens.colors.pnpOverlayHoverBorder);
  root.style.setProperty('--revlog-pnp-overlay-text', tokens.colors.pnpOverlayText);
  root.style.setProperty('--revlog-font-sans', tokens.typography.fontFamilySans);
  root.style.setProperty('--revlog-font-mono', tokens.typography.fontFamilyMono);
  root.style.setProperty('--revlog-radius', `${tokens.radius.md}px`);
  root.style.setProperty('--revlog-shadow-card', tokens.colors.cardShadow);
}
