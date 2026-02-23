import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { Issue, Milestone, FilterState } from '../types';

interface Props {
    onSelectIssue: (id: number) => void;
    onNewIssue: () => void;
    onShowMilestoneProgress?: () => void;
    savedFilter?: FilterState | null;
    onSaveFilter?: (filter: FilterState) => void;
}

export default function IssueList({ onSelectIssue, onNewIssue, onShowMilestoneProgress, savedFilter, onSaveFilter }: Props) {
    const [allIssues, setAllIssues] = useState<Issue[]>([]);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTab, setCurrentTab] = useState<'OPEN' | 'CLOSED' | 'ALL'>(savedFilter?.currentTab || 'OPEN');
    const [keyword, setKeyword] = useState(savedFilter?.keyword || '');
    const [assignee, setAssignee] = useState(savedFilter?.assignee || '');
    const [tagsText, setTagsText] = useState(savedFilter?.tagsText || '');
    const [milestoneFilter, setMilestoneFilter] = useState<number | null>(savedFilter?.milestoneId ?? null);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [labelsMap, setLabelsMap] = useState<Map<number, string[]>>(new Map());
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync state with savedFilter when it changes (e.g. loaded from localStorage)
    useEffect(() => {
        if (savedFilter) {
            setCurrentTab(savedFilter.currentTab);
            setKeyword(savedFilter.keyword);
            setAssignee(savedFilter.assignee);
            setTagsText(savedFilter.tagsText);
            setMilestoneFilter(savedFilter.milestoneId);
        }
    }, [savedFilter]);

    // Load issues and milestones
    useEffect(() => {
        loadIssues();
        loadMilestones();
    }, []);

    // Re-filter when filter criteria change (debounced for text inputs)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            filterIssues();
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [keyword, assignee, tagsText, currentTab, milestoneFilter, allIssues, labelsMap]);

    const loadIssues = async () => {
        try {
            setLoading(true);
            const data = await api.getIssues();
            setAllIssues(data);

            // Load labels for all issues
            const issueIds = data.map(i => i.id!).filter(Boolean);
            if (issueIds.length > 0) {
                try {
                    const lm = await api.getLabelsMap(issueIds);
                    const map = new Map<number, string[]>();
                    lm.forEach(([id, labels]) => map.set(id, labels));
                    setLabelsMap(map);
                } catch {
                    // Labels may not be available yet
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadMilestones = async () => {
        try {
            const ms = await api.getMilestones();
            setMilestones(ms);
        } catch (e) {
            console.error(e);
        }
    };

    const filterIssues = useCallback(() => {
        let filtered = allIssues;

        // Tab filter
        if (currentTab !== 'ALL') {
            filtered = filtered.filter(i => i.status === currentTab);
        }

        // Keyword filter (partial match, AND for multiple words)
        if (keyword.trim()) {
            const words = keyword.trim().toLowerCase().split(/\s+/);
            filtered = filtered.filter(i => {
                const text = `${i.title} ${i.body} ${i.created_by} ${i.assignee}`.toLowerCase();
                return words.every(w => text.includes(w));
            });
        }

        // Assignee filter
        if (assignee.trim()) {
            const a = assignee.trim().toLowerCase();
            filtered = filtered.filter(i => i.assignee?.toLowerCase().includes(a));
        }

        // Tags filter
        if (tagsText.trim()) {
            const tags = tagsText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
            if (tags.length > 0) {
                filtered = filtered.filter(i => {
                    const issueLabels = (labelsMap.get(i.id!) || []).map(l => l.toLowerCase());
                    return tags.every(t => issueLabels.some(l => l.includes(t)));
                });
            }
        }

        // Milestone filter
        if (milestoneFilter !== null) {
            filtered = filtered.filter(i => i.milestone_id === milestoneFilter);
        }

        setIssues(filtered);
    }, [allIssues, currentTab, keyword, assignee, tagsText, milestoneFilter, labelsMap]);

    const saveCurrentFilter = () => {
        if (onSaveFilter) {
            onSaveFilter({ keyword, assignee, tagsText, currentTab, milestoneId: milestoneFilter });
        }
    };

    const clearFilters = () => {
        setKeyword('');
        setAssignee('');
        setTagsText('');
        setMilestoneFilter(null);
    };

    const renderTab = (label: string, icon: React.ReactNode, tabKey: 'OPEN' | 'CLOSED' | 'ALL') => {
        const selected = currentTab === tabKey;
        const count = tabKey === 'ALL'
            ? allIssues.length
            : allIssues.filter(i => i.status === tabKey).length;
        return (
            <button
                onClick={() => setCurrentTab(tabKey)}
                className={`flex items-center justify-center gap-2 px-6 py-3 cursor-pointer transition-colors border-b-2 ${selected ? 'border-brand-primary text-brand-primary font-bold' : 'border-transparent text-brand-text-muted hover:text-brand-text-main'
                    }`}
            >
                {icon}
                <span>{label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${selected ? 'bg-brand-primary text-white' : 'bg-gray-200 text-brand-text-muted'}`}>
                    {count}
                </span>
            </button>
        );
    };

    const milestoneTitle = milestoneFilter !== null
        ? milestones.find(m => m.id === milestoneFilter)?.title
        : null;

    return (
        <div className="flex flex-col gap-4">
            {/* Header Row: Tabs & Actions */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                {/* Tabs */}
                <div className="flex font-medium text-[15px]">
                    {renderTab('Open', <div className="w-4 h-4 rounded-full border-[3px] border-current"></div>, 'OPEN')}
                    {renderTab('Closed', <div className="w-4 h-4 rounded-full bg-current"></div>, 'CLOSED')}
                    {renderTab('All', <div className="w-4 h-4 rounded-sm border-2 border-current"></div>, 'ALL')}
                </div>

                {/* Actions Row */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        onClick={onNewIssue}
                        className="flex items-center gap-1.5 bg-brand-open text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 transition"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        新規作成
                    </button>
                    {onShowMilestoneProgress && (
                        <button
                            onClick={onShowMilestoneProgress}
                            className="flex items-center gap-1 border border-brand-border bg-brand-card text-brand-text-main px-3 py-1.5 rounded-md text-sm hover:bg-gray-50 transition shadow-sm"
                        >
                            📊 マイルストーン
                        </button>
                    )}
                    <button
                        onClick={saveCurrentFilter}
                        className="flex items-center gap-1 border border-brand-border bg-brand-card text-brand-text-main px-3 py-1.5 rounded-md text-sm hover:bg-gray-50 transition shadow-sm"
                    >
                        フィルタ保存
                    </button>
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 text-brand-primary px-2 py-1.5 text-sm hover:underline"
                    >
                        クリア
                    </button>
                </div>
            </div>

            {/* Milestone Filter Banner */}
            {milestoneTitle && (
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-md px-4 py-2 text-sm text-purple-800">
                    <span>📌 マイルストーン: <strong>{milestoneTitle}</strong> でフィルタリング中</span>
                    <button
                        onClick={() => setMilestoneFilter(null)}
                        className="ml-auto text-purple-600 hover:text-purple-800 font-medium"
                    >
                        ✕ 解除
                    </button>
                </div>
            )}

            {/* Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="relative">
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-brand-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="キーワードで検索..."
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        className="w-full bg-brand-card border-none rounded-md py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm text-brand-text-main placeholder-brand-text-muted"
                    />
                </div>
                <div className="relative">
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-brand-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="担当者で絞り込み"
                        value={assignee}
                        onChange={(e) => setAssignee(e.target.value)}
                        className="w-full bg-brand-card border-none rounded-md py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm text-brand-text-main placeholder-brand-text-muted"
                    />
                </div>
                <div className="relative">
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-brand-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="タグ（カンマ区切り）"
                        value={tagsText}
                        onChange={(e) => setTagsText(e.target.value)}
                        className="w-full bg-brand-card border-none rounded-md py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm text-brand-text-main placeholder-brand-text-muted"
                    />
                </div>
                <select
                    value={milestoneFilter ?? ''}
                    onChange={(e) => setMilestoneFilter(e.target.value ? parseInt(e.target.value) : null)}
                    className="bg-brand-card border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm text-brand-text-main"
                >
                    <option value="">全マイルストーン</option>
                    {milestones.map(m => (
                        <option key={m.id} value={m.id!}>{m.title}</option>
                    ))}
                </select>
            </div>

            {/* List Content */}
            <div className="mt-4 flex flex-col gap-[2px]">
                {loading ? (
                    <div className="py-20 text-center text-brand-text-muted">読み込み中...</div>
                ) : issues.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center">
                        <svg className="w-16 h-16 text-brand-border mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <div className="text-brand-text-muted text-lg">そのステータスの Issue はありません</div>
                    </div>
                ) : issues.map(issue => {
                    const labels = labelsMap.get(issue.id!) || [];
                    const ms = issue.milestone_id ? milestones.find(m => m.id === issue.milestone_id) : null;
                    return (
                        <div
                            key={issue.id}
                            onClick={() => onSelectIssue(issue.id!)}
                            className="bg-brand-card px-5 py-4 rounded-md shadow-sm border border-transparent hover:border-brand-border cursor-pointer transition flex items-start gap-3 group"
                        >
                            <div className={`mt-[3px] flex-shrink-0 ${issue.status === 'OPEN' ? 'text-brand-open' : 'text-brand-closed'}`}>
                                {issue.status === 'OPEN' ? (
                                    <div className="w-[18px] h-[18px] rounded-full border-[3px] border-current"></div>
                                ) : (
                                    <div className="w-[18px] h-[18px] rounded-full bg-current"></div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[16px] font-bold text-brand-text-main group-hover:text-brand-primary transition flex items-center gap-2 flex-wrap">
                                    <span className="truncate">{issue.title}</span>
                                    {labels.map(l => (
                                        <span key={l} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-brand-primary border border-blue-200 whitespace-nowrap">
                                            {l}
                                        </span>
                                    ))}
                                </div>
                                <div className="text-[13px] text-brand-text-muted mt-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-brand-text-main">#{issue.id}</span>
                                    <span>opened on {new Date(issue.created_at).toLocaleDateString()} by</span>
                                    <span className="truncate max-w-[150px] inline-block font-semibold">{issue.created_by}</span>
                                    {issue.assignee && (
                                        <>
                                            <span>・</span>
                                            <span>担当: {issue.assignee}</span>
                                        </>
                                    )}
                                    {ms && (
                                        <>
                                            <span>・</span>
                                            <span className="text-purple-600">📌 {ms.title}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
