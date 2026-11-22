import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// One plain-Markdown file with every page, in reading order, for language models.
export const prerender = true;

const DIR = join(process.cwd(), 'src/content/docs');

// Every page in sidebar order: the NN- prefixes sort the folder tree.
const pages = () =>
	readdirSync(DIR, { recursive: true, encoding: 'utf-8' })
		.filter((f) => f.endsWith('+doc.svx'))
		.sort();

// Strip the Svelte / container syntax so only Markdown is left.
function to_plain(md: string): string {
	const title = /^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?\n---\n/m.exec(md)?.[1];
	return (
		(title ? `# ${title}\n\n` : '') +
		md
			.replace(/^---\n[\s\S]*?\n---\n/, '') // frontmatter
			.replace(/<script[\s\S]*?<\/script>/g, '')
			.replace(/<style[\s\S]*?<\/style>/g, '')
			.replace(
				/<BenchChart\s*\/>/g,
				'_(interactive benchmark charts at https://neotraverse.puruvj.dev/benchmarks)_',
			)
			.replace(/^:::\s*\w+.*$/gm, '') // ::: tip / warning / code-group open
			.replace(/^:::\s*$/gm, '') // ::: close
			.replace(/\{#[\w-]+\}/g, '') // heading anchors {#id}
			.replace(/ \[[^\]\n]+\]$/gm, '') // code-group tab labels on fences
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	);
}

export function GET() {
	const parts = [
		'# neotraverse',
		'',
		'> Traverse and transform objects by visiting every node on a recursive walk: zero-dependency, hardened, ~5× faster and ~6× leaner with the functional API (up to ~10× / ~11×). Drop-in replacement for `traverse`.',
		'',
		'Docs: https://neotraverse.puruvj.dev · npm: https://www.npmjs.com/package/neotraverse',
	];
	for (const file of pages()) {
		parts.push('\n\n---\n\n' + to_plain(readFileSync(join(DIR, file), 'utf-8')));
	}
	return new Response(parts.join('\n') + '\n', {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
