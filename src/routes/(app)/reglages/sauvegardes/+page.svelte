<script lang="ts">
	import { Archive, DatabaseBackup } from '@lucide/svelte';
	import { formaterHorodatage } from '#lib/domaine/dates.ts';
	import { TEXTES } from '#lib/messages.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';

	let { data } = $props();
</script>

<EnTete
	titre="Sauvegardes"
	contexte="Réglages"
	sousTitre="Vos données vous appartiennent : emportez-les quand vous voulez."
/>

{#if data.bandeau}
	<Bandeau ton="regarder">{TEXTES[data.bandeau]}</Bandeau>
{/if}

<section class="carte" aria-labelledby="titre-nuit">
	<DatabaseBackup size={28} strokeWidth={1.75} aria-hidden="true" />
	<div>
		<h2 id="titre-nuit" class="t-heading">Sauvegarde de chaque nuit</h2>
		<dl>
			<dt>Dernière réussite</dt>
			<dd>
				{data.derniereReussite
					? formaterHorodatage(data.derniereReussite)
					: 'Aucune pour l’instant'}
			</dd>
			<dt>Copie hors du VPS</dt>
			<dd>{data.horsVps ? 'Configurée' : 'À configurer'}</dd>
			{#if data.dernierEchec}
				<dt>Dernier échec</dt>
				<dd>
					{formaterHorodatage(data.dernierEchec.debutLe)}
					{#if data.dernierEchec.message}
						<p class="detail">{data.dernierEchec.message}</p>
					{/if}
				</dd>
			{/if}
		</dl>
		<p class="lien">
			<a href="/reglages/sauvegardes/restauration">Comment restaurer les données</a>
		</p>
	</div>
</section>

<section class="carte" aria-labelledby="titre-export">
	<Archive size={28} strokeWidth={1.75} aria-hidden="true" />
	<div>
		<h2 id="titre-export" class="t-heading">Export complet</h2>
		<p>
			Une archive ZIP lisible sans l’outil : les Opérations, les Lignes et les Pointages en CSV, les
			Pièces, et un fichier qui explique le tout. Elle s’ouvre dans un tableur français.
		</p>
		<div class="action">
			<Bouton href="/reglages/sauvegardes/export" rechargement>Export complet</Bouton>
		</div>
	</div>
</section>

<style>
	.carte {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-3);
		max-width: var(--espace-reading-max);
		padding: var(--espace-5);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
		color: var(--ink);
	}

	.carte > :global(svg) {
		flex: none;
		color: var(--primary);
	}

	.carte > div {
		min-width: 0;
	}

	dl {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--espace-1) var(--espace-4);
		margin-top: var(--espace-2);
	}

	dt {
		color: var(--ink-muted);
	}

	.detail {
		margin-top: var(--espace-1);
		color: var(--ink-muted);
		overflow-wrap: anywhere;
	}

	p {
		margin-top: var(--espace-1);
	}

	.lien {
		margin-top: var(--espace-3);
	}

	.action {
		margin-top: var(--espace-4);
	}

	@media (max-width: 479.98px) {
		dl {
			grid-template-columns: minmax(0, 1fr);
		}

		dd + dt {
			margin-top: var(--espace-2);
		}
	}
</style>
