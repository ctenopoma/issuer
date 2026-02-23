import { useState, useRef } from 'react';
import { api } from '../lib/api';
import MarkdownView from './MarkdownView';
import MarkdownCheatSheet from './MarkdownCheatSheet';

interface Props {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    minHeight?: string;
}

export default function Editor({ value, onChange, placeholder = "Leave a comment", minHeight = "150px" }: Props) {
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
    const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handlePaste = async (e: React.ClipboardEvent) => {
        const hasImage = Array.from(e.clipboardData.items).some(item => item.type.startsWith('image/'));

        if (hasImage) {
            e.preventDefault();
            setIsUploading(true);
            try {
                const imagePath = await api.pasteImage();
                const markdownImage = `\n![image](${imagePath})\n`;

                const cursorPosition = textareaRef.current?.selectionStart || value.length;
                const newValue = value.substring(0, cursorPosition) + markdownImage + value.substring(cursorPosition);
                onChange(newValue);
            } catch (err) {
                console.error("Paste failed:", err);
                alert("画像の貼り付けに失敗しました。");
            } finally {
                setIsUploading(false);
            }
        }
    };

    return (
        <div className="border border-gray-300 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
            <div className="bg-gray-50 border-b border-gray-300 px-3 py-2 text-sm flex justify-between items-center">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('write')}
                        className={`font-medium px-3 py-1 rounded transition ${activeTab === 'write'
                            ? 'text-gray-700 bg-white border border-gray-300 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Write
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`font-medium px-3 py-1 rounded transition ${activeTab === 'preview'
                            ? 'text-gray-700 bg-white border border-gray-300 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Preview
                    </button>
                </div>
                <button
                    onClick={() => setIsCheatSheetOpen(!isCheatSheetOpen)}
                    className="flex items-center gap-1 text-gray-500 hover:text-brand-primary transition-colors text-xs px-2 py-1 rounded hover:bg-gray-100"
                    title="Markdownの書き方を確認"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    <span>Markdown記法</span>
                </button>
            </div>

            {activeTab === 'write' ? (
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onPaste={handlePaste}
                    className="w-full p-3 outline-none resize-y text-sm bg-gray-50 focus:bg-white transition-colors"
                    style={{ minHeight }}
                    placeholder={placeholder}
                    disabled={isUploading}
                />
            ) : (
                <div
                    className="p-3 bg-white text-sm"
                    style={{ minHeight }}
                >
                    {value.trim() ? (
                        <MarkdownView content={value} />
                    ) : (
                        <div className="text-brand-text-muted italic">プレビューする内容がありません</div>
                    )}
                </div>
            )}

            <div className="bg-gray-50 border-t border-gray-300 px-3 py-2 text-xs text-gray-500">
                {isUploading ? "画像をアップロード中..." : "クリップボードから画像を貼り付けできます。Markdown記法が使えます。"}
            </div>

            <MarkdownCheatSheet
                isOpen={isCheatSheetOpen}
                onClose={() => setIsCheatSheetOpen(false)}
            />
        </div>
    );
}
