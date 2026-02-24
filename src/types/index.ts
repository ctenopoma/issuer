export interface Issue {
    id?: number;
    title: string;
    body: string;
    status: 'OPEN' | 'CLOSED';
    created_by: string;
    assignee: string;
    created_at: string;
    updated_at: string;
    milestone_id?: number | null;
    labels?: string[];
}

export interface Comment {
    id?: number;
    issue_id: number;
    body: string;
    created_by: string;
    created_at: string;
    updated_at?: string;
}

export interface Milestone {
    id?: number;
    title: string;
    description: string;
    start_date?: string | null;
    due_date?: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}

export interface ReactionEntry {
    reaction: string;
    count: number;
    reacted: boolean;
    users: string[];
}

export interface ReactionSummary {
    target_id: number;
    reactions: ReactionEntry[];
}

export interface MilestoneProgress {
    milestone_id: number;
    total: number;
    closed: number;
    percent: number;
}

export interface FilterState {
    keyword: string;
    assignee: string;
    tagsText: string;
    currentTab: 'OPEN' | 'CLOSED' | 'ALL';
    milestoneId: number | null;
}

// --- Theme types ---

export type WidgetType =
    | 'issue-summary'
    | 'issue-list'
    | 'flower-garden'
    | 'milestone-gantt'
    | 'milestone-progress'
    | 'recent-activity'
    | 'assignee-workload'
    | 'label-distribution'
    | 'quick-actions';

export interface WidgetPosition {
    col: number;
    row: number;
    colSpan?: number;
    rowSpan?: number;
}

export interface WidgetConfig {
    type: WidgetType;
    position: WidgetPosition;
    config: Record<string, unknown>;
}

export type DashboardLayout = 'single-col' | 'grid-2col' | 'grid-3col';

export interface DashboardConfig {
    layout: DashboardLayout;
    widgets: WidgetConfig[];
}

export interface ThemeFontConfig {
    family: string;
    importUrl?: string;
}

export interface ThemeColors {
    'brand-bg': string;
    'brand-card': string;
    'brand-border': string;
    'brand-text-main': string;
    'brand-text-muted': string;
    'brand-primary': string;
    'brand-open': string;
    'brand-closed': string;
    'brand-danger': string;
    [key: string]: string;
}

export interface ThemeConfig {
    id: string;
    name: string;
    description?: string;
    version?: string;
    author?: string;
    preview?: string;
    colors: ThemeColors;
    font?: ThemeFontConfig;
    dashboard: DashboardConfig;
    customCss?: boolean;
}

export interface ThemeMetadata {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    preview_url?: string;
    installed: boolean;
}
