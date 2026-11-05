<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Exercice } from '#lib/domaine/exercices.ts';
	import type { ContexteSaisie, DetailOperation } from '#lib/domaine/operations/vues.ts';
	import { urlAvec } from '#lib/ui/url.ts';
	import FormulaireOperation from './FormulaireOperation.svelte';

	export type DonneesPanneau = {
		contexte: ContexteSaisie;
		detail: DetailOperation | null;
		modele: DetailOperation | null;
		introuvable: boolean;
	};

	type Props = {
		donnees: DonneesPanneau | null;
		exerciceRegarde: Exercice | null;
		peutSaisir: boolean;
	};

	let { donnees, exerciceRegarde, peutSaisir }: Props = $props();

	const q = $derived(page.url.searchParams);
	const cle = $derived(`${q.get('op')}|${q.get('depuis')}|${q.get('rendre')}`);

	function fermer() {
		goto(urlAvec({ op: null, depuis: null, rendre: null, intention: null }), { reset: false });
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
			rendre={q.has('rendre')}
			introuvable={donnees.introuvable}
			intention={q.get('intention')}
			{exerciceRegarde}
			{peutSaisir}
			{fermer}
		/>
	{/key}
{/if}
