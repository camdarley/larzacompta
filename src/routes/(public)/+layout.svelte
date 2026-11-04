<script lang="ts">
	let { children } = $props();
</script>

<main class="public">
	{@render children()}
</main>

<style>
	.public {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		padding: var(--espace-page-mobile);
	}
</style>
