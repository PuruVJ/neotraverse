import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { preprocess, extensions } from '@ogygia/content/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: extensions(),
	preprocess: [vitePreprocess(), ...preprocess()],
	compilerOptions: {
		// the site layer's components use top-level `await`
		experimental: { async: true },
	},
	kit: {
		adapter: adapter(),
		experimental: { remoteFunctions: true },
	},
};

export default config;
