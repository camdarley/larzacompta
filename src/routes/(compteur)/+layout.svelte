<script lang="ts">
	import DialogueReconnexion from '#lib/ui/DialogueReconnexion.svelte';

	let { data, children } = $props();

	$effect(() => {
		document.documentElement.dataset.theme = data.theme;
	});
</script>

<main id="contenu" tabindex="-1">
	{@render children()}
</main>
<DialogueReconnexion identifiant={data.acces.identifiant} />

<style>
	main {
		outline: none;
	}
</style>
