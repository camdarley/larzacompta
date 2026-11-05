<script lang="ts">
	import { Wallet } from '@lucide/svelte';
	import { formaterJourMois } from '#lib/domaine/dates.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import { urlAvec } from '#lib/ui/url.ts';

	let { data } = $props();

	const saisir = $derived(data.peutSaisir);
	const entre = (de: number, vers?: number) =>
		urlAvec({
			op: 'nouvelle',
			intention: 'interne',
			de: String(de),
			vers: vers === undefined ? null : String(vers)
		});
</script>

<EnTete
	titre="Caisses"
	aide={{ ancre: 'comptage', texte: 'Qu’est-ce qu’un Comptage ?' }}
	sousTitre="Où sont les espèces, et depuis quand elles ont été comptées."
/>

{#if data.vue.cartes.length === 0}
	<EtatVide
		icone={Wallet}
		titre="Pas encore de caisse"
		phrase="Créez une caisse pour chaque boîte d’espèces, plus une caisse de réserve si vous en avez une."
	>
		{#snippet action()}
			{#if saisir}
				<Bouton href="/reglages/comptes?compte=nouveau&type=caisse">Créer une caisse</Bouton>
			{/if}
		{/snippet}
	</EtatVide>
{:else}
	<section class="total" aria-label="Total des espèces">
		<p class="t-caption t-muted">Total des espèces</p>
		<p class="montant-lg">{formaterMontant(data.vue.total)}</p>
	</section>

	<ul class="cartes">
		{#each data.vue.cartes as c (c.id)}
			<li class="carte">
				<header>
					<h2 class="t-heading"><a href="/caisses/{c.id}">{c.libelle}</a></h2>
					<p class="montant-lg">{formaterMontant(c.solde)}</p>
				</header>
				<p class="t-caption t-muted">
					{c.reserve ? 'Caisse de réserve. ' : ''}{c.dernierComptage
						? `Comptée le ${formaterJourMois(c.dernierComptage)}.`
						: 'Pas encore comptée.'}
				</p>
				{#if c.session}
					<p class="session t-caption">
						<a href="/sessions/{c.session.id}">
							Session ouverte{c.session.action ? `, ${c.session.action}` : ''}
						</a>
					</p>
				{/if}
				{#if saisir}
					<div class="actions">
						{#if c.reserve}
							<Bouton variante="secondaire" pleineLargeur href="/caisses/{c.id}/comptage">
								Compter maintenant
							</Bouton>
						{:else if c.session}
							<Bouton variante="secondaire" pleineLargeur href="/sessions/{c.session.id}">
								Voir la Session
							</Bouton>
						{:else}
							<Bouton variante="secondaire" pleineLargeur href="/caisses/{c.id}/comptage">
								Ouvrir une Session
							</Bouton>
						{/if}
						<div class="discrets">
							<Bouton variante="discret" href={entre(c.id)} conserverFocus>Transférer</Bouton>
							{#if data.banque !== null}
								<Bouton variante="discret" href={entre(c.id, data.banque)} conserverFocus>
									Déposer en banque
								</Bouton>
							{/if}
						</div>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.total {
		margin: var(--espace-5) 0;
	}

	.total .montant-lg {
		text-align: left;
	}

	.cartes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
		gap: var(--espace-4);
	}

	.carte {
		display: flex;
		flex-direction: column;
		gap: var(--espace-2);
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--espace-1) var(--espace-3);
	}

	header a {
		color: var(--ink);
	}

	.actions {
		display: grid;
		gap: var(--espace-1);
		margin-top: auto;
		padding-top: var(--espace-2);
	}

	.discrets {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--espace-1);
	}
</style>
