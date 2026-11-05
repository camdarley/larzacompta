<script lang="ts">
	import { page } from '$app/state';
	import { Download } from '@lucide/svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';

	let { data } = $props();

	const adresse = (telecharger: boolean) => {
		const choisi = page.url.searchParams.get('exercice');
		const texte = new URLSearchParams({
			...(choisi ? { exercice: choisi } : {}),
			...(telecharger ? { telecharger: '1' } : {})
		}).toString();
		return `/etats/document-ag/pdf${texte ? `?${texte}` : ''}`;
	};
	const provisoire = $derived(data.exercice?.statut === 'ouvert');
</script>

<EnTete
	titre="Document d’AG"
	contexte="États"
	sousTitre="Compte de résultat et État de trésorerie réunis, à présenter en assemblée générale."
	aide={{ ancre: 'etats', texte: 'Que contient-il ?' }}
>
	{#snippet actions()}
		<Bouton href={adresse(true)} rechargement>
			<Download size={20} strokeWidth={1.75} aria-hidden="true" />
			Télécharger
		</Bouton>
	{/snippet}
</EnTete>

{#if provisoire}
	<Bandeau ton="info">
		{data.exercice?.libelle} n’est pas clôturé : le document porte le filigrane « Provisoire ».
	</Bandeau>
{/if}

<div class="apercu seulement-ordinateur">
	<iframe src={adresse(false)} title="Aperçu du Document d’AG de {data.exercice?.libelle}"></iframe>
</div>

<p class="seulement-telephone t-muted">
	L’aperçu se lit sur ordinateur. Le bouton Télécharger donne le document complet.
</p>

<style>
	.apercu {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-sunken);
	}

	iframe {
		display: block;
		width: 100%;
		height: min(80vh, 900px);
		border: 0;
	}
</style>
