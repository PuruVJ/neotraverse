<script lang="ts">
	import { SearchPage } from '@ogygia/content';

	let { data } = $props();
</script>

<SearchPage q={data.q} hits={data.hits} title="Search the docs" />
