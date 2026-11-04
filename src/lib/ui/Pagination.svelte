<script lang="ts">
	import { page as etat } from '$app/state';

	let { page, pages }: { page: number; pages: number } = $props();

	function lien(n: number) {
		const url = new URL(etat.url.href);
		if (n <= 1) url.searchParams.delete('page');
		else url.searchParams.set('page', String(n));
		return url.pathname + url.search;
	}
</script>

{#if pages > 1}
	<nav class="pagination" aria-label="Pagination">
		{#if page > 1}<a href={lien(page - 1)}>Page précédente</a>{/if}
		<span class="t-caption t-muted">Page {page} sur {pages}</span>
		{#if page < pages}<a href={lien(page + 1)}>Page suivante</a>{/if}
	</nav>
{/if}

<style>
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--espace-4);
		padding-top: var(--espace-4);
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: var(--espace-touch);
	}
</style>
