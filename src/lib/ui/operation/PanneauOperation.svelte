<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { SommeASolder } from '#lib/domaine/creances/index.ts';
	import type { Exercice } from '#lib/domaine/exercices.ts';
	import type { ModePaiement } from '#lib/domaine/journal.ts';
	import type { ContexteSaisie, DetailOperation } from '#lib/domaine/operations/vues.ts';
	import type { LigneASaisir } from '#lib/domaine/releve/vues.ts';
	import { urlAvec } from '#lib/ui/url.ts';
	import FormulaireOperation from './FormulaireOperation.svelte';

	export type DonneesPanneau = {
		contexte: ContexteSaisie;
		detail: DetailOperation | null;
		modele: DetailOperation | null;
		ligne: LigneASaisir | null;
		/** Somme à solder : la saisie part d'elle, rien à ressaisir. */
		solder: SommeASolder | null;
		/** Sommes qu'une même Opération peut solder aussi. */
		sommes: SommeASolder[];
		introuvable: boolean;
	};

	type Props = {
		donnees: DonneesPanneau | null;
		exerciceRegarde: Exercice | null;
		peutSaisir: boolean;
	};

	let { donnees, exerciceRegarde, peutSaisir }: Props = $props();

	const q = $derived(page.url.searchParams);
	const cle = $derived(
		['op', 'depuis', 'rendre', 'releve', 'solder', 'compte', 'de', 'vers']
			.map((n) => q.get(n))
			.join('|')
	);

	function fermer() {
		goto(
			urlAvec({
				op: null,
				depuis: null,
				rendre: null,
				intention: null,
				releve: null,
				solder: null,
				compte: null,
				mode: null,
				de: null,
				vers: null
			}),
			{ reset: false }
		);
	}

	// Le focus revient à l'élément d'origine : le panneau vit dans l'URL, rien ne le rend tout seul.
	let origine: HTMLElement | null = null;
	const ouvert = $derived(donnees !== null);

	$effect.pre(() => {
		if (ouvert) {
			origine ??= document.activeElement as HTMLElement | null;
		} else if (origine) {
			const cible = origine;
			origine = null;
			queueMicrotask(() => {
				if (cible.isConnected) cible.focus();
			});
		}
	});
</script>

{#if donnees}
	{#key cle}
		<FormulaireOperation
			contexte={donnees.contexte}
			detail={donnees.detail}
			modele={donnees.modele}
			ligne={donnees.ligne}
			solder={donnees.solder}
			sommes={donnees.sommes}
			rendre={q.has('rendre')}
			introuvable={donnees.introuvable}
			intention={q.get('intention')}
			preselection={{
				compteId: Number(q.get('compte')) || null,
				mode: q.get('mode') as ModePaiement | null,
				deId: Number(q.get('de')) || null,
				versId: Number(q.get('vers')) || null
			}}
			{exerciceRegarde}
			{peutSaisir}
			{fermer}
		/>
	{/key}
{/if}
