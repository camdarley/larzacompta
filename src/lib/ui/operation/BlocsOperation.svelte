<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { Link2, Link2Off } from '@lucide/svelte';
	import { formaterDateCourte, formaterHorodatage } from '#lib/domaine/dates.ts';
	import { formaterMontant, formaterMontantSigne, type Centimes } from '#lib/domaine/montant.ts';
	import type { DetailOperation } from '#lib/domaine/operations/vues.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { demander, envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import SelecteurRecherche, { type OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import Pastille from '#lib/ui/Pastille.svelte';
	import { urlAvec } from '#lib/ui/url.ts';

	type Props = {
		detail: DetailOperation;
		peutSaisir: boolean;
		relierOuvert?: boolean;
	};

	let { detail, peutSaisir, relierOuvert = $bindable(false) }: Props = $props();

	const op = $derived(detail.operation);
	let autreId = $state<number | null>(null);
	let libelle = $state('');
	let occupe = $state(false);
	let erreur = $state<string | null>(null);

	$effect(() => {
		if (relierOuvert && libelle === '') libelle = detail.liaison?.libelle ?? op.libelle;
	});

	async function chercher(texte: string): Promise<OptionRecherche[]> {
		const r = await demander<{ id: number; libelle: string; date: string; montant: Centimes }[]>(
			`/api/operations/candidats?q=${encodeURIComponent(texte)}&sauf=${op.id}`
		);
		if (r.type !== 'ok') return [];
		return r.valeur.map((o) => ({
			id: o.id,
			libelle: o.libelle,
			detail: `${formaterDateCourte(o.date)}, ${formaterMontant(o.montant)}`
		}));
	}

	function suivre(r: Awaited<ReturnType<typeof envoyer>>, reussi: string) {
		if (r.type === 'ok') {
			afficherToast(reussi);
			erreur = null;
			relierOuvert = false;
			autreId = null;
			return refreshAll();
		}
		if (r.type === 'session') demanderReconnexion();
		else if (r.type === 'refus') erreur = messageErreur(r.erreur);
		else erreur = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
	}

	async function relier() {
		if (occupe) return;
		if (autreId === null) {
			erreur = 'Choisissez l’Opération à relier.';
			return;
		}
		occupe = true;
		await suivre(await envoyer(`/api/operations/${op.id}/relier`, { autreId, libelle }), 'Relié.');
		occupe = false;
	}

	async function delier() {
		if (occupe) return;
		occupe = true;
		await suivre(await envoyer(`/api/operations/${op.id}/delier`), 'Délié.');
		occupe = false;
	}
</script>

{#if detail.liaison}
	<section class="bloc" aria-label="Opérations reliées">
		<p class="phrase">
			<Link2 size={20} strokeWidth={1.75} aria-hidden="true" />
			{detail.liaison.phrase}
		</p>
		<ul class="reliees">
			{#each detail.liaison.operations as o (o.id)}
				<li>
					{#if o.id === op.id}
						<span>{o.libelle}</span>
					{:else}
						<a href={urlAvec({ op: String(o.id) })} data-sveltekit-reset="false">{o.libelle}</a>
					{/if}
					<span class="t-caption t-muted">{formaterDateCourte(o.date)}</span>
					<span class="montant">{formaterMontantSigne(o.montant)}</span>
				</li>
			{/each}
		</ul>
		{#if peutSaisir}
			<Bouton variante="discret" {occupe} onclick={delier}>
				<Link2Off size={20} strokeWidth={1.75} aria-hidden="true" />
				Délier cette Opération
			</Bouton>
		{/if}
	</section>
{/if}

{#if relierOuvert}
	<section class="bloc relier" aria-label="Relier à une autre Opération">
		<h3 class="t-heading">Relier à une autre Opération</h3>
		{#if erreur}<Bandeau ton="erreur" alerte>{erreur}</Bandeau>{/if}
		<SelecteurRecherche
			etiquette="Opération à relier"
			id="relier-operation"
			options={[]}
			bind:valeur={autreId}
			{chercher}
			placeholder="Libellé, référence ou montant"
		/>
		{#if !detail.liaison}
			<Champ
				etiquette="Nom de la dépense"
				name="relier-libelle"
				bind:valeur={libelle}
				aide="Les paiements reliés se lisent sous ce nom."
			/>
		{/if}
		<div class="boutons">
			<Bouton {occupe} onclick={relier}>Relier</Bouton>
			<Bouton variante="discret" onclick={() => (relierOuvert = false)}>Laisser tel quel</Bouton>
		</div>
	</section>
{/if}

{#if detail.pointee}
	<section class="bloc" aria-label="Mouvement bancaire">
		<h3 class="t-heading">Mouvement bancaire</h3>
		<p><Pastille etat="pointe" /></p>
		{#if detail.mouvements.length > 0}
			<ul class="reliees">
				{#each detail.mouvements as m (m.id)}
					<li>
						<span>{m.libelle}</span>
						<span class="t-caption t-muted">{formaterDateCourte(m.date)}</span>
						<span class="montant">{formaterMontantSigne(m.montant)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

{#if detail.historique.length > 0}
	<section class="bloc" aria-label="Historique">
		<h3 class="t-heading">Historique</h3>
		<ol class="historique">
			{#each detail.historique as h (h.id)}
				<li>
					<span class="t-caption t-muted">{formaterHorodatage(h.horodatage)}</span>
					<span>{h.accesNom} {h.resume}</span>
				</li>
			{/each}
		</ol>
	</section>
{/if}

<style>
	.bloc {
		display: grid;
		gap: var(--espace-2);
		margin-top: var(--espace-5);
		padding-top: var(--espace-4);
		border-top: 1px solid var(--border);
	}

	.relier {
		gap: var(--espace-3);
	}

	.phrase {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-2);
		font-weight: var(--typo-body-strong-graisse);
	}

	.phrase :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--primary);
	}

	.reliees li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: baseline;
		gap: var(--espace-3);
		min-height: var(--espace-row);
		align-content: center;
	}

	.reliees li + li {
		border-top: 1px solid var(--border);
	}

	.boutons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
	}

	.historique {
		display: grid;
		gap: var(--espace-2);
	}

	.historique li {
		display: grid;
	}
</style>
