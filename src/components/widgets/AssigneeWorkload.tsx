import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
interface Props {
    config?: Record<string, unknown>;
}

interface WorkloadEntry {
    name: string;
    open: number;
    closed: number;
    total: number;
}

export default function AssigneeWorkload(_props: Props) {
    const [workload, setWorkload] = useState<WorkloadEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const issues = await api.getIssues();
                const map = new Map<string, { open: number; closed: number }>();

                issues.forEach(issue => {
                    const name = issue.assignee || '未割当';
                    if (!map.has(name)) map.set(name, { open: 0, closed: 0 });
                    const entry = map.get(name)!;
                    if (issue.status === 'OPEN') entry.open++;
                    else entry.closed++;
                });

                const entries: WorkloadEntry[] = Array.from(map.entries())
                    .map(([name, { open, closed }]) => ({ name, open, closed, total: open + closed }))
                    .sort((a, b) => b.open - a.open); // OPEN が多い順

                setWorkload(entries);
            } catch (e) {
                console.error('AssigneeWorkload: failed to load', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6 animate-pulse">
                <div className="h-4 bg-brand-bg rounded w-1/3 mb-4" />
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-8 bg-brand-bg rounded mb-2" />
                ))}
            </div>
        );
    }

    if (workload.length === 0) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6">
                <h3 className="text-sm font-semibold text-brand-text-muted mb-3">担当者別 負荷</h3>
                <p className="text-sm text-brand-text-muted text-center py-4">データがありません</p>
            </div>
        );
    }

    const maxTotal = Math.max(...workload.map(w => w.total), 1);

    return (
        <div className="bg-brand-card rounded-xl border border-brand-border p-6">
            <h3 className="text-sm font-semibold text-brand-text-muted mb-4">担当者別 負荷</h3>
            <div className="space-y-3">
                {workload.map(entry => (
                    <div key={entry.name}>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-brand-text-main truncate max-w-[60%]">
                                {entry.name}
                            </span>
                            <span className="text-[10px] text-brand-text-muted">
                                OPEN {entry.open} / CLOSED {entry.closed}
                            </span>
                        </div>
                        <div className="w-full bg-brand-bg rounded-full h-3 flex overflow-hidden">
                            {/* OPEN 部分 */}
                            <div
                                className="h-full transition-all duration-500"
                                style={{
                                    width: `${(entry.open / maxTotal) * 100}%`,
                                    backgroundColor: 'var(--color-brand-open, #2da44e)',
                                }}
                            />
                            {/* CLOSED 部分 */}
                            <div
                                className="h-full transition-all duration-500 opacity-40"
                                style={{
                                    width: `${(entry.closed / maxTotal) * 100}%`,
                                    backgroundColor: 'var(--color-brand-closed, #8250df)',
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
