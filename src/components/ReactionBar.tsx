import { ReactionEntry } from '../types';

const REACTION_OPTIONS = ['👍', '🎉', '❤️', '🚀', '👀', '👎'];

interface Props {
    reactions: ReactionEntry[];
    onToggle: (reaction: string) => void;
    disabled?: boolean;
}

export default function ReactionBar({ reactions, onToggle, disabled = false }: Props) {
    const reactionsMap = new Map(reactions.map(r => [r.reaction, r]));

    return (
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {/* Existing reactions */}
            {reactions.filter(r => r.count > 0).map(r => (
                <button
                    key={r.reaction}
                    onClick={() => !disabled && onToggle(r.reaction)}
                    disabled={disabled}
                    title={r.users.join(', ')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition cursor-pointer
                        ${r.reacted
                            ? 'bg-blue-50 border-brand-primary text-brand-primary'
                            : 'bg-gray-50 border-brand-border text-brand-text-muted hover:border-gray-400'
                        }
                        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                >
                    <span>{r.reaction}</span>
                    <span className="font-medium">{r.count}</span>
                </button>
            ))}

            {/* Add reaction dropdown */}
            {!disabled && (
                <div className="relative group/reaction">
                    <button
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs border border-dashed border-brand-border text-brand-text-muted hover:border-gray-400 hover:text-brand-text-main transition"
                        title="リアクションを追加"
                    >
                        <span className="text-sm">😀</span>
                        <span className="ml-0.5">+</span>
                    </button>
                    <div className="absolute left-0 bottom-full mb-1 hidden group-hover/reaction:flex bg-brand-card rounded-lg shadow-lg border border-brand-border p-1.5 gap-1 z-10">
                        {REACTION_OPTIONS.map(emoji => {
                            const existing = reactionsMap.get(emoji);
                            return (
                                <button
                                    key={emoji}
                                    onClick={() => onToggle(emoji)}
                                    className={`text-lg p-1 rounded hover:bg-gray-100 transition ${existing?.reacted ? 'bg-blue-50' : ''}`}
                                    title={emoji}
                                >
                                    {emoji}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
