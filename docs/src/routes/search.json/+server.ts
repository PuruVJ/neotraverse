import { docs } from '$lib/docs.server';

// The prerendered index the ⌘K palette's worker queries on the device.
export const prerender = true;
export const GET = docs.emit.search();
