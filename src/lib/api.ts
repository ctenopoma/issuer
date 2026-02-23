import { Issue, Comment, Milestone, ReactionEntry, ReactionSummary, MilestoneProgress, ThemeConfig, ThemeMetadata } from '../types';

// Detect if we're running inside Tauri
const isTauri = !!(window as any).__TAURI_INTERNALS__;
console.log('[Issuer] isTauri =', isTauri);

// Dynamic import for tauri invoke - only if available
let invoke: any;
if (isTauri) {
    invoke = async (cmd: string, args?: any) => {
        console.log(`[Issuer] invoke: ${cmd}`, JSON.stringify(args));
        try {
            const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
            const result = await tauriInvoke(cmd, args);
            console.log(`[Issuer] invoke OK: ${cmd}`, result);
            return result;
        } catch (e) {
            console.error(`[Issuer] invoke FAIL: ${cmd}`, e);
            throw e;
        }
    };
} else {
    // Browser mock for development preview
    console.warn('[Issuer] Running outside Tauri — using mock data.');
    const mockIssues: Issue[] = [
        { id: 1, title: 'ログイン画面のデザイン変更', body: '現在のログイン画面のデザインを刷新します。\n\n- カラーパレットの統一\n- モバイル対応\n- アクセシビリティ改善\n\nファイルパス: C:\\Users\\test\\project\\design.psd\n関連 Issue は #2 を参照', status: 'OPEN', created_by: 'tanaka', assignee: 'suzuki', milestone_id: 1, created_at: '2026-02-15T09:30:00', updated_at: '2026-02-18T14:20:00' },
        { id: 2, title: 'API レスポンス速度の改善', body: 'データベースクエリの最適化とキャッシュ導入で API レスポンスを高速化する。', status: 'OPEN', created_by: 'suzuki', assignee: 'tanaka', milestone_id: null, created_at: '2026-02-16T10:00:00', updated_at: '2026-02-17T11:00:00' },
        { id: 3, title: 'ユーザー管理機能の追加', body: '管理者がユーザーの追加・編集・削除を行える画面を作成する。', status: 'OPEN', created_by: 'yamada', assignee: '', milestone_id: null, created_at: '2026-02-14T08:00:00', updated_at: '2026-02-14T08:00:00' },
        { id: 4, title: 'CI/CD パイプラインの構築', body: 'GitHub Actions を使用した自動テスト・デプロイの仕組みを構築済み。', status: 'CLOSED', created_by: 'tanaka', assignee: 'tanaka', milestone_id: 1, created_at: '2026-02-10T10:00:00', updated_at: '2026-02-13T16:00:00' },
        { id: 5, title: 'ドキュメント整備', body: 'README とコントリビューションガイドを更新する。', status: 'CLOSED', created_by: 'suzuki', assignee: 'yamada', milestone_id: null, created_at: '2026-02-08T09:00:00', updated_at: '2026-02-12T11:00:00' },
    ];
    const mockComments: Comment[] = [
        { id: 1, issue_id: 1, body: 'カラーパレットの案を添付しました。レビューお願いします。', created_by: 'suzuki', created_at: '2026-02-16T14:30:00' },
        { id: 2, issue_id: 1, body: 'LGTM! この方向で進めましょう。', created_by: 'tanaka', created_at: '2026-02-17T09:00:00' },
    ];
    const mockMilestones: Milestone[] = [
        { id: 1, title: 'v1.0 リリース', description: '初回リリースに必要な機能を完成させる', start_date: '2026-02-01', due_date: '2026-03-15', status: 'active', created_at: '2026-02-01T09:00:00', updated_at: '2026-02-15T10:00:00' },
        { id: 2, title: 'v1.1 改善', description: 'ユーザーフィードバック反映', start_date: '2026-03-16', due_date: '2026-04-30', status: 'planned', created_at: '2026-02-10T09:00:00', updated_at: '2026-02-10T09:00:00' },
    ];
    invoke = async (cmd: string, args?: any) => {
        await new Promise(r => setTimeout(r, 300)); // simulate latency
        switch (cmd) {
            case 'get_issues': return mockIssues;
            case 'get_issue': return mockIssues.find(i => i.id === args?.id) || null;
            case 'get_comments': return mockComments.filter(c => c.issue_id === args?.issue_id);
            case 'create_issue': return 100;
            case 'create_comment': return 100;
            case 'update_comment': return null;
            case 'delete_comment': return null;
            case 'update_issue': return null;
            case 'delete_issue': return null;
            case 'get_milestones': return mockMilestones;
            case 'create_milestone': return 10;
            case 'update_milestone': return null;
            case 'delete_milestone': return null;
            case 'get_milestone_progress': return [
                { milestone_id: 1, total: 3, closed: 1, percent: 33 },
                { milestone_id: 2, total: 0, closed: 0, percent: 0 },
            ];
            case 'paste_image': return 'assets/mock.png';
            case 'get_os_username': return 'mock_user';
            case 'get_user_display_name': return null;
            case 'set_user_display_name': return null;
            case 'get_issue_reactions': return [
                { reaction: '👍', count: 2, reacted: true, users: ['tanaka', 'suzuki'] },
                { reaction: '🎉', count: 1, reacted: false, users: ['yamada'] },
            ];
            case 'toggle_issue_reaction': return null;
            case 'get_comment_reactions': return [
                { target_id: 1, reactions: [{ reaction: '👍', count: 1, reacted: false, users: ['tanaka'] }] },
            ];
            case 'toggle_comment_reaction': return null;
            case 'list_all_labels': return ['bug', 'feature', 'improvement', 'documentation'];
            case 'get_issue_labels': return ['feature', 'improvement'];
            case 'get_labels_map': return [[1, ['feature']], [2, ['bug', 'improvement']]];
            case 'set_issue_labels': return null;
            case 'get_installed_themes': return [];
            case 'get_active_theme': return null;
            case 'set_active_theme': return null;
            case 'read_theme_file': return '';
            case 'get_theme_asset_path': return '';
            case 'delete_theme': return null;
            case 'list_remote_themes': return [];
            case 'download_theme': return null;
            default: return null;
        }
    };
}

