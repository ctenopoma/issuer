import { ThemeConfig, ThemeColors } from '../types';

// デフォルトテーマ（現在のApp.cssの値と同一）
export const DEFAULT_THEME: ThemeConfig = {
    id: 'default',
    name: 'Default',
    description: '標準テーマ',
    colors: {
        'brand-bg': '#F0F2F5',
        'brand-card': '#FFFFFF',
        'brand-border': '#D0D7DE',
        'brand-text-main': '#1F2328',
        'brand-text-muted': '#656D76',
        'brand-primary': '#0969DA',
        'brand-open': '#2da44e',
        'brand-closed': '#8250df',
        'brand-danger': '#CF222E',
    },
    dashboard: {
        layout: 'single-col',
        widgets: [
            { type: 'issue-list', position: { col: 1, row: 1, colSpan: 1 }, config: {} },
        ],
    },
};

/** テーマの色をCSS変数として :root に注入 */
export function applyThemeColors(colors: ThemeColors) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(colors)) {
        root.style.setProperty(`--color-${key}`, value);
    }
}

/** テーマのカスタムCSSを <style> タグとして注入 */
export function applyThemeCSS(cssText: string) {
    let el = document.getElementById('theme-custom-css');
    if (!el) {
        el = document.createElement('style');
        el.id = 'theme-custom-css';
        document.head.appendChild(el);
    }
    el.textContent = cssText;
}

/** テーマのWebフォントを読み込む */
export function loadThemeFont(fontConfig: { family: string; importUrl?: string }) {
    // フォントファミリーを適用
    document.documentElement.style.setProperty('font-family', fontConfig.family);

    // importUrl があれば <link> タグで読み込む
    if (fontConfig.importUrl) {
        let el = document.getElementById('theme-font') as HTMLLinkElement | null;
        if (!el) {
            el = document.createElement('link');
            el.id = 'theme-font';
            el.rel = 'stylesheet';
            document.head.appendChild(el);
        }
        el.href = fontConfig.importUrl;
    }
}

/** デフォルトテーマにリセット */
export function resetToDefaultTheme() {
    // CSS変数をすべて除去（@theme のデフォルト値に戻る）
    document.documentElement.removeAttribute('style');
    document.getElementById('theme-custom-css')?.remove();
    document.getElementById('theme-font')?.remove();
}

/** テーマを適用（色 + フォント + カスタムCSS） */
export async function applyTheme(
    theme: ThemeConfig,
    loadCss?: () => Promise<string | null>,
) {
    if (theme.id === 'default') {
        resetToDefaultTheme();
        return;
    }

    applyThemeColors(theme.colors);

    if (theme.font) {
        loadThemeFont(theme.font);
    }

    if (theme.customCss && loadCss) {
        const css = await loadCss();
        if (css) {
            applyThemeCSS(css);
        }
    }
}
