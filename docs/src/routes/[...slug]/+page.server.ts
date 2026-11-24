import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { docs } from '$lib/docs.server';

// Every page, plus each `redirect_from` address (those bake as 308 stubs).
export const entries = docs.entries;

// Page address → its source file, for the edit link: `api/core` → `02-api/00-core/+doc.svx`.
const files = new Map(
	readdirSync(join(process.cwd(), 'src/content/docs'), { recursive: true, encoding: 'utf-8' })
		.filter((f) => f.endsWith('+doc.svx'))
		.map((f) => [
			f
				.split('/')
				.slice(0, -1)
				.map((s) => s.replace(/^\d+-/, ''))
				.join('/'),
			f,
		]),
);

// docs.load is the 404 guard and serves the redirects.
export const load = async (event: Parameters<typeof docs.load>[0]) => {
	await docs.load(event);
	return { file: files.get(event.params.slug ?? '') ?? '' };
};
