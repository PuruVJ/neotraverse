<script lang="ts">
	import { page } from '$app/state';
	import { Doc } from '@ogygia/content';
	import * as docs from '$lib/docs.remote';
	import NpmDownloads from '$lib/components/NpmDownloads.svelte';

	let { data } = $props();

	const view = $derived((await docs.page(page.params.slug ?? ''))!);
	const edit = $derived(
		`https://github.com/PuruVJ/neotraverse/edit/main/docs/src/content/docs/${data.file}`,
	);
</script>

<Doc {view}>
	{#snippet footer()}
		<div class="nt-doc-footer">
			<a class="nt-edit" href={edit} target="_blank" rel="noreferrer">Edit this page on GitHub</a>
			<NpmDownloads variant="footer" />
		</div>
	{/snippet}
</Doc>
