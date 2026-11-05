<script lang="ts">
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import {
		centimes,
		formaterMontant,
		formaterMontantSigne,
		sommeCentimes,
		type Centimes
	} from '#lib/domaine/montant.ts';
	import type { CausesVue, ElementRelie } from '#lib/domaine/releve/vues.ts';
	import CalculPose from '#lib/ui/CalculPose.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import { urlAvec } from '#lib/ui/url.ts';

	type Props = { causes: CausesVue; fermer: () => void };
	let { causes, fermer }: Props = $props();

	const abs = (c: Centimes) => centimes(Math.abs(c));
	const totalLignes = $derived(sommeCentimes(causes.lignes.map((l) => l.montant)));
	const totalCotes = $derived(sommeCentimes(causes.cotes.map((o) => o.montant)));
	const phrase = $derived(
		causes.ecart === 0
			? 'Le solde calculé égale le relevé : il n’y a pas d’Écart.'
			: causes.nonExplique === 0
				? `Ces éléments expliquent tout l’Écart de ${formaterMontant(abs(causes.ecart))}.`
				: `Ces éléments expliquent ${formaterMontant(abs(causes.explique))} sur un Écart de ${formaterMontant(abs(causes.ecart))}. Il reste ${formaterMontant(abs(causes.nonExplique))} à comprendre.`
	);
</script>

{#snippet operation(o: ElementRelie)}
	<li>
		<a href={urlAvec({ causes: null, op: String(o.operationId) })} data-sveltekit-reset="false">
			{o.libelle}
		</a>
		<span class="date t-caption">{formaterDateCourte(o.date)}</span>
		<span class="montant">{formaterMontantSigne(o.montant)}</span>
	</li>
{/snippet}

<Panneau ouvert titre="Causes de l’Écart" {fermer} sansConfirmation>
	<div class="causes">
		<p>{phrase}</p>
		<div class="pose">
			<CalculPose
				termes={[
					{ libelle: 'Lignes de relevé non pointées', montant: totalLignes },
					{
						libelle: 'Opérations non pointées',
						montant: abs(totalCotes),
						signe: totalCotes < 0 ? '+' : '−'
					}
				]}
				totalLibelle="Expliqué"
				total={causes.explique}
			/>
		</div>

		<section aria-labelledby="causes-lignes">
			<h3 id="causes-lignes" class="t-heading">Lignes de relevé non pointées</h3>
			{#if causes.lignes.length === 0}
				<p class="t-muted">Aucune.</p>
			{:else}
				<ul>
					{#each causes.lignes as l (l.id)}
						<li>
							<span>{l.libelle}</span>
							<span class="date t-caption">{formaterDateCourte(l.date)}</span>
							<span class="montant">{formaterMontantSigne(l.montant)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="causes-operations">
			<h3 id="causes-operations" class="t-heading">Opérations non pointées</h3>
			{#if causes.cotes.length === 0}
				<p class="t-muted">Aucune.</p>
			{:else}
				<ul>
					{#each causes.cotes as o, i (i)}{@render operation(o)}{/each}
				</ul>
			{/if}
		</section>

		{#if causes.anciennes.length > 0}
			<section aria-labelledby="causes-anciennes">
				<h3 id="causes-anciennes" class="t-heading">Plus anciennes que le dernier relevé</h3>
				<p class="t-caption t-muted">Elles auraient dû y figurer : à regarder en premier.</p>
				<ul>
					{#each causes.anciennes as o, i (i)}{@render operation(o)}{/each}
				</ul>
			</section>
		{/if}
	</div>
</Panneau>

<style>
	.causes {
		display: grid;
		gap: var(--espace-5);
	}

	.pose {
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	section {
		display: grid;
		gap: var(--espace-2);
	}

	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: baseline;
		gap: var(--espace-3);
		padding: var(--espace-2) 0;
		border-top: 1px solid var(--border);
	}

	li > :first-child {
		overflow-wrap: anywhere;
	}

	.date {
		color: var(--ink-muted);
	}

	@media (max-width: 639.98px) {
		li {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.date {
			grid-row: 2;
		}
	}
</style>
