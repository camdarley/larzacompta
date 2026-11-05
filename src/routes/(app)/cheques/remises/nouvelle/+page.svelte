<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { accordCheques } from '#lib/domaine/cheques/index.ts';
	import { formaterDateCourte, formaterDateLongue } from '#lib/domaine/dates.ts';
	import { formaterMontant, sommeCentimes } from '#lib/domaine/montant.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';

	let { data } = $props();

	const v = $derived(data.vue);
	let retires = $state<number[]>([]);
	let compteId = $state(untrack(() => String(data.vue.compteId ?? '')));
	let date = $state(untrack(() => data.date));
	let confirmer = $state(false);
	let occupe = $state(false);
	let erreurs = $state<Record<string, string>>({});
	let alerte = $state<string | null>(null);

	const coches = $derived(v.cheques.filter((c) => !retires.includes(c.id)));
	/** Le même calcul que le serveur : il refuse si le paquet ne tombe plus juste (Q2). */
	const total = $derived(sommeCentimes(coches.map((c) => c.montant)));
	const compte = $derived(v.comptes.find((c) => String(c.id) === compteId)?.libelle ?? '');
	const tous = $derived(retires.length === 0);

	function basculer(id: number) {
		retires = retires.includes(id) ? retires.filter((x) => x !== id) : [...retires, id];
	}

	async function creer() {
		if (occupe) return;
		occupe = true;
		alerte = null;
		erreurs = {};
		const r = await envoyer<{ id: number }>('/api/cheques/remises', {
			chequeIds: coches.map((c) => c.id),
			compteId: Number(compteId),
			date,
			total
		});
		occupe = false;
		confirmer = false;
		if (r.type === 'ok') {
			afficherToast('Remise créée.');
			await goto(`/cheques/remises/${r.valeur.id}`);
		} else if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'reseau') {
			alerte = message('reseau_coupe');
		} else if (r.type === 'serveur') {
			alerte = message('erreur_serveur');
		} else if (typeof r.erreur.details?.champ === 'string') {
			erreurs = { [r.erreur.details.champ]: messageErreur(r.erreur) };
		} else {
			alerte = messageErreur(r.erreur);
		}
	}

	function surTouche(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && coches.length > 0) {
			e.preventDefault();
			confirmer = true;
		}
	}
</script>

<svelte:window onkeydown={surTouche} />

<a class="retour" href="/cheques">
	<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
	Chèques reçus
</a>

<EnTete
	titre="Nouvelle Remise"
	contexte="Chèques"
	sousTitre="Décochez ce qui ne part pas au guichet, puis contrôlez le total avec le paquet en main."
/>

<ReserveOrdinateur />

<div class="seulement-ordinateur travail">
	{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}

	<Tableau legende="Chèques en attente">
		<thead>
			<tr>
				<th scope="col">
					<span class="visuellement-cache">Dans la Remise</span>
					<input
						type="checkbox"
						aria-label="Tout cocher"
						checked={tous}
						onchange={() => (retires = tous ? v.cheques.map((c) => c.id) : [])}
					/>
				</th>
				<th scope="col">Émetteur</th>
				<th scope="col">Banque</th>
				<th scope="col">Reçu le</th>
				<th scope="col">Actions</th>
				<th scope="col" class="droite">Montant</th>
			</tr>
		</thead>
		<tbody>
			{#each v.cheques as c (c.id)}
				<tr class:retire={retires.includes(c.id)}>
					<td>
						<input
							type="checkbox"
							aria-label="Remettre le chèque de {c.emetteur}, {formaterMontant(c.montant)}"
							checked={!retires.includes(c.id)}
							onchange={() => basculer(c.id)}
						/>
					</td>
					<td class="principale">{c.emetteur}</td>
					<td>{c.banque ?? ''}</td>
					<td class="date">{formaterDateCourte(c.date)}</td>
					<td>{c.actions.join(', ')}</td>
					<td class="montant">{formaterMontant(c.montant)}</td>
				</tr>
			{/each}
		</tbody>
	</Tableau>

	<div class="fin">
		<div class="choix">
			<ChampListe
				etiquette="Compte de destination"
				id="remise-compte"
				name="compteId"
				options={v.comptes.map((c) => ({ valeur: String(c.id), libelle: c.libelle }))}
				bind:valeur={compteId}
				erreur={erreurs.compteId}
			/>
			<Champ
				etiquette="Date du dépôt"
				id="remise-date"
				name="date"
				type="date"
				bind:valeur={date}
				erreur={erreurs.date}
			/>
		</div>
		<div class="total" aria-live="polite">
			<p class="t-caption t-muted">{accordCheques(coches.length)}</p>
			<p class="montant-lg" data-testid="total-remise">{formaterMontant(total)}</p>
		</div>
		<Bouton onclick={() => (confirmer = true)} disabled={coches.length === 0}>
			Créer la Remise
		</Bouton>
	</div>
</div>

<Dialogue
	ouvert={confirmer}
	titre="Créer la Remise ?"
	libelleAction="Créer la Remise"
	{occupe}
	confirmer={creer}
	revenir={() => (confirmer = false)}
>
	<p>
		{accordCheques(coches.length)} pour {formaterMontant(total)}, vers {compte}, le {formaterDateLongue(
			date
		)}.
	</p>
	<p class="t-muted">Tant qu’elle n’est pas pointée, une Remise s’annule et libère ses chèques.</p>
</Dialogue>

<style>
	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		margin-bottom: var(--espace-1);
		color: var(--ink-muted);
	}

	.travail {
		display: grid;
		gap: var(--espace-4);
		min-width: 0;
	}

	input[type='checkbox'] {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--primary);
		cursor: pointer;
	}

	.date {
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.retire td {
		color: var(--ink-muted);
	}

	.fin {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--espace-4);
	}

	.choix {
		display: grid;
		grid-template-columns: minmax(14rem, 20rem) 11rem;
		gap: var(--espace-3);
	}

	.total {
		margin-left: auto;
		text-align: right;
	}
</style>
