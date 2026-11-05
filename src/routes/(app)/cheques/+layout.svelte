<script lang="ts">
	import { setContext } from 'svelte';
	import { CLE_ONGLETS, type OngletsDePage } from '#lib/ui/Onglets.svelte';

	let { children } = $props();

	const onglets = [
		{ libelle: 'Reçus', href: '/cheques' },
		{ libelle: 'Remises', href: '/cheques/remises', sousPages: true },
		{ libelle: 'Émis', href: '/cheques/emis' }
	];
	setContext<OngletsDePage>(CLE_ONGLETS, () => ({ nom: 'Chèques', onglets }));
</script>

<div class="cheques">
	{@render children()}
</div>

<style>
	.cheques {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--espace-5);
		min-width: 0;
	}
</style>
