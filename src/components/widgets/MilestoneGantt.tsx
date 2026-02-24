import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Milestone, MilestoneProgress as MilestoneProgressType } from '../../types';

interface Props {
    config?: Record<string, unknown>;
}

export default function MilestoneGantt(_props: Props) {
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
                console.error('MilestoneGantt: failed to load', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6 animate-pulse">
                <div className="h-4 bg-brand-bg rounded w-1/3 mb-4" />
                <div className="h-32 bg-brand-bg rounded" />
            </div>
        );
    }

    // 日付のある milestones のみ表示
    const withDates = milestones.filter(m => m.start_date || m.due_date);

    if (withDates.length === 0) {
        return (
            <div className="bg-brand-card rounded-xl border border-brand-border p-6">
                <h3 className="text-sm font-semibold text-brand-text-muted mb-3">ガントチャート</h3>
                <p className="text-sm text-brand-text-muted text-center py-8">
                    日付が設定されたマイルストーンがありません
                </p>
            </div>
        );
    }

    // タイムライン範囲の計算
    const allDates: Date[] = [];
    withDates.forEach(m => {
        if (m.start_date) allDates.push(new Date(m.start_date));
        if (m.due_date) allDates.push(new Date(m.due_date));
    });
    const today = new Date();
    allDates.push(today);

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    // 前後に余裕を持たせる
    const paddingDays = 7;
    const timelineStart = new Date(minDate.getTime() - paddingDays * 86400000);
    const timelineEnd = new Date(maxDate.getTime() + paddingDays * 86400000);
    const totalDays = Math.max(1, (timelineEnd.getTime() - timelineStart.getTime()) / 86400000);

    const dateToPercent = (dateStr: string | null | undefined, fallback: Date): number => {
        const d = dateStr ? new Date(dateStr) : fallback;
        return ((d.getTime() - timelineStart.getTime()) / (totalDays * 86400000)) * 100;
    };

    const todayPercent = dateToPercent(null, today);

    // 月ラベルを生成
    const monthLabels: { label: string; percent: number }[] = [];
    const cursor = new Date(timelineStart);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= timelineEnd) {
        const pct = ((cursor.getTime() - timelineStart.getTime()) / (totalDays * 86400000)) * 100;
        if (pct >= 0 && pct <= 100) {
            monthLabels.push({
                label: `${cursor.getMonth() + 1}月`,
                percent: pct,
            });
        }
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return (
        <div className="bg-brand-card rounded-xl border border-brand-border p-6">
            <h3 className="text-sm font-semibold text-brand-text-muted mb-4">ガントチャート</h3>

            {/* タイムラインヘッダー */}
            <div className="relative h-6 mb-2 border-b border-brand-border">
                {monthLabels.map((ml, i) => (
                    <span
                        key={i}
                        className="absolute text-[10px] text-brand-text-muted -translate-x-1/2"
                        style={{ left: `${ml.percent}%` }}
                    >
                        {ml.label}
                    </span>
                ))}
            </div>

            {/* マイルストーンバー */}
            <div className="space-y-3">
                {withDates.map(m => {
                    const startPct = dateToPercent(m.start_date, today);
                    const endPct = dateToPercent(m.due_date, today);
                    const left = Math.max(0, Math.min(startPct, endPct));
                    const width = Math.max(2, Math.abs(endPct - startPct));
                    const p = progress.get(m.id!);
                    const pct = p?.percent ?? 0;

                    const isOverdue = m.due_date && new Date(m.due_date) < today && m.status !== 'completed';

                    return (
                        <div key={m.id} className="relative">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-brand-text-main truncate max-w-[60%]">
                                    {m.title}
                                </span>
                                <span className={`text-[10px] ${isOverdue ? 'text-brand-danger font-semibold' : 'text-brand-text-muted'}`}>
                                    {pct}%{isOverdue ? ' 期限超過' : ''}
                                </span>
                            </div>
                            {/* バー背景 */}
                            <div className="relative h-5 bg-brand-bg rounded-full overflow-hidden">
                                {/* マイルストーン期間バー */}
                                <div
                                    className="absolute h-full rounded-full opacity-30"
                                    style={{
                                        left: `${left}%`,
                                        width: `${width}%`,
                                        backgroundColor: isOverdue
                                            ? 'var(--color-brand-danger, #CF222E)'
                                            : 'var(--color-brand-primary, #0969DA)',
                                    }}
                                />
                                {/* 進捗バー */}
                                <div
                                    className="absolute h-full rounded-full transition-all duration-500"
                                    style={{
                                        left: `${left}%`,
                                        width: `${width * (pct / 100)}%`,
                                        backgroundColor: isOverdue
                                            ? 'var(--color-brand-danger, #CF222E)'
                                            : 'var(--color-brand-open, #2da44e)',
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 今日の線 */}
            <div className="relative h-4 mt-2">
                <div
                    className="absolute top-0 bottom-0 w-px bg-brand-danger"
                    style={{ left: `${todayPercent}%` }}
                />
                <span
                    className="absolute text-[9px] text-brand-danger -translate-x-1/2 top-0"
                    style={{ left: `${todayPercent}%` }}
                >
                    今日
                </span>
            </div>
        </div>
    );
}
