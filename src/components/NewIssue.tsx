import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Milestone } from '../types';
import Editor from './Editor';

interface Props {
    onCancel: () => void;
    onCreated: (id: number) => void;
}

export default function NewIssue({ onCancel, onCreated }: Props) {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [assignee, setAssignee] = useState('');
    const [labelsText, setLabelsText] = useState('');
    const [milestoneId, setMilestoneId] = useState<number | null>(null);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        api.getMilestones().then(setMilestones).catch(console.error);
    }, []);

    const handleSubmit = async () => {
        if (!title.trim()) return;

        setIsSubmitting(true);
        try {
            const id = await api.createIssue(title, body, "Self", assignee);

            // Set labels if provided
            const labels = labelsText.split(',').map(l => l.trim()).filter(Boolean);
            if (labels.length > 0) {
                await api.setIssueLabels(id, labels);
            }

            // Set milestone if selected
            if (milestoneId !== null) {
                await api.updateIssue(id, title, body, 'OPEN', assignee, milestoneId);
            }

            onCreated(id);
        } catch (e) {
            console.error(e);
            alert("Issue の作成に失敗しました。");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <button onClick={onCancel} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-brand-text-main" title="一覧に戻る">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <h2 className="text-[22px] font-bold text-brand-text-main flex-1">新規 Issue 作成</h2>
            </div>

            {/* Form */}
            <div className="bg-brand-card rounded-[10px] shadow-sm p-6 flex flex-col gap-5">
                <div>
                    <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">タイトル</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Issue のタイトルを入力..."
                        className="w-full bg-brand-bg border-none rounded-md py-2.5 px-3 text-[15px] focus:ring-2 focus:ring-brand-primary shadow-sm text-brand-text-main placeholder-brand-text-muted"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">担当者</label>
                        <input
                            type="text"
                            value={assignee}
                            onChange={(e) => setAssignee(e.target.value)}
                            placeholder="担当者名を入力..."
                            className="w-full bg-brand-bg border-none rounded-md py-2.5 px-3 text-[15px] focus:ring-2 focus:ring-brand-primary shadow-sm text-brand-text-main placeholder-brand-text-muted"
                        />
                    </div>
                    <div>
                        <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">マイルストーン</label>
                        <select
                            value={milestoneId ?? ''}
                            onChange={(e) => setMilestoneId(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full bg-brand-bg border-none rounded-md py-2.5 px-3 text-[15px] focus:ring-2 focus:ring-brand-primary shadow-sm text-brand-text-main"
                        >
                            <option value="">なし</option>
                            {milestones.map(m => (
                                <option key={m.id} value={m.id!}>{m.title}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">ラベル</label>
                    <input
                        type="text"
                        value={labelsText}
                        onChange={(e) => setLabelsText(e.target.value)}
                        placeholder="カンマ区切りでラベルを入力（例: bug, feature）"
                        className="w-full bg-brand-bg border-none rounded-md py-2.5 px-3 text-[15px] focus:ring-2 focus:ring-brand-primary shadow-sm text-brand-text-main placeholder-brand-text-muted"
                    />
                </div>

                <div>
                    <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">本文</label>
                    <Editor
                        value={body}
                        onChange={setBody}
                        placeholder="Markdown で本文を入力..."
                        minHeight="200px"
                    />
                </div>

                <div className="flex justify-end gap-3 mt-2">
                    <button
                        onClick={onCancel}
                        className="border border-brand-border bg-brand-card text-brand-text-main px-4 py-2 rounded-md text-[14px] hover:bg-gray-50 transition shadow-sm font-medium"
                    >
                        キャンセル
                    </button>
                    <button
                        disabled={isSubmitting || !title.trim()}
                        onClick={handleSubmit}
                        className="bg-brand-open hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-medium text-[14px] px-5 py-2 rounded-md shadow-sm transition-colors"
                    >
                        作成する
                    </button>
                </div>
            </div>
        </div>
    );
}
