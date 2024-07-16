import { createBundle } from 'dts-buddy';
import { readFile, writeFile } from 'fs/promises';

await createBundle({
	project: './tsconfig.json',
	output: './dist/index.d.ts',
	modules: {
		neotraverse: './src/index.ts',
		'neotraverse/modern': './src/modern.ts',
		'neotraverse/legacy': './src/legacy.cts',
	},
});

let file_content = await readFile('./dist/index.d.ts', 'utf8');

file_content = file_content.replace(
	/(?<=declare module 'neotraverse\/legacy')[\s\S]*/,
	`{ export * from 'neotraverse';} `,
);

await writeFile('./dist/index.d.ts', file_content);
