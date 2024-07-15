import { writeFile } from 'node:fs/promises';

await writeFile(
	'./dist/legacy/legacy.d.cts',
	`declare const traverse: typeof import('..')['default'];
export = traverse;
`,
);
