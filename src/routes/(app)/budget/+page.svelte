<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CalendarDays, PiggyBank } from '@lucide/svelte';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Exporter from '#lib/ui/etats/Exporter.svelte';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';
	import TableauBudget from '#lib/ui/budget/TableauBudget.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import { urlAvec } from '#lib/ui/url.ts';

	let { data, form } = $props();

	const b = $derived(data.budget);
	const partDeZero = $derived(page.url.searchParams.get('partir') === 'zero');
	const avecBudget = $derived((b?.lignes.length ?? 0) > 0);
	const enTableau = $derived(b !== null && (avecBudget || (partDeZero && b.modifiable)));

	const envoi = creerEnvoi({
		toast: false,
		apres() {
			const r = form as { valeur?: { lignes: number; depuis: string } } | null;
			if (r?.valeur) {
				const { lignes, depuis } = r.valeur;
				afficherToast(
					`${lignes} ${lignes === 1 ? 'prévision reprise' : 'prévisions reprises'} de ${depuis}.`
				);
			}
			return goto(urlAvec({ ouvert: 'tout' }), { invalidateAll: true });
		}
	});
</script>

<EnTete
	titre="Budget"
	contexte="Résultats"
	sousTitre={data.exercice ? `Le prévu et le réalisé de ${data.exercice.libelle}.` : ''}
>
	{#snippet actions()}
		{#if avecBudget}<Exporter etat="budget" />{/if}
	{/snippet}
</EnTete>

{#if form?.erreur}
	<div class="alerte"><Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau></div>
{/if}

{#if data.exercice === null || b === null}
	<EtatVide
		icone={CalendarDays}
		titre="Aucun Exercice"
		phrase="Un Budget se prépare pour un Exercice. Ouvrez-en un dans les Réglages."
	/>
{:else if enTableau}
	<div class="reserve"><ReserveOrdinateur /></div>
	{#if b.modifiable}
		<p class="aide t-muted seulement-ordinateur">
			Un <AideTerme ancre="budget">Budget</AideTerme> prévoit, Action par Action. Chaque montant s’enregistre
			seul à la sortie du champ, et Entrée passe au suivant.
		</p>
	{/if}
	<!-- Le tableau garde sa saisie en mémoire : un autre Exercice repart de ses propres lignes. -->
	{#key data.exercice.id}
		<TableauBudget
			exerciceId={data.exercice.id}
			lignes={b.lignes}
			realise={b.realise}
			parametrage={b.parametrage}
			vides={b.vides}
			natures={b.natures}
			modifiable={b.modifiable}
		/>
	{/key}
	<p class="note t-caption t-muted">
		Sur la rangée d’une Action, Prévu et Réalisé donnent son résultat : recettes moins dépenses.
	</p>
{:else}
	<EtatVide
		icone={PiggyBank}
		titre="Pas encore de Budget pour {data.exercice.libelle}"
		phrase={b.modifiable
			? b.depart
				? 'Repartez du réalisé de l’an dernier, puis ajustez.'
				: 'Aucun réalisé à reprendre : partez de zéro.'
			: 'Cet Exercice est clôturé : son Budget ne se prépare plus.'}
	>
		{#snippet action()}
			{#if b.modifiable}
				<div class="actions seulement-ordinateur">
					{#if b.depart}
						<form method="post" action="?/repartir" use:enhance={envoi.soumettre}>
							<input type="hidden" name="exerciceId" value={data.exercice?.id} />
							<Bouton type="submit" occupe={envoi.occupe}>Repartir du réalisé</Bouton>
						</form>
					{/if}
					<Bouton
						variante={b.depart ? 'secondaire' : 'principal'}
						href={urlAvec({ partir: 'zero', ouvert: 'tout' })}
					>
						Partir de zéro
					</Bouton>
				</div>
				<ReserveOrdinateur />
			{/if}
		{/snippet}
	</EtatVide>
{/if}

<style>
	.alerte {
		margin-bottom: var(--espace-4);
	}

	.reserve {
		margin-bottom: var(--espace-3);
	}

	.aide {
		max-width: var(--espace-reading-max);
		margin-bottom: var(--espace-3);
	}

	.note {
		margin-top: var(--espace-3);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--espace-2);
	}
</style>