export const api = {
    // Issues
    getIssues: () => invoke('get_issues') as Promise<Issue[]>,
    getIssue: (id: number) => invoke('get_issue', { id }) as Promise<Issue>,
    createIssue: (title: string, body: string, createdBy: string, assignee: string) =>
        invoke('create_issue', { title, body, createdBy, assignee }) as Promise<number>,
    updateIssue: (id: number, title: string, body: string, status: string, assignee: string, milestoneId: number | null) =>
        invoke('update_issue', { id, title, body, status, assignee, milestoneId }) as Promise<void>,
    deleteIssue: (id: number) =>
        invoke('delete_issue', { id }) as Promise<void>,

    // Comments
    getComments: (issueId: number) => invoke('get_comments', { issueId }) as Promise<Comment[]>,
    createComment: (issueId: number, body: string, createdBy: string) =>
        invoke('create_comment', { issueId, body, createdBy }) as Promise<number>,
    updateComment: (id: number, body: string) =>
        invoke('update_comment', { id, body }) as Promise<void>,
    deleteComment: (id: number) =>
        invoke('delete_comment', { id }) as Promise<void>,

    // Attachments & Outlook
    getAssetsDir: () => invoke('get_assets_dir') as Promise<string>,
    pasteImage: () => invoke('paste_image') as Promise<string>,
    openOutlook: (to: string, subject: string, body: string) =>
        invoke('create_outlook_draft', { to, subject, body }) as Promise<void>,

    // Milestones
    getMilestones: () => invoke('get_milestones') as Promise<Milestone[]>,
    createMilestone: (title: string, description: string, startDate: string | null, dueDate: string | null) =>
        invoke('create_milestone', { title, description, startDate, dueDate }) as Promise<number>,
    updateMilestone: (id: number, title: string, description: string, startDate: string | null, dueDate: string | null, status: string) =>
        invoke('update_milestone', { id, title, description, startDate, dueDate, status }) as Promise<void>,
    deleteMilestone: (id: number) =>
        invoke('delete_milestone', { id }) as Promise<void>,
    getMilestoneProgress: () =>
        invoke('get_milestone_progress') as Promise<MilestoneProgress[]>,

    // Reactions
    getIssueReactions: (issueId: number, currentUser: string) =>
        invoke('get_issue_reactions', { issueId, currentUser }) as Promise<ReactionEntry[]>,
    toggleIssueReaction: (issueId: number, reaction: string, currentUser: string) =>
        invoke('toggle_issue_reaction', { issueId, reaction, currentUser }) as Promise<void>,
    getCommentReactions: (issueId: number, currentUser: string) =>
        invoke('get_comment_reactions', { issueId, currentUser }) as Promise<ReactionSummary[]>,
    toggleCommentReaction: (commentId: number, reaction: string, currentUser: string) =>
        invoke('toggle_comment_reaction', { commentId, reaction, currentUser }) as Promise<void>,

    // Labels
    listAllLabels: () => invoke('list_all_labels') as Promise<string[]>,
    getIssueLabels: (issueId: number) =>
        invoke('get_issue_labels', { issueId }) as Promise<string[]>,
    getLabelsMap: (issueIds: number[]) =>
        invoke('get_labels_map', { issueIds }) as Promise<[number, string[]][]>,
    setIssueLabels: (issueId: number, labels: string[]) =>
        invoke('set_issue_labels', { issueId, labels }) as Promise<void>,

    // Settings
    getOsUsername: () => invoke('get_os_username') as Promise<string>,
    getUserDisplayName: () => invoke('get_user_display_name') as Promise<string | null>,
    setUserDisplayName: (name: string | null) => invoke('set_user_display_name', { name }) as Promise<void>,

    // Themes
    getInstalledThemes: () => invoke('get_installed_themes') as Promise<ThemeConfig[]>,
    getActiveTheme: () => invoke('get_active_theme') as Promise<ThemeConfig | null>,
    setActiveTheme: (themeId: string | null) => invoke('set_active_theme', { themeId }) as Promise<void>,
    readThemeFile: (themeId: string, filePath: string) => invoke('read_theme_file', { themeId, filePath }) as Promise<string>,
    getThemeAssetPath: (themeId: string, assetPath: string) => invoke('get_theme_asset_path', { themeId, assetPath }) as Promise<string>,
    deleteTheme: (themeId: string) => invoke('delete_theme', { themeId }) as Promise<void>,
    listRemoteThemes: () => invoke('list_remote_themes') as Promise<ThemeMetadata[]>,
    downloadTheme: (themeId: string) => invoke('download_theme', { themeId }) as Promise<ThemeConfig>,
};