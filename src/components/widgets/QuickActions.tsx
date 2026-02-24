interface Props {
    onNewIssue?: () => void;
    onShowMilestoneProgress?: () => void;
    onOpenSettings?: () => void;
}

export default function QuickActions({ onNewIssue, onShowMilestoneProgress, onOpenSettings }: Props) {
    const actions = [
        {
            label: '新しい Issue',
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            ),
            onClick: onNewIssue,
            color: 'bg-brand-primary',
        },
        {
            label: 'マイルストーン',
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
            onClick: onShowMilestoneProgress,
            color: 'bg-brand-open',
        },
        {
            label: '設定',
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            onClick: onOpenSettings,
            color: 'bg-brand-text-muted',
        },
    ];

    return (
        <div className="bg-brand-card rounded-xl border border-brand-border p-6">
            <h3 className="text-sm font-semibold text-brand-text-muted mb-4">クイックアクション</h3>
            <div className="flex flex-col gap-2">
                {actions.map(action => (
                    <button
                        key={action.label}
                        onClick={action.onClick}
                        disabled={!action.onClick}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-brand-text-main hover:bg-brand-bg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className={`${action.color} text-white p-1.5 rounded-md`}>
                            {action.icon}
                        </span>
                        {action.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
