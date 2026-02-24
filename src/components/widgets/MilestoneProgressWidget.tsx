import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Milestone, MilestoneProgress as MilestoneProgressType } from '../../types';

interface Props {
    config?: Record<string, unknown>;
}

export default function MilestoneProgressWidget(_props: Props) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [progress, setProgress] = useState<Map<number, MilestoneProgressType>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [ms, prog] = await Promise.all([
                    api.getMilestones(),
                    api.getMilestoneProgress(),
                ]);
                setMilestones(ms);
                const map = new Map<number, MilestoneProgressType>();
                prog.forEach(p => map.set(p.milestone_id, p));
                setProgress(map);
            } catch (e) {
                console.error('MilestoneProgressWidget: failed to load', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6 animate-pulse">
                <div className="h-4 bg-brand-bg rounded w-1/3 mb-4" />
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-12 bg-brand-bg rounded mb-2" />
                ))}
            </div>
        );
    }

    if (milestones.length === 0) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6">
                <h3 className="text-sm font-semibold text-brand-text-muted mb-3">マイルストーン進捗</h3>
                <p className="text-sm text-brand-text-muted text-center py-4">マイルストーンがありません</p>
            </div>
        );
    }

    return (
        <div className="bg-brand-card rounded-xl border border-brand-border p-6">
            <h3 className="text-sm font-semibold text-brand-text-muted mb-4">マイルストーン進捗</h3>
            <div className="space-y-4">
                {milestones.map(m => {
                    const p = progress.get(m.id!);
                    const pct = p?.percent ?? 0;
                    const total = p?.total ?? 0;
                    const closed = p?.closed ?? 0;

                    return (
                        <div key={m.id}>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-medium text-brand-text-main truncate">{m.title}</span>
                                <span className="text-xs text-brand-text-muted ml-2 flex-shrink-0">
                                    {closed}/{total}
                                </span>
                            </div>
                            <div className="w-full bg-brand-bg rounded-full h-2.5">
                                <div
                                    className="h-2.5 rounded-full transition-all duration-500"
                                    style={{
                                        width: `${pct}%`,
                                        backgroundColor: pct >= 100
                                            ? 'var(--color-brand-open, #2da44e)'
                                            : 'var(--color-brand-primary, #0969DA)',
                                    }}
                                />
                            </div>
                            {m.due_date && (
                                <div className="text-[10px] text-brand-text-muted mt-1">
                                    期限: {m.due_date}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
