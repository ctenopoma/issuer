import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Milestone, MilestoneProgress as MilestoneProgressType } from '../types';

interface Props {
    onBack: () => void;
    onSelectMilestone?: (milestoneId: number) => void;
}

export default function MilestoneProgressView({ onBack, onSelectMilestone }: Props) {
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [progress, setProgress] = useState<Map<number, MilestoneProgressType>>(new Map());
    const [loading, setLoading] = useState(true);

    // Edit state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editStartDate, setEditStartDate] = useState('');
    const [editDueDate, setEditDueDate] = useState('');
    const [editStatus, setEditStatus] = useState('planned');

    // New milestone
    const [showNewForm, setShowNewForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newStartDate, setNewStartDate] = useState('');
    const [newDueDate, setNewDueDate] = useState('');

    // Delete confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [ms, prog] = await Promise.all([
                api.getMilestones(),
                api.getMilestoneProgress(),
            ]);
            setMilestones(ms);
            const pMap = new Map<number, MilestoneProgressType>();
            prog.forEach(p => pMap.set(p.milestone_id, p));
            setProgress(pMap);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (m: Milestone) => {
        setEditingId(m.id!);
        setEditTitle(m.title);
        setEditDesc(m.description);
        setEditStartDate(m.start_date || '');
        setEditDueDate(m.due_date || '');
        setEditStatus(m.status);
    };

    const saveEdit = async () => {
        if (!editingId || !editTitle.trim()) return;
        try {
            await api.updateMilestone(editingId, editTitle, editDesc, editStartDate || null, editDueDate || null, editStatus);
            setEditingId(null);
            await loadData();
        } catch (e) {
            console.error(e);
            alert("マイルストーンの更新に失敗しました。");
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await api.deleteMilestone(id);
            setDeleteConfirmId(null);
            await loadData();
        } catch (e) {
            console.error(e);
            alert("マイルストーンの削除に失敗しました。");
        }
    };

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        try {
            await api.createMilestone(newTitle, newDesc, newStartDate || null, newDueDate || null);
            setShowNewForm(false);
            setNewTitle('');
            setNewDesc('');
            setNewStartDate('');
            setNewDueDate('');
            await loadData();
        } catch (e) {
            console.error(e);
            alert("マイルストーンの作成に失敗しました。");
        }
    };

    const remainingDays = (dueDate: string | null | undefined) => {
        if (!dueDate) return null;
        const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (diff < 0) return <span className="text-brand-danger font-medium">{Math.abs(diff)}日超過</span>;
        if (diff === 0) return <span className="text-amber-600 font-medium">本日期限</span>;
        return <span className="text-brand-text-muted">残り {diff} 日</span>;
    };

    if (loading) return <div className="text-center py-20 text-brand-text-muted">読み込み中...</div>;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
                <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-brand-text-main" title="一覧に戻る">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <h2 className="text-[22px] font-bold text-brand-text-main flex-1">📊 マイルストーン進捗</h2>
                <button
                    onClick={() => setShowNewForm(true)}
                    className="flex items-center gap-1.5 bg-brand-open text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 transition"
                >
                    + 新規作成
                </button>
            </div>

            {/* New milestone form */}
            {showNewForm && (
                <div className="bg-brand-card rounded-lg shadow-sm p-5 border border-brand-border flex flex-col gap-3">
                    <h3 className="font-bold text-brand-text-main">新しいマイルストーン</h3>
                    <input type="text" placeholder="タイトル" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                        className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm" />
                    <textarea placeholder="説明" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
                        className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm resize-y" />
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-brand-text-muted">開始日</label>
                            <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)}
                                className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-brand-text-muted">期限</label>
                            <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)}
                                className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowNewForm(false)} className="text-sm px-3 py-1.5 text-brand-text-muted hover:text-brand-text-main">キャンセル</button>
                        <button onClick={handleCreate} disabled={!newTitle.trim()} className="bg-brand-primary text-white text-sm px-4 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition">作成</button>
                    </div>
                </div>
            )}

            {/* Milestones list */}
            {milestones.length === 0 ? (
                <div className="py-20 text-center text-brand-text-muted">マイルストーンがありません</div>
            ) : milestones.map(m => {
                const p = progress.get(m.id!) || { total: 0, closed: 0, percent: 0, milestone_id: m.id! };
                const isEditing = editingId === m.id;
                const statusColor = m.status === 'closed' ? 'bg-brand-closed' : m.status === 'active' ? 'bg-brand-open' : 'bg-gray-400';

                return (
                    <div key={m.id} className="bg-brand-card rounded-lg shadow-sm p-5 border border-brand-border">
                        {isEditing ? (
                            <div className="flex flex-col gap-3">
                                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                                    className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm font-bold" />
                                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
                                    className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm resize-y" />
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-xs text-brand-text-muted">開始日</label>
                                        <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                                            className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-brand-text-muted">期限</label>
                                        <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                                            className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-brand-text-muted">ステータス</label>
                                        <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                                            className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm shadow-sm">
                                            <option value="planned">Planned</option>
                                            <option value="active">Active</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setEditingId(null)} className="text-sm px-3 py-1.5 text-brand-text-muted">キャンセル</button>
                                    <button onClick={saveEdit} className="bg-brand-primary text-white text-sm px-4 py-1.5 rounded-md hover:opacity-90 transition">保存</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className={`w-3 h-3 rounded-full ${statusColor}`}></span>
                                    <h3 className="text-lg font-bold text-brand-text-main flex-1">{m.title}</h3>
                                    {remainingDays(m.due_date)}
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => startEdit(m)} className="p-1 hover:bg-gray-100 rounded text-brand-text-muted hover:text-brand-primary transition" title="編集">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                        <button onClick={() => setDeleteConfirmId(m.id!)} className="p-1 hover:bg-red-50 rounded text-brand-text-muted hover:text-brand-danger transition" title="削除">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                        {onSelectMilestone && (
                                            <button onClick={() => onSelectMilestone(m.id!)} className="text-xs text-brand-primary hover:underline ml-2">
                                                Issueを表示 →
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {m.description && <p className="text-sm text-brand-text-muted mb-3">{m.description}</p>}

                                {/* Progress bar */}
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${p.percent >= 100 ? 'bg-brand-open' : 'bg-brand-primary'}`}
                                            style={{ width: `${Math.min(p.percent, 100)}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-sm font-medium text-brand-text-main min-w-[80px] text-right">
                                        {p.percent}% ({p.closed}/{p.total})
                                    </span>
                                </div>
                                <div className="mt-2 text-xs text-brand-text-muted flex gap-4">
                                    {m.start_date && <span>開始: {m.start_date}</span>}
                                    {m.due_date && <span>期限: {m.due_date}</span>}
                                    <span className="capitalize">{m.status}</span>
                                </div>
                            </>
                        )}
                    </div>
                );
            })}

            {/* Delete confirmation */}
            {deleteConfirmId !== null && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-brand-card rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                        <div className="bg-red-50 border-b border-red-200 px-6 py-4">
                            <h2 className="text-lg font-bold text-red-900">マイルストーンを削除</h2>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-brand-text-main">このマイルストーンを削除しますか？関連する Issue からマイルストーンの紐付けが解除されます。</p>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-brand-border flex justify-end gap-3">
                            <button onClick={() => setDeleteConfirmId(null)} className="border border-brand-border bg-brand-card text-brand-text-main px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-100 transition shadow-sm">キャンセル</button>
                            <button onClick={() => handleDelete(deleteConfirmId)} className="bg-brand-danger text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition shadow-sm">削除する</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
