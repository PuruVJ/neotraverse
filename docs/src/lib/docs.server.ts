import { content, links, outline, site } from '@ogygia/content';

// Every `NN-name/+doc.svx` under src/content/docs is a page, and the folders are the sidebar:
// the `NN-` prefix orders siblings (and is dropped from the URL), and each section's `+meta.json`
// names its group. So `02-api/00-core/+doc.svx` is the first page of "API reference", at `/api/core`.
// Old VitePress addresses live on as `redirect_from` in each page's frontmatter.
const pages = content({
	loader: import.meta.og.loader.folder('../content/docs'),
});

export const docs = site({
	outline: outline([pages, { label: 'llms.txt', href: '/llms.txt' }]),
	checks: [links()],
	data: {
		title: 'neotraverse',
		description:
			'Traverse and transform objects by visiting every node on a recursive walk: zero-dependency, hardened, ~5× faster and ~6× leaner with the functional API.',
		origin: 'https://neotraverse.puruvj.dev',
	},
});
