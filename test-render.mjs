import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';

// Test 1: Check if http://internal-issue/ URL is preserved in rendered output
const md1 = '[#2](http://internal-issue/2)';
const html1 = renderToString(
    React.createElement(ReactMarkdown, {
        urlTransform: (url) => url,
        components: {
            a: ({ href, children }) => {
                console.log('  [a component] href:', href);
                console.log('  [a component] includes internal-issue:', href?.includes('internal-issue/'));
                return React.createElement('a', { href }, children);
            }
        }
    }, md1)
);
console.log('Test 1: [#2](http://internal-issue/2)');
console.log('  HTML:', html1);
console.log('');

// Test 2: Without urlTransform (default behavior)
const html2 = renderToString(
    React.createElement(ReactMarkdown, {
        components: {
            a: ({ href, children }) => {
                console.log('  [a component] href:', href);
                return React.createElement('a', { href }, children);
            }
        }
    }, md1)
);
console.log('Test 2: Default urlTransform');
console.log('  HTML:', html2);
console.log('');

// Test 3: Full content like mock data
const md3 = '現在のログイン画面のデザインを刷新します。\n\n- カラーパレットの統一\n\n関連 Issue は [#2](http://internal-issue/2) を参照';
const html3 = renderToString(
    React.createElement(ReactMarkdown, {
        urlTransform: (url) => url,
        components: {
            a: ({ href, children }) => {
                console.log('  [a component] href:', href);
                return React.createElement('a', { href }, children);
            }
        }
    }, md3)
);
console.log('Test 3: Full content');
console.log('  HTML:', html3);
console.log('');

// Test 4: Check what happens with file:// URLs (should be stripped by default)
const md4 = '[path](file:///C:/test/file.txt)';
const html4a = renderToString(
    React.createElement(ReactMarkdown, {
        components: {
            a: ({ href, children }) => {
                console.log('  [a component default] href:', href);
                return React.createElement('a', { href }, children);
            }
        }
    }, md4)
);
console.log('Test 4a: file:// with default urlTransform');
console.log('  HTML:', html4a);

const html4b = renderToString(
    React.createElement(ReactMarkdown, {
        urlTransform: (url) => url,
        components: {
            a: ({ href, children }) => {
                console.log('  [a component custom] href:', href);
                return React.createElement('a', { href }, children);
            }
        }
    }, md4)
);
console.log('Test 4b: file:// with custom urlTransform');
console.log('  HTML:', html4b);
