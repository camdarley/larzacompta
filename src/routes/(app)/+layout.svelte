<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { TEXTES } from '#lib/messages.ts';
	import AideRaccourcis from '#lib/ui/AideRaccourcis.svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import BarreLaterale from '#lib/ui/BarreLaterale.svelte';
	import BarreMobile from '#lib/ui/BarreMobile.svelte';
	import DialogueReconnexion from '#lib/ui/DialogueReconnexion.svelte';
	import EnTeteCompact from '#lib/ui/EnTeteCompact.svelte';
	import PanneauOperation from '#lib/ui/operation/PanneauOperation.svelte';
	import Palette from '#lib/ui/Palette.svelte';
	import { urlAvec } from '#lib/ui/url.ts';
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

	let paletteOuverte = $state(false);
	let raccourcisOuverts = $state(false);

	const entreesPalette = $derived([...data.nav.groupes.flatMap((g) => g.entrees), ...data.nav.bas]);

	function dansUnChamp(cible: EventTarget | null) {
		const e = cible as HTMLElement | null;
		return e !== null && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName));
	}

	/** Le caractère produit, pas la touche physique : juste sur un clavier AZERTY (AD-20). */
	function surTouche(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			paletteOuverte = true;
			return;
		}
		// Une touche seule s'efface devant une saisie, une couche ou la préférence (WCAG 2.1.4).
		if (!data.raccourcis || e.ctrlKey || e.metaKey || e.altKey) return;
		if (dansUnChamp(e.target) || data.panneau || paletteOuverte || raccourcisOuverts) return;
		if (e.key === 'n' && data.peutSaisir) {
			goto(urlAvec({ op: 'nouvelle' }), { reset: false });
		} else if (e.key === '?') {
			e.preventDefault();
			raccourcisOuverts = true;
		}
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

<svelte:window onkeydown={surTouche} />

<a class="evitement" href="#contenu">Aller au contenu</a>

<div class="coquille">
	<BarreLaterale
		nomApe={data.nomApe}
		nav={data.nav}
		exercices={data.exercices}
		exercice={data.exercice}
		nomAcces={data.acces.nomAffiche}
		peutSaisir={data.peutSaisir}
		compteurs={data.compteurs}
		{lien}
	/>
	<div class="colonne">
		<EnTeteCompact
			nomApe={data.nomApe}
			exercices={data.exercices}
			exercice={data.exercice}
			peutSaisir={data.peutSaisir}
		/>
		<main id="contenu" tabindex="-1">
			{#if data.exercice?.statut === 'cloture'}
				<div class="bandeau-exercice">
					<Bandeau ton="fige">
						{page.url.pathname.startsWith('/pieces')
							? TEXTES.exercice_cloture_pieces
							: TEXTES.exercice_cloture_bandeau}
					</Bandeau>
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

<PanneauOperation
	donnees={data.panneau}
	exerciceRegarde={data.exercice}
	peutSaisir={data.peutSaisir}
/>
<DialogueReconnexion identifiant={data.acces.identifiant} />
<Palette
	bind:ouvert={paletteOuverte}
	entrees={entreesPalette}
	peutSaisir={data.peutSaisir}
	{lien}
	ouvrirRaccourcis={() => (raccourcisOuverts = true)}
/>
<AideRaccourcis bind:ouvert={raccourcisOuverts} />

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
