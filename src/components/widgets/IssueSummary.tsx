import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Issue } from '../../types';

interface Props {
    onSelectIssue?: (id: number) => void;
}

export default function IssueSummary(_props: Props) {
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const data = await api.getIssues();
                setIssues(data);
            } catch (e) {
                console.error('IssueSummary: failed to load', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const openCount = issues.filter(i => i.status === 'OPEN').length;
    const closedCount = issues.filter(i => i.status === 'CLOSED').length;
    const total = issues.length;
    const closedPercent = total > 0 ? Math.round((closedCount / total) * 100) : 0;

    // 今日更新されたIssue
    const today = new Date().toISOString().slice(0, 10);
    const todayUpdated = issues.filter(i => i.updated_at.startsWith(today)).length;

    if (loading) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6 animate-pulse">
                <div className="h-4 bg-brand-bg rounded w-1/3 mb-4" />
                <div className="h-8 bg-brand-bg rounded w-1/2" />
            </div>
        );
    }

    return (
        <div className="bg-brand-card rounded-xl border border-brand-border p-6">
            <h3 className="text-sm font-semibold text-brand-text-muted mb-4">Issue サマリー</h3>

            <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                    <div className="text-2xl font-bold text-brand-open">{openCount}</div>
                    <div className="text-xs text-brand-text-muted mt-1">OPEN</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold text-brand-closed">{closedCount}</div>
                    <div className="text-xs text-brand-text-muted mt-1">CLOSED</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold text-brand-text-main">{total}</div>
                    <div className="text-xs text-brand-text-muted mt-1">合計</div>
                </div>
            </div>

            {/* 達成率バー */}
            <div className="mb-3">
                <div className="flex justify-between text-xs text-brand-text-muted mb-1">
                    <span>達成率</span>
                    <span>{closedPercent}%</span>
                </div>
                <div className="w-full bg-brand-bg rounded-full h-2">
                    <div
                        className="bg-brand-open rounded-full h-2 transition-all duration-500"
                        style={{ width: `${closedPercent}%` }}
                    />
                </div>
            </div>

            <div className="text-xs text-brand-text-muted">
                今日の更新: <span className="font-semibold text-brand-text-main">{todayUpdated}</span> 件
            </div>
        </div>
    );
}
