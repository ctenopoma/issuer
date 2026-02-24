import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Issue } from '../../types';

interface Props {
    config?: { limit?: number };
    onSelectIssue?: (id: number) => void;
}

export default function RecentActivity({ config, onSelectIssue }: Props) {
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);

    const limit = config?.limit ?? 5;

    useEffect(() => {
        (async () => {
            try {
                const data = await api.getIssues();
                // updated_at で降順ソート
                data.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
                setIssues(data.slice(0, limit));
            } catch (e) {
                console.error('RecentActivity: failed to load', e);
            } finally {
                setLoading(false);
            }
        })();
    }, [limit]);

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'たった今';
        if (diffMin < 60) return `${diffMin}分前`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour}時間前`;
        const diffDay = Math.floor(diffHour / 24);
        if (diffDay < 30) return `${diffDay}日前`;
        return date.toLocaleDateString('ja-JP');
    };

    if (loading) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6 animate-pulse">
                <div className="h-4 bg-brand-bg rounded w-1/3 mb-4" />
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-10 bg-brand-bg rounded mb-2" />
                ))}
            </div>
        );
    }

    return (
        <div className="bg-brand-card rounded-xl border border-brand-border p-6">
            <h3 className="text-sm font-semibold text-brand-text-muted mb-4">最近のアクティビティ</h3>

            {issues.length === 0 ? (
                <p className="text-sm text-brand-text-muted text-center py-4">アクティビティはありません</p>
            ) : (
                <div className="space-y-1">
                    {issues.map(issue => (
                        <button
                            key={issue.id}
                            onClick={() => issue.id && onSelectIssue?.(issue.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-brand-bg transition text-left"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                        issue.status === 'OPEN' ? 'bg-brand-open' : 'bg-brand-closed'
                                    }`}
                                />
                                <span className="text-sm text-brand-text-main truncate">
                                    {issue.title}
                                </span>
                            </div>
                            <span className="text-xs text-brand-text-muted flex-shrink-0 ml-2">
                                {formatTime(issue.updated_at)}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
