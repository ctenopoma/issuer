import { useState, useRef, useEffect } from 'react';
import MarkdownView from './MarkdownView';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const cheatSheetContent = `
### 📝 基本的な書き方

**太字**: \`**太字**\`

*斜体*: \`*斜体*\`

~~取り消し線~~: \`~~取り消し線~~\`

#### Issue IDのリンク
\`#123\`

#### リスト
\`
- アイテム 1
- アイテム 2
  - サブアイテム
\`

\`
1. 番号付きアイテム
2. 番号付きアイテム
\`

#### リンクと画像

\`
[表示テキスト](URL)
![代替テキスト](画像URL)
\`

---

### 🎨 拡張記法

#### メッセージブロック
\`\`\`markdown
:::message
ここにインフォメーションを入力
:::
\`\`\`
:::message
ここにインフォメーションを入力
:::

#### アラートブロック
\`\`\`markdown
:::message alert
ここに警告文を入力
:::
\`\`\`
:::message alert
ここに警告文を入力
:::

#### 警告ブロック
\`\`\`markdown
:::message warn
ここに注意書きを入力
:::
\`\`\`
:::message warn
ここに注意書きを入力
:::

#### アコーディオン (折りたたみ)
\`\`\`markdown
:::details クリックして詳細を表示
ここが隠れた文章です
:::
\`\`\`
:::details クリックして詳細を表示
ここが隠れた文章です
:::

#### コードブロック (ファイル名付き)
\`\`\`markdown
\`​\`​\`typescript:app.ts
function hello() {
  console.log("hello");
}
\`​\`​\`
\`\`\`
\`\`\`typescript:app.ts
function hello() {
  console.log("hello");
}
\`\`\`
`;

export default function MarkdownCheatSheet({ isOpen, onClose }: Props) {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const dialogRef = useRef<HTMLDivElement>(null);

    // Initial positioning: center of the screen
    useEffect(() => {
        if (isOpen && position.x === 0 && position.y === 0) {
            const width = Math.min(600, window.innerWidth - 40);
            const height = Math.min(500, window.innerHeight - 40);
            setPosition({
                x: Math.max(20, (window.innerWidth - width) / 2),
                y: Math.max(20, (window.innerHeight - height) / 2)
            });
        }
    }, [isOpen]);

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;

        let newX = e.clientX - dragStartRef.current.x;
        let newY = e.clientY - dragStartRef.current.y;

        // Keep within bounds roughly
        if (dialogRef.current) {
            const rect = dialogRef.current.getBoundingClientRect();
            newX = Math.max(0, Math.min(newX, window.innerWidth - rect.width));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 40));
        }

        setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    if (!isOpen) return null;

    return (
        <div
            ref={dialogRef}
            className="fixed z-50 flex flex-col bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden"
            style={{
                left: position.x,
                top: position.y,
                width: 'min(600px, calc(100vw - 40px))',
                maxHeight: 'min(70vh, 600px)',
            }}
        >
            {/* Header / Drag Handle */}
            <div
                className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center cursor-move select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="font-bold text-sm text-gray-700 flex items-center gap-2">
                    <span>💡</span> Markdown チートシート
                </div>
                <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    className="text-gray-500 hover:text-gray-800 p-1 rounded-md hover:bg-gray-200 transition-colors cursor-pointer"
                    title="閉じる"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-5 text-sm">
                <MarkdownView content={cheatSheetContent} />
            </div>

            <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 text-center">
                このウィンドウはドラッグして移動できます
            </div>
        </div>
    );
}
