import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import { convertFileSrc } from '@tauri-apps/api/core';
import { api } from '../lib/api';

/**
 * Remark plugin to map standard directives to custom HTML elements or attributes
 */
function remarkDirectiveRehype() {
    return (tree: any) => {
        visit(tree, (node) => {
            if (node.type === 'containerDirective') {
                if (node.name === 'message') {
                    const data = node.data || (node.data = {});
                    const type = node.attributes?.class || 'info';
                    data.hName = 'div';
                    data.hProperties = { className: `zenn-message ${type}` };
                } else if (node.name === 'details') {
                    const data = node.data || (node.data = {});
                    data.hName = 'details';
                    data.hProperties = {
                        className: 'zenn-details bg-white border border-brand-border rounded-md my-3 shadow-sm'
                    };
                }
            }

            // Map directiveLabel inside containerDirective to summary
            if (node.type === 'paragraph' && node.data?.directiveLabel) {
                node.data.hName = 'summary';
                node.data.hProperties = {
                    className: 'font-bold cursor-pointer px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center gap-2 select-none border-b border-transparent'
                };
            }
        });
    };
}

/**
 * Preprocess markdown to convert Zenn syntax to standard remark-directive syntax
 */
function preprocessZennMarkdown(text: string): string {
    if (!text) return text;

    // :::message alert -> :::message{.alert}
    // :::message -> :::message
    let result = text.replace(/^:::message(\s+([a-zA-Z0-9_-]+))?$/gm, (_match, _p1, p2) => {
        if (p2) {
            return `:::message{.${p2}}`;
        }
        return `:::message`;
    });

    // :::details Title here -> :::details[Title here]
    // :::details -> :::details
    result = result.replace(/^:::details(\s+(.+))?$/gm, (_match, _p1, p2) => {
        if (p2) {
            return `:::details[${p2}]`;
        }
        return `:::details`;
    });

    return result;
}

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
        // Hack to bypass ReactMarkdown sanitization
        allMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            replacement: `[#${issueId}](http://internal-issue/${issueId})`,
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
    const processedContent = linkify(resolveImageUrls(preprocessZennMarkdown(content || ''), assetsDir));

    useEffect(() => {
        if (!cachedAssetsDir) {
            api.getAssetsDir().then(dir => {
                cachedAssetsDir = dir;
                setAssetsDir(dir);
            }).catch(() => { });
        }
    }, []);

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkDirective, remarkDirectiveRehype]}
            urlTransform={(url) => url}
            components={{
                a({ href, children, ...props }) {
                    // Handle issue:// links (mapped from http://internal-issue/ bypassed renderer)
                    if (href && (href.includes('issue://') || href.includes('internal-issue/'))) {
                        const match = href.match(/(?:issue:\/\/|internal-issue\/)(\d+)/);
                        const issueId = match ? parseInt(match[1], 10) : NaN;
                        return (
                            <a
                                {...props}
                                href={`#issue-${issueId}`}
                                title={`Issue #${issueId} を開く`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (onNavigateToIssue && !isNaN(issueId)) {
                                        onNavigateToIssue(issueId);
                                    } else {
                                        // Inform user if this link is unclickable in the current context
                                        console.warn(`Issue #${issueId} clicked, but navigation is not supported in this view.`);
                                    }
                                }}
                                className="text-brand-primary hover:underline font-medium cursor-pointer flex items-center gap-0.5 inline-flex whitespace-nowrap"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block opacity-70"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
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
                div({ className, children, ...props }) {
                    if (className?.includes('zenn-message')) {
                        const type = className.split(' ').find(c => ['info', 'alert', 'warn'].includes(c)) || 'info';
                        let bgClass = "bg-blue-50 text-blue-900 border-blue-500";
                        let icon = "💡";

                        if (type === 'alert') {
                            bgClass = "bg-red-50 text-red-900 border-red-500";
                            icon = "⚠️";
                        } else if (type === 'warn') {
                            bgClass = "bg-yellow-50 text-yellow-900 border-yellow-500";
                            icon = "🚧";
                        }

                        // Check if children contain any content (for removing empty margins)
                        return (
                            <div className={`my-4 p-4 rounded-md border-l-4 bg-opacity-70 ${bgClass}`}>
                                <div className="flex gap-3">
                                    <div className="text-xl flex-shrink-0 leading-5">{icon}</div>
                                    <div className="flex-1 w-0 space-y-2 text-sm leading-relaxed zenn-message-content">
                                        {children}
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    return <div className={className} {...props}>{children}</div>;
                },
                details({ className, children, ...props }) {
                    return (
                        <details className={className} {...props}>
                            {children}
                            {/* If there is no summary, add a default one for empty :::details */}
                            {!Array.isArray(children) || !children.some((c: any) => c?.props?.className?.includes('cursor-pointer')) ? (
                                <summary className="font-bold cursor-pointer px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center gap-2 border-b border-transparent">
                                    詳細
                                </summary>
                            ) : null}
                        </details>
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
                            <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-[13px] font-mono whitespace-pre-wrap word-break-all">
                                {children}
                            </code>
                        );
                    }

                    let cleanClass = className;
                    const match = /language-([^:]+):(.+)/.exec(className || '');
                    if (match) {
                        cleanClass = `language-${match[1]}`;
                    }

                    return (
                        <code className={cleanClass}>
                            {children}
                        </code>
                    );
                },
                pre({ children, node }) {
                    const codeNode = (node as any)?.children?.[0];
                    let className = '';
                    if (codeNode && codeNode.type === 'element' && codeNode.tagName === 'code') {
                        className = (codeNode.properties?.className || []).join(' ');
                    }

                    const match = /language-([^:]+):(.+)/.exec(className);
                    let filename = '';
                    if (match) {
                        filename = match[2];
                    }

                    if (filename) {
                        return (
                            <div className="my-3 rounded-md border border-brand-border overflow-hidden shadow-sm">
                                <div className="bg-gray-200 px-4 py-2 text-[12px] font-mono text-gray-700 font-bold border-b border-brand-border select-none">
                                    {filename}
                                </div>
                                <pre className="bg-[#f8f9fa] p-4 overflow-x-auto text-[13px] font-mono m-0 border-0 rounded-none">
                                    {children}
                                </pre>
                            </div>
                        );
                    }

                    return (
                        <pre className="bg-[#f8f9fa] border border-brand-border rounded-md p-4 overflow-x-auto text-[13px] font-mono my-3 shadow-sm">
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
        </ReactMarkdown >
    );
}
