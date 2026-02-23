import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ThemeConfig, ThemeMetadata } from '../types';
import { DEFAULT_THEME, applyTheme } from '../lib/theme';

interface Props {
    currentThemeId: string;
    onThemeChanged: (theme: ThemeConfig) => void;
}

export default function ThemeSelector({ currentThemeId, onThemeChanged }: Props) {
    const [installedThemes, setInstalledThemes] = useState<ThemeConfig[]>([]);
    const [remoteThemes, setRemoteThemes] = useState<ThemeMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadThemes();
    }, []);

    const loadThemes = async () => {
        setLoading(true);
        setError(null);
        try {
            const installed = await api.getInstalledThemes();
            setInstalledThemes(installed);

            try {
                const remote = await api.listRemoteThemes();
                // リモートのうち未インストールのもののみ表示
                const installedIds = new Set(installed.map(t => t.id));
                setRemoteThemes(remote.filter(r => !installedIds.has(r.id)));
            } catch {
                // オフラインでもインストール済みテーマは使える
            }
        } catch (e) {
            setError('テーマの読み込みに失敗しました');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectTheme = async (theme: ThemeConfig) => {
        try {
            const themeId = theme.id === 'default' ? null : theme.id;
            await api.setActiveTheme(themeId);

            // CSS読み込み関数
            const loadCss = theme.customCss
                ? () => api.readThemeFile(theme.id, 'style.css').catch(() => null)
                : undefined;

            await applyTheme(theme, loadCss);
            onThemeChanged(theme);
        } catch (e) {
            console.error('Failed to apply theme:', e);
            setError('テーマの適用に失敗しました');
        }
    };

    const handleDownload = async (meta: ThemeMetadata) => {
        setDownloading(meta.id);
        setError(null);
        try {
            const config = await api.downloadTheme(meta.id);
            setInstalledThemes(prev => [...prev, config]);
            setRemoteThemes(prev => prev.filter(r => r.id !== meta.id));
            // ダウンロード後に自動適用
            await handleSelectTheme(config);
        } catch (e) {
            console.error('Failed to download theme:', e);
            setError(`テーマ「${meta.name}」のダウンロードに失敗しました`);
        } finally {
            setDownloading(null);
        }
    };

    const handleDelete = async (themeId: string) => {
        try {
            await api.deleteTheme(themeId);
            setInstalledThemes(prev => prev.filter(t => t.id !== themeId));

            // 削除したのがアクティブテーマだったらデフォルトに戻す
            if (currentThemeId === themeId) {
                await handleSelectTheme(DEFAULT_THEME);
            }

            // リモート一覧を再取得
            loadThemes();
        } catch (e) {
            console.error('Failed to delete theme:', e);
            setError('テーマの削除に失敗しました');
        }
    };

    // デフォルト + インストール済みをまとめた一覧
    const allThemes: ThemeConfig[] = [DEFAULT_THEME, ...installedThemes];

    return (
        <div className="space-y-6">
            <h3 className="text-base font-bold text-brand-text-main">テーマ</h3>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                    {error}
                </div>
            )}

            {/* インストール済みテーマ */}
            <div>
                <h4 className="text-sm font-semibold text-brand-text-muted mb-3">インストール済み</h4>
                <div className="grid grid-cols-2 gap-3">
                    {allThemes.map(theme => (
                        <ThemeCard
                            key={theme.id}
                            name={theme.name}
                            description={theme.description}
                            colors={theme.colors}
                            isActive={currentThemeId === theme.id}
                            onSelect={() => handleSelectTheme(theme)}
                            onDelete={theme.id !== 'default' ? () => handleDelete(theme.id) : undefined}
                        />
                    ))}
                </div>
            </div>

            {/* リモートテーマ */}
            {remoteThemes.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-brand-text-muted mb-3">ダウンロード可能</h4>
                    <div className="grid grid-cols-2 gap-3">
                        {remoteThemes.map(meta => (
                            <div
                                key={meta.id}
                                className="border border-brand-border rounded-lg p-4 bg-brand-card"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold text-brand-text-main">{meta.name}</span>
                                </div>
                                {meta.description && (
                                    <p className="text-xs text-brand-text-muted mb-3">{meta.description}</p>
                                )}
                                <button
                                    onClick={() => handleDownload(meta)}
                                    disabled={downloading === meta.id}
                                    className="w-full text-xs px-3 py-1.5 rounded-md bg-brand-primary text-white hover:opacity-90 transition disabled:opacity-50"
                                >
                                    {downloading === meta.id ? 'ダウンロード中...' : 'ダウンロード'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading && (
                <p className="text-sm text-brand-text-muted text-center py-4">読み込み中...</p>
            )}
        </div>
    );
}

/** テーマカードコンポーネント */
function ThemeCard({
    name,
    description,
    colors,
    isActive,
    onSelect,
    onDelete,
}: {
    name: string;
    description?: string;
    colors: Record<string, string>;
    isActive: boolean;
    onSelect: () => void;
    onDelete?: () => void;
}) {
    return (
        <div
            onClick={onSelect}
            className={`relative border-2 rounded-lg p-4 cursor-pointer transition ${
                isActive
                    ? 'border-brand-primary shadow-md'
                    : 'border-brand-border hover:border-brand-primary/50'
            }`}
        >
            {/* アクティブバッジ */}
            {isActive && (
                <span className="absolute top-2 right-2 text-xs bg-brand-primary text-white px-2 py-0.5 rounded-full">
                    使用中
                </span>
            )}

            {/* カラープレビュー */}
            <div className="flex gap-1 mb-3">
                {['brand-bg', 'brand-card', 'brand-primary', 'brand-open', 'brand-closed', 'brand-danger'].map(key => (
                    <div
                        key={key}
                        className="w-5 h-5 rounded-full border border-gray-200"
                        style={{ backgroundColor: colors[key] || '#ccc' }}
                        title={key}
                    />
                ))}
            </div>

            <p className="text-sm font-semibold text-brand-text-main">{name}</p>
            {description && (
                <p className="text-xs text-brand-text-muted mt-1">{description}</p>
            )}

            {/* 削除ボタン */}
            {onDelete && !isActive && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="absolute bottom-2 right-2 text-xs text-brand-danger hover:underline"
                >
                    削除
                </button>
            )}
        </div>
    );
}
