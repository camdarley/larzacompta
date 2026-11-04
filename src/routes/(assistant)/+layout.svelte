<script lang="ts">
	let { children } = $props();
</script>

<main class="assistant">
	{@render children()}
</main>

<style>
	.assistant {
		width: 100%;
		max-width: calc(var(--espace-reading-max) + 2 * var(--espace-page-mobile));
		margin: 0 auto;
		padding: var(--espace-6) var(--espace-page-mobile);
	}
</style>
