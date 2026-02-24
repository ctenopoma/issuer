import { DashboardConfig, FilterState } from '../types';
import IssueList from './IssueList';
import WidgetRenderer from './widgets/WidgetRenderer';

interface Props {
    dashboard: DashboardConfig;
    // IssueList 用
    savedFilter?: FilterState | null;
    onSaveFilter?: (filter: FilterState) => void;
    // ナビゲーション
    onSelectIssue: (id: number) => void;
    onNewIssue: () => void;
    onShowMilestoneProgress: () => void;
    onOpenSettings: () => void;
    refreshKey: number;
}

/** レイアウトに応じた CSS Grid テンプレート */
function getGridClass(layout: string): string {
    switch (layout) {
        case 'grid-2col':
            return 'grid grid-cols-1 md:grid-cols-2 gap-4';
        case 'grid-3col':
            return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        case 'single-col':
        default:
            return 'flex flex-col gap-4';
    }
}

export default function Dashboard({
    dashboard,
    savedFilter,
    onSaveFilter,
    onSelectIssue,
    onNewIssue,
    onShowMilestoneProgress,
    onOpenSettings,
    refreshKey,
}: Props) {
    const { layout, widgets } = dashboard;

    // issue-list ウィジェットがあるかチェック
    const hasIssueList = widgets.some(w => w.type === 'issue-list');

    // single-col + issue-list のみ = 従来の IssueList 表示と同等
    if (layout === 'single-col' && widgets.length === 1 && hasIssueList) {
        return (
            <IssueList
                key={`list-${refreshKey}`}
                onSelectIssue={onSelectIssue}
                onNewIssue={onNewIssue}
                onShowMilestoneProgress={onShowMilestoneProgress}
                savedFilter={savedFilter}
                onSaveFilter={onSaveFilter}
            />
        );
    }

    // ウィジェットを position でソート（row → col 順）
    const sortedWidgets = [...widgets].sort((a, b) => {
        if (a.position.row !== b.position.row) return a.position.row - b.position.row;
        return a.position.col - b.position.col;
    });

    return (
        <div className="space-y-4">
            <div className={getGridClass(layout)}>
                {sortedWidgets.map((widget, i) => {
                    // issue-list は IssueList コンポーネントを直接レンダリング
                    if (widget.type === 'issue-list') {
                        return (
                            <div
                                key={`widget-${i}`}
                                style={{
                                    gridColumn: widget.position.colSpan
                                        ? `span ${widget.position.colSpan}`
                                        : undefined,
                                    gridRow: widget.position.rowSpan
                                        ? `span ${widget.position.rowSpan}`
                                        : undefined,
                                }}
                            >
                                <IssueList
                                    key={`list-${refreshKey}`}
                                    onSelectIssue={onSelectIssue}
                                    onNewIssue={onNewIssue}
                                    onShowMilestoneProgress={onShowMilestoneProgress}
                                    savedFilter={savedFilter}
                                    onSaveFilter={onSaveFilter}
                                />
                            </div>
                        );
                    }

                    return (
                        <div
                            key={`widget-${i}`}
                            style={{
                                gridColumn: widget.position.colSpan
                                    ? `span ${widget.position.colSpan}`
                                    : undefined,
                                gridRow: widget.position.rowSpan
                                    ? `span ${widget.position.rowSpan}`
                                    : undefined,
                            }}
                        >
                            <WidgetRenderer
                                widget={widget}
                                onSelectIssue={onSelectIssue}
                                onNewIssue={onNewIssue}
                                onShowMilestoneProgress={onShowMilestoneProgress}
                                onOpenSettings={onOpenSettings}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
