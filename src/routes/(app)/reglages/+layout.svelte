<script lang="ts">
	import Onglets from '#lib/ui/Onglets.svelte';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';

	let { children } = $props();

	const onglets = [
		{ libelle: 'Association', href: '/reglages' },
		{ libelle: 'Comptes', href: '/reglages/comptes' },
		{ libelle: 'Natures', href: '/reglages/natures' },
		{ libelle: 'Actions', href: '/reglages/actions' },
		{ libelle: 'Groupes', href: '/reglages/groupes' },
		{ libelle: 'Accès', href: '/reglages/acces' },
		{ libelle: 'Exercices', href: '/reglages/exercices' }
	];
</script>

<div class="reglages">
	<aside class="sections">
		<Onglets nom="Sections des Réglages" {onglets} vertical />
	</aside>
	<div class="contenu">
		<ReserveOrdinateur />
		{@render children()}
	</div>
</div>

<style>
	.reglages {
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr);
		gap: var(--espace-6);
		align-items: start;
	}

	.sections {
		position: sticky;
		top: var(--espace-page-desktop);
	}

	.contenu {
		display: grid;
		gap: var(--espace-5);
		min-width: 0;
	}

	@media (max-width: 1023.98px) {
		.reglages {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--espace-4);
		}

		.sections {
			position: static;
		}
	}
</style>
