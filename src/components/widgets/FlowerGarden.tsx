import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Issue } from '../../types';

interface Props {
    config?: Record<string, unknown>;
}

/** 達成率に応じた花の成長段階 */
function getGrowthStage(percent: number): { emoji: string; label: string } {
    if (percent >= 100) return { emoji: '🌸', label: '満開' };
    if (percent >= 80) return { emoji: '🌷', label: 'つぼみ' };
    if (percent >= 60) return { emoji: '🌿', label: '葉が茂る' };
    if (percent >= 40) return { emoji: '🌱', label: '芽が出る' };
    if (percent >= 20) return { emoji: '🫘', label: '種まき' };
    return { emoji: '🪨', label: '準備中' };
}

export default function FlowerGarden(_props: Props) {
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const data = await api.getIssues();
                setIssues(data);
            } catch (e) {
                console.error('FlowerGarden: failed to load', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const total = issues.length;
    const closed = issues.filter(i => i.status === 'CLOSED').length;
    const open = total - closed;
    const percent = total > 0 ? Math.round((closed / total) * 100) : 0;
    const stage = getGrowthStage(percent);

    // 花壇: closedは花、openは芽/種
    const gardenSlots = Math.min(total, 20); // 最大20マス表示
    const flowerCount = total > 0 ? Math.round((closed / total) * gardenSlots) : 0;

    if (loading) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6 animate-pulse">
                <div className="h-4 bg-brand-bg rounded w-1/3 mb-4" />
                <div className="h-24 bg-brand-bg rounded" />
            </div>
        );
    }

    return (
        <div className="bg-brand-card rounded-xl border border-brand-border p-6">
            <h3 className="text-sm font-semibold text-brand-text-muted mb-3">Issue の花壇</h3>

            {/* メイン表示: 大きな花/ステージ */}
            <div className="text-center mb-4">
                <div className="text-5xl mb-2" role="img" aria-label={stage.label}>
                    {stage.emoji}
                </div>
                <div className="text-lg font-bold text-brand-text-main">{percent}% 達成</div>
                <div className="text-xs text-brand-text-muted">{stage.label}</div>
            </div>

            {/* 花壇グリッド */}
            {gardenSlots > 0 && (
                <div className="flex flex-wrap justify-center gap-1 mb-4">
                    {Array.from({ length: gardenSlots }).map((_, i) => (
                        <div
                            key={i}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-sm transition-all duration-300"
                            style={{
                                backgroundColor: i < flowerCount
                                    ? 'var(--color-brand-open, #2da44e)20'
                                    : 'var(--color-brand-bg, #F0F2F5)',
                            }}
                            title={i < flowerCount ? 'CLOSED' : 'OPEN'}
                        >
                            {i < flowerCount ? '🌸' : '🌱'}
                        </div>
                    ))}
                </div>
            )}

            {/* 統計 */}
            <div className="flex justify-between text-xs text-brand-text-muted border-t border-brand-border pt-3">
                <span>🌸 完了: {closed}</span>
                <span>🌱 残り: {open}</span>
                <span>合計: {total}</span>
            </div>
        </div>
    );
}
