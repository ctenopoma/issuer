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
