<script lang="ts">
	import {
		ArrowLeft,
		ArrowLeftRight,
		Coins,
		HandCoins,
		ReceiptText,
		TriangleAlert
	} from '@lucide/svelte';
	import { formaterDateLongue, formaterJourMois } from '#lib/domaine/dates.ts';
	import type { TypeEvenement } from '#lib/domaine/caisse/vues.ts';
	import { formaterMontant, formaterMontantSigne } from '#lib/domaine/montant.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import CalculPose from '#lib/ui/CalculPose.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { urlAvec } from '#lib/ui/url.ts';

	let { data } = $props();

	const d = $derived(data.detail);
	const c = $derived(d.carte);
	const saisir = $derived(data.peutSaisir);
	const entre = (de: number, vers?: number) =>
		urlAvec({
			op: 'nouvelle',
			intention: 'interne',
			de: String(de),
			vers: vers === undefined ? null : String(vers)
		});

	const ICONES: Record<TypeEvenement, typeof Coins> = {
		comptage: Coins,
		recette: HandCoins,
		ecart: TriangleAlert,
		depense: ReceiptText,
		entree: ReceiptText,
		transfert: ArrowLeftRight
	};
	/** Le libellé d'un Comptage, d'une recette ou d'un Écart dit déjà ce qu'ils sont. */
	const MOTS: Record<TypeEvenement, string | null> = {
		comptage: null,
		recette: null,
		ecart: null,
		depense: 'Dépense',
		entree: 'Entrée',
		transfert: 'Transfert'
	};
</script>

<a class="retour" href="/caisses">
	<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
	Toutes les caisses
</a>

<EnTete
	titre={c.libelle}
	contexte="Caisses"
	sousTitre={c.reserve ? 'Caisse de réserve, sans Session ni Action.' : undefined}
>
	{#snippet actions()}
		{#if saisir}
			{#if c.reserve}
				<Bouton href="/caisses/{c.id}/comptage">Compter maintenant</Bouton>
			{:else if c.session}
				<Bouton href="/sessions/{c.session.id}">Voir la Session</Bouton>
			{:else}
				<Bouton href="/caisses/{c.id}/comptage?inventaire=1">Faire l’inventaire</Bouton>
				<Bouton variante="secondaire" href="/caisses/{c.id}/comptage">Ouvrir une Session</Bouton>
			{/if}
			<Bouton variante="secondaire" href={entre(c.id)} conserverFocus>Transférer</Bouton>
			{#if data.banque !== null}
				<Bouton variante="secondaire" href={entre(c.id, data.banque)} conserverFocus>
					Déposer en banque
				</Bouton>
			{/if}
		{/if}
	{/snippet}
</EnTete>

<div class="resume">
	<section class="solde">
		<p class="t-caption t-muted">Solde courant</p>
		<p class="montant-lg">{formaterMontant(c.solde)}</p>
		{#if c.session}
			<p class="t-caption">
				<a href="/sessions/{c.session.id}"
					>Session ouverte{c.session.action ? `, ${c.session.action}` : ''}</a
				>
			</p>
		{/if}
		{#if c.recetteARevoir !== null}
			<p class="t-caption">
				<a href="/sessions/{c.recetteARevoir}">Recette d’espèces à revoir</a>
			</p>
		{/if}
	</section>
	{#if d.pose}
		<section class="pose">
			<CalculPose
				termes={[
					{
						libelle: `${d.pose.source === 'comptage' ? 'Dernier Comptage' : 'Dernier solde constaté'}, ${formaterJourMois(d.pose.date)}`,
						montant: d.pose.depart
					},
					{ libelle: 'Entrées depuis', montant: d.pose.entrees, signe: '+' },
					{ libelle: 'Sorties depuis', montant: d.pose.sorties, signe: '−' }
				]}
				totalLibelle="Solde courant"
				total={c.solde}
			/>
		</section>
	{:else}
		<p class="t-muted">Pas encore comptée : ce solde vient du solde de départ et des mouvements.</p>
	{/if}
</div>

<section aria-labelledby="titre-frise">
	<h2 id="titre-frise" class="t-heading">Histoire de la caisse</h2>
	{#if d.frise.length === 0}
		<p class="t-muted vide">Aucun mouvement pour l’instant.</p>
	{:else}
		<ol class="frise">
			{#each d.frise as jour (jour.date)}
				<li class="jour">
					<h3 class="t-label">{formaterDateLongue(jour.date)}</h3>
					<ul>
						{#each jour.evenements as e (e.cle)}
							{@const Icone = ICONES[e.type]}
							<li class="evenement">
								<Icone size={20} strokeWidth={1.75} aria-hidden="true" />
								<div class="texte">
									<p>
										{#if e.operationId}
											<a href={urlAvec({ op: String(e.operationId) })} data-sveltekit-reset="false"
												>{e.libelle}</a
											>
										{:else if e.sessionId}
											<a href="/sessions/{e.sessionId}">{e.libelle}</a>
										{:else}
											{e.libelle}
										{/if}
									</p>
									{#if MOTS[e.type]}<p class="t-caption t-muted">{MOTS[e.type]}</p>{/if}
								</div>
								<p class="montant">
									{e.type === 'comptage'
										? formaterMontant(e.montant)
										: formaterMontantSigne(e.montant)}
								</p>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		margin-bottom: var(--espace-3);
	}

	.resume {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
		gap: var(--espace-4);
		align-items: start;
		margin: var(--espace-5) 0;
	}

	.solde .montant-lg {
		text-align: left;
	}

	.pose {
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.vide {
		margin-top: var(--espace-2);
	}

	.frise {
		display: grid;
		gap: var(--espace-4);
		margin-top: var(--espace-3);
	}

	.jour ul {
		margin-top: var(--espace-1);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.evenement {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--espace-3);
		min-height: var(--espace-row-double);
		padding: var(--espace-2) var(--espace-3);
		color: var(--ink-muted);
	}

	.evenement + .evenement {
		border-top: 1px solid var(--border);
	}

	.texte {
		min-width: 0;
		color: var(--ink);
	}

	.texte a {
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.montant {
		color: var(--ink);
		white-space: nowrap;
	}
</style>
