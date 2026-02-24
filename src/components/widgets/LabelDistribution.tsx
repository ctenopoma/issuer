import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
interface Props {
    config?: Record<string, unknown>;
}

interface LabelCount {
    label: string;
    count: number;
}

// ラベルごとの色（ハッシュベースで決定的に割り当て）
const LABEL_COLORS = [
    '#0969DA', '#2da44e', '#8250df', '#CF222E', '#bf8700',
    '#e16f24', '#1a7f37', '#0550ae', '#6639ba', '#b35900',
];

function labelColor(label: string): string {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = label.charCodeAt(i) + ((hash << 5) - hash);
    }
    return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length];
}

export default function LabelDistribution(_props: Props) {
    const [labels, setLabels] = useState<LabelCount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const issues = await api.getIssues();
                const issueIds = issues.map(i => i.id!).filter(Boolean);

                if (issueIds.length === 0) {
                    setLabels([]);
                    return;
                }

                const labelsMap = await api.getLabelsMap(issueIds);
                const countMap = new Map<string, number>();

                labelsMap.forEach(([, labels]) => {
                    labels.forEach(label => {
                        countMap.set(label, (countMap.get(label) || 0) + 1);
                    });
                });

                const sorted = Array.from(countMap.entries())
                    .map(([label, count]) => ({ label, count }))
                    .sort((a, b) => b.count - a.count);

                setLabels(sorted);
            } catch (e) {
                console.error('LabelDistribution: failed to load', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6 animate-pulse">
                <div className="h-4 bg-brand-bg rounded w-1/3 mb-4" />
                <div className="h-24 bg-brand-bg rounded" />
            </div>
        );
    }

    if (labels.length === 0) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6">
                <h3 className="text-sm font-semibold text-brand-text-muted mb-3">ラベル分布</h3>
                <p className="text-sm text-brand-text-muted text-center py-4">ラベルが使用されていません</p>
            </div>
        );
    }

    const maxCount = Math.max(...labels.map(l => l.count), 1);
    const totalCount = labels.reduce((sum, l) => sum + l.count, 0);

    return (
        <div className="bg-brand-card rounded-xl border border-brand-border p-6">
            <h3 className="text-sm font-semibold text-brand-text-muted mb-4">ラベル分布</h3>

            {/* 横棒グラフ */}
            <div className="space-y-2.5">
                {labels.map(({ label, count }) => (
                    <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-1.5">
                                <span
                                    className="inline-block w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: labelColor(label) }}
                                />
                                <span className="text-xs font-medium text-brand-text-main">{label}</span>
                            </span>
                            <span className="text-[10px] text-brand-text-muted">
                                {count} ({Math.round((count / totalCount) * 100)}%)
                            </span>
                        </div>
                        <div className="w-full bg-brand-bg rounded-full h-2">
                            <div
                                className="h-2 rounded-full transition-all duration-500"
                                style={{
                                    width: `${(count / maxCount) * 100}%`,
                                    backgroundColor: labelColor(label),
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
