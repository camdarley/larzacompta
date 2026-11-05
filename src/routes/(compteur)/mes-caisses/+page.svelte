<script lang="ts">
	import { CircleHelp, LogOut, Wallet } from '@lucide/svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';

	let { data } = $props();
</script>

<div class="page">
	<EnTete titre="Mes caisses" sousTitre={data.nomApe} />

	{#if data.rangees.length === 0}
		<EtatVide
			icone={Wallet}
			titre="Aucune caisse pour vous"
			phrase="Demandez à la personne qui tient la trésorerie de vous autoriser sur une caisse."
		/>
	{:else}
		<ul class="rangees">
			{#each data.rangees as r (r.compteId)}
				<li class="rangee">
					<div class="texte">
						<h2 class="t-heading">{r.libelle}</h2>
						<p class="t-caption t-muted">
							{#if r.reserve}Caisse de réserve{:else if r.ouverte}Ouverte{r.action
									? `, ${r.action}`
									: ''}{:else}Fermée{/if}
						</p>
					</div>
					{#if r.reserve}
						<Bouton href="/caisses/{r.compteId}/comptage">Compter</Bouton>
					{:else if !r.ouverte}
						<Bouton href="/caisses/{r.compteId}/comptage">Ouvrir</Bouton>
					{:else if r.comptageFinal}
						<div class="fait">
							<span class="t-caption">Comptée</span>
							<a href="/sessions/{r.sessionId}/comptage">Corriger</a>
						</div>
					{:else}
						<div class="suite">
							<Bouton href="/sessions/{r.sessionId}/comptage">Compter</Bouton>
							<a
								class="corriger t-caption"
								href="/sessions/{r.sessionId}/comptage?corriger=ouverture"
							>
								Corriger l’ouverture
							</a>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<footer class="pied">
		<a href="/aide">
			<CircleHelp size={20} strokeWidth={1.75} aria-hidden="true" />
			Aide
		</a>
		<form method="post" action="/deconnexion" data-sveltekit-reload>
			<button type="submit">
				<LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
				Se déconnecter
			</button>
		</form>
	</footer>
</div>

<style>
	/* Au pouce, debout : un lien discret garde une cible de 48 px. */
	.corriger {
		display: inline-flex;
		align-items: center;
		min-height: var(--espace-touch);
	}

	.page {
		display: flex;
		flex-direction: column;
		gap: var(--espace-5);
		width: 100%;
		max-width: 480px;
		min-height: 100dvh;
		margin: 0 auto;
		padding: var(--espace-5) var(--espace-page-mobile)
			calc(var(--espace-4) + env(safe-area-inset-bottom));
	}

	.rangees {
		display: grid;
		gap: var(--espace-3);
	}

	.rangee {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-3);
		min-height: 88px;
		padding: var(--espace-3) var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.texte {
		min-width: 0;
	}

	.fait,
	.suite {
		display: grid;
		justify-items: end;
		flex: none;
		gap: var(--espace-1);
	}

	.pied {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--espace-2);
		margin-top: auto;
		padding-top: var(--espace-4);
		border-top: 1px solid var(--border);
	}

	.pied a,
	.pied button {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-touch);
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}
</style>
