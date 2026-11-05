<script lang="ts">
	import { Archive } from '@lucide/svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
</script>

<EnTete
	titre="Sauvegardes"
	contexte="Réglages"
	sousTitre="Vos données vous appartiennent : emportez-les quand vous voulez."
/>

<section class="export" aria-labelledby="titre-export">
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
	.export {
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

	.export > :global(svg) {
		flex: none;
		color: var(--primary);
	}

	p {
		margin-top: var(--espace-1);
	}

	.action {
		margin-top: var(--espace-4);
	}
</style>
