<script lang="ts">
	import { navigating, page } from '$app/state';
	import { TEXTES } from '#lib/messages.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import BarreLaterale from '#lib/ui/BarreLaterale.svelte';
	import BarreMobile from '#lib/ui/BarreMobile.svelte';
	import EnTeteCompact from '#lib/ui/EnTeteCompact.svelte';
	import Squelette from '#lib/ui/Squelette.svelte';

	let { data, children } = $props();

	// Après une connexion sans rechargement, le thème de la personne s'applique ici.
	$effect(() => {
		document.documentElement.dataset.theme = data.theme;
	});

	/** L'Exercice choisi suit la navigation. */
	function lien(href: string) {
		const choisi = page.url.searchParams.get('exercice');
		return choisi ? `${href}?exercice=${encodeURIComponent(choisi)}` : href;
	}

	// `squelette` après 300 ms seulement, et pour un changement d'écran.
	let attente = $state(false);
	$effect(() => {
		const changement =
			navigating.to !== null && navigating.to.url.pathname !== navigating.from?.url.pathname;
		if (!changement) {
			attente = false;
			return;
		}
		const minuterie = setTimeout(() => (attente = true), 300);
		return () => clearTimeout(minuterie);
	});
</script>

<a class="evitement" href="#contenu">Aller au contenu</a>

<div class="coquille">
	<BarreLaterale
		nomApe={data.nomApe}
		nav={data.nav}
		exercices={data.exercices}
		exercice={data.exercice}
		nomAcces={data.acces.nomAffiche}
		{lien}
	/>
	<div class="colonne">
		<EnTeteCompact nomApe={data.nomApe} exercices={data.exercices} exercice={data.exercice} />
		<main id="contenu" tabindex="-1">
			{#if data.exercice?.statut === 'cloture'}
				<div class="bandeau-exercice">
					<Bandeau ton="fige">{TEXTES.exercice_cloture_bandeau}</Bandeau>
				</div>
			{/if}
			{#if attente}
				<Squelette />
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>
	<BarreMobile entrees={data.entreesMobile} {lien} />
</div>

<style>
	.evitement {
		position: absolute;
		z-index: 70;
		top: var(--espace-2);
		left: var(--espace-2);
		padding: var(--espace-2) var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--primary);
		color: var(--on-primary);
		transform: translateY(-200%);
	}

	.evitement:focus {
		transform: none;
		color: var(--on-primary);
	}

	.coquille {
		display: grid;
		grid-template-columns: var(--espace-sidebar) minmax(0, 1fr);
		min-height: 100dvh;
	}

	.colonne {
		min-width: 0;
	}

	main {
		width: 100%;
		max-width: calc(var(--espace-content-max) + 2 * var(--espace-page-desktop));
		margin: 0 auto;
		padding: var(--espace-page-desktop);
		outline: none;
	}

	.bandeau-exercice {
		margin-bottom: var(--espace-5);
	}

	@media (max-width: 1023.98px) {
		.coquille {
			grid-template-columns: var(--espace-rail) minmax(0, 1fr);
		}

		main {
			padding: var(--espace-page-tablet);
		}
	}

	@media (max-width: 639.98px) {
		.coquille {
			grid-template-columns: minmax(0, 1fr);
		}

		main {
			padding: var(--espace-page-mobile);
			padding-bottom: calc(var(--espace-8) + var(--espace-5) + env(safe-area-inset-bottom));
		}
	}
</style>
