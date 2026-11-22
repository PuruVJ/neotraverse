import { docs } from '$lib/docs.server';

// The no-JS results page reads `?q=` at request time.
export const prerender = false;

export const load = async ({ url }: { url: URL }) => {
	const q = url.searchParams.get('q') ?? '';
	const hits = q ? await docs.search(q) : [];
	return { q, hits };
};
