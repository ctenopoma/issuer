// Test linkify function (copied from MarkdownView.tsx)
function linkify(text) {
    if (!text) return text;
    const mdLinkRe = /!?\[[^\]]*\]\([^)]*\)/g;
    const protectedSpans = [];
    let match;
    while ((match = mdLinkRe.exec(text)) !== null) {
        protectedSpans.push([match.index, match.index + match[0].length]);
    }
    const inProtected = (start, end) =>
        protectedSpans.some(([ps, pe]) => start >= ps && end <= pe);

    const drivePathRe = /(?<!\()(?<!\]\()([A-Za-z]:\\(?:[^\s\u3000*?"<>|]+))/g;
    const uncPathRe = /(?<!\()(?<!\]\()(\\\\[^\s\u3000*?"<>|\\]+(?:\\[^\s\u3000*?"<>|]+)+)/g;
    const issueRe = /(?<!\w)#(\d+)/g;

    const allMatches = [];

    while ((match = drivePathRe.exec(text)) !== null) {
        const path = match[0].replace(/[.,;:)\u3001\u3002\uFF09\u300D\u300F"]+$/, '');
        if (inProtected(match.index, match.index + path.length)) continue;
        const url = 'file:///' + path.replace(/\\/g, '/');
        allMatches.push({ start: match.index, end: match.index + path.length, replacement: `[${path}](${encodeURI(url)})` });
    }
    while ((match = uncPathRe.exec(text)) !== null) {
        const path = match[0].replace(/[.,;:)\u3001\u3002\uFF09\u300D\u300F"]+$/, '');
        if (inProtected(match.index, match.index + path.length)) continue;
        const url = 'file:' + path.replace(/\\/g, '/');
        allMatches.push({ start: match.index, end: match.index + path.length, replacement: `[${path}](${encodeURI(url)})` });
    }
    while ((match = issueRe.exec(text)) !== null) {
        if (inProtected(match.index, match.index + match[0].length)) continue;
        const issueId = match[1];
        allMatches.push({ start: match.index, end: match.index + match[0].length, replacement: `[#${issueId}](http://internal-issue/${issueId})` });
    }

    allMatches.sort((a, b) => a.start - b.start);
    let result = '';
    let last = 0;
    for (const m of allMatches) {
        if (m.start < last) continue;
        result += text.substring(last, m.start) + m.replacement;
        last = m.end;
    }
    result += text.substring(last);
    return result;
}

// Test cases
const tests = [
    '関連 Issue は #2 を参照',
    '#1 を確認してください',
    'See #2 and #3',
    '## Heading with #2',
    'issue#2 should not match',
    '既存リンク [#2](http://internal-issue/2) は保護される',
    '現在のログイン画面のデザインを刷新します。\n\n- カラーパレットの統一\n- モバイル対応\n- アクセシビリティ改善\n\nファイルパス: C:\\Users\\test\\project\\design.psd\n関連 Issue は #2 を参照',
];

tests.forEach((t, i) => {
    console.log(`--- Test ${i + 1} ---`);
    console.log('Input:  ', JSON.stringify(t));
    console.log('Output: ', JSON.stringify(linkify(t)));
    console.log('');
});
