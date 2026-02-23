import React from 'react';
import ReactMarkdown from 'react-markdown';
import { renderToString } from 'react-dom/server';

const markdown = `[#123](http://internal-issue/123)`;

// Let's see how react-markdown parses it and what props it passes to the 'a' component
const html = renderToString(
    <ReactMarkdown
        components={{
            a(props) {
                console.log("Props passed to a:", JSON.stringify(props, null, 2));
                return <a href={props.href}>{props.children}</a>;
            }
        }}
    >
        {markdown}
    </ReactMarkdown>
);

console.log("Rendered HTML:", html);
