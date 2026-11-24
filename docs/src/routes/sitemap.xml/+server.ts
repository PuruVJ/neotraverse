import { docs } from '$lib/docs.server';

export const prerender = true;
export const GET = docs.emit.sitemap();
