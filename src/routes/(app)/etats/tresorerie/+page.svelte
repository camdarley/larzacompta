<script lang="ts">
	import { page } from '$app/state';
	import {
		centimes,
		formaterMontant,
		formaterMontantSigne,
		type Centimes
	} from '#lib/domaine/montant.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import CalculPose from '#lib/ui/CalculPose.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import Exporter from '#lib/ui/etats/Exporter.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';

	let { data } = $props();

	const t = $derived(data.etat?.etat ?? null);
	const lien = (href: string) => {
		const choisi = page.url.searchParams.get('exercice');
		if (!choisi) return href;
		const [chemin, reste] = href.split('#');
		const lie = (chemin as string).includes('?') ? '&' : '?';
		const ancre = reste ? `#${reste}` : '';
		return `${chemin}${lie}exercice=${encodeURIComponent(choisi)}${ancre}`;
	};

	const terme = (libelle: string, montant: Centimes, href: string) => ({
		libelle,
		montant: centimes(Math.abs(montant)),
		signe: (montant < 0 ? '−' : '+') as '+' | '−',
		href: lien(href)
	});
</script>

<EnTete
	titre="État de trésorerie"
	contexte="États"
	sousTitre="Ce que l’APE possédait au début et à la fin de l’Exercice, Compte par Compte."
>
	{#snippet actions()}
		{#if t}<Exporter etat="tresorerie" />{/if}
	{/snippet}
</EnTete>

{#each data.etat?.anomalies ?? [] as a (a)}
	<Bandeau ton="erreur" alerte>{a}</Bandeau>
{/each}

{#if t}
	<Tableau legende="État de trésorerie de {data.exercice?.libelle}">
		<thead>
			<tr>
				<th scope="col">Compte</th>
				<th scope="col" class="droite">Départ</th>
				<th scope="col" class="droite">Fin</th>
				<th scope="col" class="droite">Variation</th>
			</tr>
		</thead>
		<tbody>
			{#each t.comptes as c (c.compteId)}
				<tr>
					<td class="principale">{c.libelle}</td>
					<td class="chiffre"
						><span class="seulement-telephone etiquette">Départ</span>{formaterMontant(
							c.depart
						)}</td
					>
					<td class="chiffre"
						><span class="seulement-telephone etiquette">Fin</span>{formaterMontant(c.fin)}</td
					>
					<td class="montant">{formaterMontantSigne(c.variation)}</td>
				</tr>
			{/each}
			<tr class="total">
				<td class="principale">Total</td>
				<td class="chiffre"
					><span class="seulement-telephone etiquette">Départ</span>{formaterMontant(t.depart)}</td
				>
				<td class="chiffre"
					><span class="seulement-telephone etiquette">Fin</span>{formaterMontant(t.fin)}</td
				>
				<td class="montant">{formaterMontantSigne(t.variation)}</td>
			</tr>
		</tbody>
	</Tableau>

	<div class="deux">
		<section aria-labelledby="titre-restes">
			<h2 id="titre-restes" class="t-heading">
				<AideTerme ancre="creance-dette">Créances et Dettes</AideTerme>
			</h2>
			<p class="t-muted">Restes dus à la fin de l’Exercice, hors trésorerie.</p>
			<dl>
				<div>
					<dt>Ce que l’APE attend</dt>
					<dd class="montant">{formaterMontant(t.creances)}</dd>
				</div>
				<div>
					<dt>Ce que l’APE doit</dt>
					<dd class="montant">{formaterMontant(t.dettes)}</dd>
				</div>
			</dl>
			<a href={lien('/creances-dettes')}>Voir le détail</a>
		</section>

		<section aria-labelledby="titre-explication">
			<h2 id="titre-explication" class="t-heading">Explication résultat et variation</h2>
			<p class="t-muted">Pourquoi la trésorerie n’a pas bougé exactement du résultat.</p>
			<CalculPose
				termes={[
					{
						libelle: 'Résultat de l’Exercice',
						montant: t.explication.resultat,
						href: lien('/etats')
					},
					terme('Lignes sur Exercices antérieurs', t.explication.anterieures, '/etats#anterieurs'),
					terme(
						'Natures neutres',
						t.explication.neutres,
						data.natureNeutre === null ? '/operations' : `/operations?nature=${data.natureNeutre}`
					),
					terme('Mouvements internes en transit', t.explication.transit, '/operations?internes=1')
				]}
				totalLibelle="Variation de trésorerie"
				total={t.explication.variation}
			/>
		</section>
	</div>
{/if}

<style>
	.chiffre {
		font-variant-numeric: tabular-nums lining-nums;
		text-align: right;
		white-space: nowrap;
	}

	.etiquette {
		margin-right: var(--espace-1);
	}

	.total td {
		border-top: 1px solid var(--ink);
		font-weight: var(--typo-body-strong-graisse);
	}

	.deux {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--espace-5);
		align-items: start;
	}

	section {
		display: grid;
		gap: var(--espace-2);
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
		min-width: 0;
	}

	dl > div {
		display: flex;
		justify-content: space-between;
		gap: var(--espace-3);
		padding: var(--espace-1) 0;
	}

	@media (max-width: 1023.98px) {
		.deux {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 639.98px) {
		.chiffre {
			text-align: left;
		}

		.total td {
			border-top: 0;
		}

		.total {
			border-top: 1px solid var(--ink);
		}
	}
</style>
