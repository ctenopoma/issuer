import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';

const markdown = `
:::message{.alert}
This is an alert
:::

:::details[Title here]
This is details
:::
`;

const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .parse(markdown);

console.log(JSON.stringify(file, null, 2));
