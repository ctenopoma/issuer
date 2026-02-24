import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Issue, Comment, Milestone, ReactionEntry, ReactionSummary } from '../types';
import Editor from './Editor';
import MarkdownView from './MarkdownView';
import ReactionBar from './ReactionBar';

interface Props {
    issueId: number;
    onBack: () => void;
    onNavigateToIssue?: (id: number) => void;
    currentUser: string;
}

export default function IssueDetail({ issueId, onBack, onNavigateToIssue, currentUser }: Props) {
    const [issue, setIssue] = useState<Issue | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Edit issue state
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editBody, setEditBody] = useState('');
    const [editAssignee, setEditAssignee] = useState('');
    const [editLabels, setEditLabels] = useState('');
    const [editMilestoneId, setEditMilestoneId] = useState<number | null>(null);

    // Delete confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Comment editing
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    const [editCommentBody, setEditCommentBody] = useState('');

    // Labels
    const [issueLabels, setIssueLabels] = useState<string[]>([]);

    // Milestones (for dropdown)
    const [milestones, setMilestones] = useState<Milestone[]>([]);

    // Reactions
    const [issueReactions, setIssueReactions] = useState<ReactionEntry[]>([]);
    const [commentReactionsMap, setCommentReactionsMap] = useState<Map<number, ReactionEntry[]>>(new Map());

    useEffect(() => {
        loadData();
    }, [issueId]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [issueData, commentsData, labels, msData, iReactions, cReactions] = await Promise.all([
                api.getIssue(issueId),
                api.getComments(issueId),
                api.getIssueLabels(issueId),
                api.getMilestones(),
                api.getIssueReactions(issueId, currentUser),
                api.getCommentReactions(issueId, currentUser),
            ]);
            setIssue(issueData);
            setComments(commentsData);
            setIssueLabels(labels);
            setMilestones(msData);
            setIssueReactions(iReactions);

            // Build comment reactions map
            const crMap = new Map<number, ReactionEntry[]>();
            (cReactions as ReactionSummary[]).forEach((s) => {
                crMap.set(s.target_id, s.reactions);
            });
            setCommentReactionsMap(crMap);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const submitComment = async () => {
        if (!newComment.trim()) return;
        setIsSubmitting(true);
        try {
            await api.createComment(issueId, newComment, currentUser);
            setNewComment('');
            await loadData();
        } catch (e) {
            console.error(e);
            alert("コメントの送信に失敗しました。");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async () => {
        if (!issue) return;
        const newStatus = issue.status === 'OPEN' ? 'CLOSED' : 'OPEN';
        try {
            await api.updateIssue(issue.id!, issue.title, issue.body, newStatus, issue.assignee || '', issue.milestone_id ?? null);
            setIssue({ ...issue, status: newStatus });
            loadData().catch(console.error);
        } catch (e) {
            console.error(e);
            alert("ステータス変更に失敗しました。");
        }
    };

    // --- Issue Edit ---
    const startEditing = () => {
        if (!issue) return;
        setEditTitle(issue.title);
        setEditBody(issue.body);
        setEditAssignee(issue.assignee || '');
        setEditLabels(issueLabels.join(', '));
        setEditMilestoneId(issue.milestone_id ?? null);
        setIsEditing(true);
    };

    const saveEdit = async () => {
        if (!issue || !editTitle.trim()) return;
        try {
            await api.updateIssue(issue.id!, editTitle, editBody, issue.status, editAssignee, editMilestoneId);
            // Save labels
            const labelList = editLabels.split(',').map(l => l.trim()).filter(l => l);
            await api.setIssueLabels(issue.id!, labelList);
            setIsEditing(false);
            await loadData();
        } catch (e) {
            console.error(e);
            alert("Issue の更新に失敗しました。");
        }
    };

    // --- Issue Delete ---
    const handleDeleteIssue = async () => {
        if (!issue) return;
        try {
            await api.deleteIssue(issue.id!);
            onBack();
        } catch (e) {
            console.error(e);
            alert("Issue の削除に失敗しました。");
        }
    };

    // --- Comment Edit ---
    const startEditingComment = (comment: Comment) => {
        setEditingCommentId(comment.id!);
        setEditCommentBody(comment.body);
    };

    const saveCommentEdit = async () => {
        if (editingCommentId === null || !editCommentBody.trim()) return;
        try {
            await api.updateComment(editingCommentId, editCommentBody);
            setEditingCommentId(null);
            setEditCommentBody('');
            await loadData();
        } catch (e) {
            console.error(e);
            alert("コメントの更新に失敗しました。");
        }
    };

    const handleDeleteComment = async (commentId: number) => {
        if (!confirm("このコメントを削除しますか？")) return;
        try {
            await api.deleteComment(commentId);
            await loadData();
        } catch (e) {
            console.error(e);
            alert("コメントの削除に失敗しました。");
        }
    };

    const handleShareOutlook = async () => {
        if (!issue) return;

        const milestoneTitle = issue.milestone_id
            ? milestones.find(m => m.id === issue.milestone_id)?.title
            : null;

        const bodyLines = [
            `Link: #issue-${issue.id}`,
            "",
            `Title: ${issue.title}`,
            `Status: ${issue.status}`,
            `Assignee: ${issue.assignee || "未設定"}`,
            `Milestone: ${milestoneTitle || "なし"}`,
            "",
            "---",
            "本文:",
            issue.body || "(本文なし)",
        ];

        try {
            await api.openOutlook(
                "",
                `[Issue #${issue.id}] ${issue.title}`,
                bodyLines.join("\n")
            );
        } catch (e) {
            console.error(e);
            alert("Outlook の起動に失敗しました。");
        }
    };

    // --- Reactions ---
    const handleToggleIssueReaction = async (reaction: string) => {
        try {
            await api.toggleIssueReaction(issueId, reaction, currentUser);
            const updated = await api.getIssueReactions(issueId, currentUser);
            setIssueReactions(updated);
        } catch (e) {
            console.error(e);
        }
    };

    const handleToggleCommentReaction = async (commentId: number, reaction: string) => {
        try {
            await api.toggleCommentReaction(commentId, reaction, currentUser);
            const updated = await api.getCommentReactions(issueId, currentUser);
            const crMap = new Map<number, ReactionEntry[]>();
            (updated as ReactionSummary[]).forEach((s) => {
                crMap.set(s.target_id, s.reactions);
            });
            setCommentReactionsMap(crMap);
        } catch (e) {
            console.error(e);
        }
    };

    // --- Navigation ---
    const handleNavigateToIssue = (targetId: number) => {
        if (onNavigateToIssue) {
            onNavigateToIssue(targetId);
        }
    };

    // Find milestone title
    const milestoneName = issue?.milestone_id
        ? milestones.find(m => m.id === issue.milestone_id)?.title
        : null;

    if (loading || !issue) return <div className="text-center py-20 text-brand-text-muted">Loading...</div>;

    return (
        <div className="flex flex-col gap-4">
            {/* Sticky Header */}
            <div className="sticky top-0 z-10 bg-brand-bg pb-2 -mx-6 px-6 pt-2">
                {/* Title row */}
                <div className="flex items-center gap-2 mb-2">
                    <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-brand-text-main" title="一覧に戻る">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    {isEditing ? (
                        <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="flex-1 text-[22px] font-bold bg-brand-bg border-none rounded-md py-1 px-2 focus:ring-2 focus:ring-brand-primary"
                        />
                    ) : (
                        <div className="text-[22px] font-bold text-brand-text-main flex-1 truncate">
                            {issue.title} <span className="text-brand-text-muted font-normal ml-2">#{issue.id}</span>
                        </div>
                    )}
                    <button onClick={onBack} className="flex items-center gap-1 text-brand-primary px-3 py-1.5 rounded-md hover:bg-blue-50 transition text-sm font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        一覧へ
                    </button>
                </div>

                {/* Meta tags */}
                <div className="flex items-center gap-2 text-[13px] border-b border-brand-border pb-3 flex-wrap">
                    <span className={`px-3 py-1 rounded-full font-bold text-white flex items-center gap-1 ${issue.status === 'OPEN' ? 'bg-brand-open' : 'bg-brand-closed'}`}>
                        {issue.status === 'OPEN' ? (
                            <div className="w-3 h-3 rounded-full border-[2px] border-current"></div>
                        ) : (
                            <div className="w-3 h-3 rounded-full bg-current"></div>
                        )}
                        {issue.status}
                    </span>
                    <span className="text-brand-text-muted ml-2">
                        <strong className="text-brand-text-main">{issue.created_by}</strong> が {new Date(issue.created_at).toLocaleDateString()} に作成
                    </span>
                    <span className="text-brand-text-muted">・</span>
                    <span className="text-brand-text-muted">{comments.length} 件のコメント</span>

                    {/* Labels */}
                    {issueLabels.length > 0 && (
                        <>
                            <span className="text-brand-text-muted">・</span>
                            {issueLabels.map(label => (
                                <span key={label} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-brand-primary border border-blue-200">
                                    {label}
                                </span>
                            ))}
                        </>
                    )}

                    {/* Milestone */}
                    {milestoneName && (
                        <>
                            <span className="text-brand-text-muted">・</span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                                📌 {milestoneName}
                            </span>
                        </>
                    )}

                    {/* Assignee */}
                    {issue.assignee && (
                        <>
                            <span className="text-brand-text-muted">・</span>
                            <span className="text-brand-text-muted">担当: <strong className="text-brand-text-main">{issue.assignee}</strong></span>
                        </>
                    )}

                    <div className="flex-1"></div>

                    {/* Edit Button */}
                    {!isEditing && (
                        <button onClick={startEditing} className="flex items-center gap-1.5 border border-brand-border bg-brand-card text-brand-text-main px-3 py-1.5 rounded-md text-sm hover:bg-gray-50 transition shadow-sm font-medium">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            編集
                        </button>
                    )}

                    {/* Open/Close Toggle */}
                    <button
                        onClick={handleToggleStatus}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition ${issue.status === 'OPEN'
                            ? 'bg-brand-closed text-white hover:opacity-90'
                            : 'bg-brand-open text-white hover:opacity-90'
                            }`}
                    >
                        {issue.status === 'OPEN' ? 'Close Issue' : 'Reopen Issue'}
                    </button>

                    <button onClick={handleShareOutlook} className="flex items-center gap-1.5 border border-brand-border bg-brand-card text-brand-text-main px-3 py-1.5 rounded-md text-sm hover:bg-gray-50 transition shadow-sm font-medium">
                        <span>✉️</span> Outlookで共有
                    </button>

                    {/* Delete Button */}
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-1 text-brand-danger px-2 py-1.5 rounded-md text-sm hover:bg-red-50 transition font-medium"
                        title="削除"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>

            {/* Issue Body (or edit form) */}
            {isEditing ? (
                <div className="bg-brand-card rounded-[10px] shadow-sm p-6 flex flex-col gap-4">
                    <div>
                        <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">担当者</label>
                        <input
                            type="text"
                            value={editAssignee}
                            onChange={(e) => setEditAssignee(e.target.value)}
                            placeholder="担当者名"
                            className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">ラベル</label>
                        <input
                            type="text"
                            value={editLabels}
                            onChange={(e) => setEditLabels(e.target.value)}
                            placeholder="カンマ区切りでラベルを入力（例: bug, feature）"
                            className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">マイルストーン</label>
                        <select
                            value={editMilestoneId ?? ''}
                            onChange={(e) => setEditMilestoneId(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full bg-brand-bg border-none rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary shadow-sm"
                        >
                            <option value="">なし</option>
                            {milestones.map(m => (
                                <option key={m.id} value={m.id!}>{m.title}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[14px] font-bold text-brand-text-main mb-1.5">本文</label>
                        <Editor value={editBody} onChange={setEditBody} minHeight="200px" />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setIsEditing(false)} className="border border-brand-border bg-brand-card text-brand-text-main px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm">キャンセル</button>
                        <button onClick={saveEdit} disabled={!editTitle.trim()} className="bg-brand-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition shadow-sm disabled:opacity-50">保存</button>
                    </div>
                </div>
            ) : (
                <div className="bg-brand-card border border-transparent rounded-[10px] shadow-sm p-6 mb-2">
                    <div className="text-brand-text-main text-[15px] leading-relaxed">
                        {issue.body ? (
                            <MarkdownView content={issue.body} onNavigateToIssue={handleNavigateToIssue} />
                        ) : (
                            <span className="text-brand-text-muted italic">本文なし</span>
                        )}
                    </div>
                    {/* Issue Reactions */}
                    <div className="mt-4 pt-3 border-t border-brand-border">
                        <ReactionBar
                            reactions={issueReactions}
                            onToggle={handleToggleIssueReaction}
                        />
                    </div>
                </div>
            )}

            {/* Comments Header */}
            <div className="mt-4 mb-2">
                <h3 className="text-[16px] font-bold text-brand-text-main">
                    💬 コメント ({comments.length})
                </h3>
            </div>

            {/* Comments List */}
            <div className="flex flex-col gap-4">
                {comments.map(comment => {
                    const initial = comment.created_by.charAt(0).toUpperCase();
                    const isEditingThis = editingCommentId === comment.id;
                    const cReactions = commentReactionsMap.get(comment.id!) || [];
                    return (
                        <div key={comment.id} className="bg-brand-card border border-transparent rounded-[10px] shadow-sm p-4 flex flex-col gap-2 group">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center text-[14px] font-bold">
                                    {initial}
                                </div>
                                <div className="text-[14px] font-bold text-brand-text-main">
                                    {comment.created_by}
                                </div>
                                <div className="text-[12px] text-brand-text-muted">
                                    {new Date(comment.created_at).toLocaleString()}
                                </div>
                                <div className="flex-1"></div>
                                {/* Edit/Delete buttons — visible on hover */}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                    <button
                                        onClick={() => startEditingComment(comment)}
                                        className="p-1 hover:bg-gray-100 rounded text-brand-text-muted hover:text-brand-primary transition"
                                        title="編集"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteComment(comment.id!)}
                                        className="p-1 hover:bg-red-50 rounded text-brand-text-muted hover:text-brand-danger transition"
                                        title="削除"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                            {isEditingThis ? (
                                <div className="pl-10 flex flex-col gap-2">
                                    <Editor
                                        value={editCommentBody}
                                        onChange={setEditCommentBody}
                                        minHeight="80px"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditingCommentId(null)} className="text-sm text-brand-text-muted hover:text-brand-text-main px-3 py-1">キャンセル</button>
                                        <button onClick={saveCommentEdit} className="bg-brand-primary text-white text-sm px-3 py-1 rounded-md hover:opacity-90 transition">保存</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="pl-10 text-brand-text-main text-[15px]">
                                        <MarkdownView content={comment.body} onNavigateToIssue={handleNavigateToIssue} />
                                    </div>
                                    <div className="pl-10">
                                        <ReactionBar
                                            reactions={cReactions}
                                            onToggle={(reaction) => handleToggleCommentReaction(comment.id!, reaction)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Comment Form */}
            <div className="mt-8 pt-6 border-t border-brand-border flex flex-col gap-2">
                <Editor value={newComment} onChange={setNewComment} minHeight="120px" />
                <div className="flex justify-end mt-2">
                    <button
                        disabled={isSubmitting || !newComment.trim()}
                        onClick={submitComment}
                        className="bg-brand-open hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white text-[14px] font-medium px-4 py-2 rounded-md shadow-sm transition-colors"
                    >
                        コメントする
                    </button>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-brand-card rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                        <div className="bg-red-50 border-b border-red-200 px-6 py-4">
                            <h2 className="text-lg font-bold text-red-900 flex items-center gap-2">
                                <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                Issue を削除
                            </h2>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-brand-text-main text-[15px]">
                                「<strong>{issue.title}</strong>」を削除しますか？
                            </p>
                            <p className="text-brand-danger text-[14px] mt-2">
                                この操作は元に戻せません。関連するコメントもすべて削除されます。
                            </p>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-brand-border flex justify-end gap-3">
                            <button onClick={() => setShowDeleteConfirm(false)} className="border border-brand-border bg-brand-card text-brand-text-main px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-100 transition shadow-sm">
                                キャンセル
                            </button>
                            <button onClick={handleDeleteIssue} className="bg-brand-danger text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition shadow-sm">
                                削除する
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
