import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { convertFileSrc } from '@tauri-apps/api/core';
import { api } from '../lib/api';

interface Props {
    content: string;
    onNavigateToIssue?: (issueId: number) => void;
}

/**
 * Linkify: convert file paths and #123 issue references to clickable links.
 * Returns a new string with markdown links injected.
 */
function linkify(text: string): string {
    if (!text) return text;

    // Protect existing markdown links from double-processing
    const mdLinkRe = /!?\[[^\]]*\]\([^)]*\)/g;
    const protectedSpans: [number, number][] = [];
    let match;
    while ((match = mdLinkRe.exec(text)) !== null) {
        protectedSpans.push([match.index, match.index + match[0].length]);
    }
    const inProtected = (start: number, end: number) =>
        protectedSpans.some(([ps, pe]) => start >= ps && end <= pe);

    // Drive paths: C:\folder\file.txt
    const drivePathRe = /(?<!\()(?<!\]\()([A-Za-z]:\\(?:[^\s　*?"<>|]+))/g;
    // UNC paths: \\server\share\folder
    const uncPathRe = /(?<!\()(?<!\]\()(\\\\[^\s　*?"<>|\\]+(?:\\[^\s　*?"<>|]+)+)/g;
    // Issue references: #123
    const issueRe = /(?<!\w)#(\d+)/g;

    type MatchItem = { start: number; end: number; replacement: string };
    const allMatches: MatchItem[] = [];

    // Collect drive path matches
    while ((match = drivePathRe.exec(text)) !== null) {
        const path = match[0].replace(/[.,;:)、。）」』"]+$/, '');
        if (inProtected(match.index, match.index + path.length)) continue;
        const url = 'file:///' + path.replace(/\\/g, '/');
        allMatches.push({
            start: match.index,
            end: match.index + path.length,
            replacement: `[${path}](${encodeURI(url)})`,
        });
    }

    // Collect UNC path matches
    while ((match = uncPathRe.exec(text)) !== null) {
        const path = match[0].replace(/[.,;:)、。）」』"]+$/, '');
        if (inProtected(match.index, match.index + path.length)) continue;
        const url = 'file:' + path.replace(/\\/g, '/');
        allMatches.push({
            start: match.index,
            end: match.index + path.length,
            replacement: `[${path}](${encodeURI(url)})`,
        });
    }

    // Collect issue reference matches
    while ((match = issueRe.exec(text)) !== null) {
        if (inProtected(match.index, match.index + match[0].length)) continue;
        const issueId = match[1];
        allMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            replacement: `[#${issueId}](issue://${issueId})`,
        });
    }

    // Sort by position and build result
    allMatches.sort((a, b) => a.start - b.start);

    let result = '';
    let last = 0;
    for (const m of allMatches) {
        if (m.start < last) continue; // skip overlapping
        result += text.substring(last, m.start) + m.replacement;
        last = m.end;
    }
    result += text.substring(last);
    return result;
}

// Cache the assets directory path
let cachedAssetsDir: string | null = null;

/**
 * Convert all image paths in markdown to asset protocol URLs
 * before the markdown parser can mangle backslashes as escape sequences.
 * Handles:
 *   ![alt](C:\path\to\file.png)      — absolute Windows backslash
 *   ![alt](C:/path/to/file.png)      — absolute Windows forward slash
 *   ![alt](assets/file.png)          — legacy relative path
 *   ![alt](https://asset.localhost/…) — already converted (skip)
 */
function resolveImageUrls(text: string, assetsDir: string | null): string {
    if (!text) return text;
    return text.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        (match, alt, rawPath) => {
            const path = rawPath.replace(/\\/g, '/');
            if (path.match(/^https?:\/\//) || path.startsWith('data:')) {
                return match; // already a URL, skip
            }
            if (path.match(/^[A-Za-z]:\//)) {
                // Absolute Windows path
                return `![${alt}](${convertFileSrc(path)})`;
            }
            if (path.startsWith('assets/') && assetsDir) {
                // Legacy relative path
                const filename = path.replace('assets/', '');
                return `![${alt}](${convertFileSrc(assetsDir + '/' + filename)})`;
            }
            return match;
        }
    );
}

export default function MarkdownView({ content, onNavigateToIssue }: Props) {
    const [assetsDir, setAssetsDir] = useState<string | null>(cachedAssetsDir);
    const processedContent = linkify(resolveImageUrls(content || '', assetsDir));

    useEffect(() => {
        if (!cachedAssetsDir) {
            api.getAssetsDir().then(dir => {
                cachedAssetsDir = dir;
                setAssetsDir(dir);
            }).catch(() => {});
        }
    }, []);

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                a({ href, children, ...props }) {
                    // Handle issue:// links
                    if (href && href.startsWith('issue://')) {
                        const issueId = parseInt(href.replace('issue://', ''), 10);
                        return (
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (onNavigateToIssue && !isNaN(issueId)) {
                                        onNavigateToIssue(issueId);
                                    }
                                }}
                                className="text-brand-primary hover:underline font-medium cursor-pointer"
                                {...props}
                            >
                                {children}
                            </a>
                        );
                    }
                    // Handle file:// links
                    if (href && href.startsWith('file:')) {
                        return (
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-primary hover:underline"
                                {...props}
                            >
                                {children}
                            </a>
                        );
                    }
                    // Regular links
                    return (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-primary hover:underline"
                            {...props}
                        >
                            {children}
                        </a>
                    );
                },
                img({ src, alt }) {
                    return (
                        <img
                            src={src || ''}
                            alt={alt || ''}
                            className="max-w-full rounded-md border border-brand-border my-2"
                            loading="lazy"
                        />
                    );
                },
                // Style markdown elements
                p({ children }) {
                    return <p className="mb-2 leading-relaxed">{children}</p>;
                },
                ul({ children }) {
                    return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
                },
                ol({ children }) {
                    return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
                },
                h1({ children }) {
                    return <h1 className="text-xl font-bold mt-3 mb-2 pb-1 border-b border-brand-border">{children}</h1>;
                },
                h2({ children }) {
                    return <h2 className="text-lg font-bold mt-3 mb-2 pb-1 border-b border-brand-border">{children}</h2>;
                },
                h3({ children }) {
                    return <h3 className="text-base font-bold mt-2 mb-1">{children}</h3>;
                },
                code({ children, className }) {
                    const isInline = !className;
                    if (isInline) {
                        return (
                            <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-[13px] font-mono">
                                {children}
                            </code>
                        );
                    }
                    return (
                        <code className={className}>
                            {children}
                        </code>
                    );
                },
                pre({ children }) {
                    return (
                        <pre className="bg-gray-50 border border-brand-border rounded-md p-4 overflow-x-auto text-[13px] font-mono my-2">
                            {children}
                        </pre>
                    );
                },
                blockquote({ children }) {
                    return (
                        <blockquote className="border-l-4 border-brand-primary pl-4 my-2 text-brand-text-muted italic">
                            {children}
                        </blockquote>
                    );
                },
                table({ children }) {
                    return (
                        <div className="overflow-x-auto my-2">
                            <table className="border-collapse border border-brand-border w-full text-sm">
                                {children}
                            </table>
                        </div>
                    );
                },
                th({ children }) {
                    return <th className="border border-brand-border bg-gray-50 px-3 py-2 text-left font-bold">{children}</th>;
                },
                td({ children }) {
                    return <td className="border border-brand-border px-3 py-2">{children}</td>;
                },
                hr() {
                    return <hr className="my-4 border-brand-border" />;
                },
            }}
        >
            {processedContent}
        </ReactMarkdown>
    );
}
