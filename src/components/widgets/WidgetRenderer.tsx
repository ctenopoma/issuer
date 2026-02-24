import { WidgetConfig } from '../../types';
import IssueSummary from './IssueSummary';
import QuickActions from './QuickActions';
import RecentActivity from './RecentActivity';
import FlowerGarden from './FlowerGarden';
import MilestoneGantt from './MilestoneGantt';
import MilestoneProgressWidget from './MilestoneProgressWidget';
import AssigneeWorkload from './AssigneeWorkload';
import LabelDistribution from './LabelDistribution';

interface Props {
    widget: WidgetConfig;
    // ナビゲーションコールバック
    onSelectIssue?: (id: number) => void;
    onNewIssue?: () => void;
    onShowMilestoneProgress?: () => void;
    onOpenSettings?: () => void;
}

export default function WidgetRenderer({
    widget,
    onSelectIssue,
    onNewIssue,
    onShowMilestoneProgress,
    onOpenSettings,
}: Props) {
    switch (widget.type) {
        case 'issue-summary':
            return <IssueSummary onSelectIssue={onSelectIssue} />;

        case 'quick-actions':
            return (
                <QuickActions
                    onNewIssue={onNewIssue}
                    onShowMilestoneProgress={onShowMilestoneProgress}
                    onOpenSettings={onOpenSettings}
                />
            );

        case 'recent-activity':
            return (
                <RecentActivity
                    config={widget.config as { limit?: number }}
                    onSelectIssue={onSelectIssue}
                />
            );

        case 'flower-garden':
            return <FlowerGarden config={widget.config} />;

        case 'milestone-gantt':
            return <MilestoneGantt config={widget.config} />;

        case 'milestone-progress':
            return <MilestoneProgressWidget config={widget.config} />;

        case 'assignee-workload':
            return <AssigneeWorkload config={widget.config} />;

        case 'label-distribution':
            return <LabelDistribution config={widget.config} />;

        // issue-list は Dashboard.tsx で直接処理
        case 'issue-list':
            return null;

        default:
            return null;
    }
}
