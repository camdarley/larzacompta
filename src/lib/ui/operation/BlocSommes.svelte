<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import type { SommeASolder } from '#lib/domaine/creances/index.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import SelecteurRecherche, { type OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import type { Saisie } from './saisie.svelte.ts';

	type Props = {
		saisie: Saisie;
		/** Sommes ouvertes : une même Opération peut en solder plusieurs. */
		sommes: readonly SommeASolder[];
		erreurs: Record<string, string>;
		/** Depuis le relevé : le montant est celui de la banque, une autre somme le partage. */
		montantFixe?: boolean;
	};

	let { saisie, sommes, erreurs, montantFixe = false }: Props = $props();

	const sens = $derived(saisie.sommes[0]?.somme.sens ?? 'creance');
	const restantes = $derived(
		sommes.filter((s) => s.sens === sens && !saisie.sommes.some((p) => p.somme.id === s.id))
	);
	const options = $derived(
		restantes.map((s): OptionRecherche => ({
			id: s.id,
			libelle: `${s.tiers}, ${s.motif}`,
			detail: formaterMontant(s.reste)
		}))
	);
	const titre = $derived(sens === 'creance' ? 'À recevoir' : 'À payer');
	const origine = $derived(saisie.sommes.find((p) => p.somme.exerciceOrigine)?.somme);

	let ajout = $state(false);
	let choisie = $state<number | null>(null);

	function ajouter(id: number | null) {
		const s = restantes.find((x) => x.id === id);
		if (s && montantFixe) saisie.ajouterSommeDeLigne(s);
		else if (s) saisie.ajouterSomme(s);
		choisie = null;
		ajout = false;
	}
</script>

<section class="sommes" aria-label="Sommes soldées">
	<h3 class="t-heading">Cette Opération solde</h3>
	<ul>
		{#each saisie.sommes as p, i (p.somme.id)}
			<li>
				<div class="somme">
					<p>{p.somme.tiers}, {p.somme.motif}</p>
					<p class="t-caption t-muted">{titre}, reste {formaterMontant(p.somme.reste)}</p>
				</div>
				{#if saisie.sommes.length > 1}
					<div class="part">
						<ChampMontant
							etiquette="Part de {p.somme.tiers}"
							id="part-{p.somme.id}"
							name="part-{i}"
							masquerEtiquette
							bind:valeur={p.montant}
							erreur={erreurs[`parts.${i}`]}
						/>
					</div>
					<button
						class="retirer"
						type="button"
						aria-label="Ne plus solder {p.somme.tiers}"
						onclick={() => saisie.retirerSomme(p.somme.id)}
					>
						<X size={20} strokeWidth={1.75} aria-hidden="true" />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
	{#if ajout}
		<SelecteurRecherche
			etiquette="Autre somme à solder"
			id="op-autre-somme"
			{options}
			bind:valeur={choisie}
			listerAOuverture
			onchange={ajouter}
		/>
	{:else if restantes.length > 0}
		<div>
			<Bouton variante="discret" onclick={() => (ajout = true)}>
				<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
				Solder une autre somme
			</Bouton>
		</div>
	{/if}
	{#if origine}
		<p class="t-caption t-muted">
			Cette somme date de {origine.exerciceOrigine} : sa Ligne s’y rattache, elle ne compte pas dans le
			résultat de l’Exercice en cours.
		</p>
	{/if}
</section>

<style>
	.sommes {
		display: grid;
		gap: var(--espace-2);
		margin-bottom: var(--espace-4);
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		padding: var(--espace-1) 0;
	}

	li + li {
		border-top: 1px solid var(--border);
	}

	.somme {
		flex: 1;
		min-width: 0;
	}

	.part {
		flex: 0 0 9rem;
	}

	.retirer {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--espace-row);
		height: var(--espace-row);
		border: 0;
		border-radius: var(--rayon-md);
		background: transparent;
		color: var(--ink-muted);
		cursor: pointer;
	}

	.retirer:hover {
		color: var(--ink);
	}
</style>
