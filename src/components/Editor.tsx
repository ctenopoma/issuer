import { useState, useRef } from 'react';
import { api } from '../lib/api';
import MarkdownView from './MarkdownView';

interface Props {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    minHeight?: string;
}

export default function Editor({ value, onChange, placeholder = "Leave a comment", minHeight = "150px" }: Props) {
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
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
            <div className="bg-gray-50 border-b border-gray-300 px-3 py-2 text-sm flex gap-2">
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
        </div>
    );
}
