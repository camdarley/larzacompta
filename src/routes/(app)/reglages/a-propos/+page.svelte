<script lang="ts">
	import { Download, Scale } from '@lucide/svelte';
	import { LICENCE, NOM_PRODUIT } from '#lib/produit.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';

	let { data } = $props();
</script>

<EnTete titre="À propos" contexte="Réglages" sousTitre="{NOM_PRODUIT} est un logiciel libre." />

<section class="carte" aria-labelledby="titre-version">
	<Scale size={28} strokeWidth={1.75} aria-hidden="true" />
	<div>
		<h2 id="titre-version" class="t-heading">Version et licence</h2>
		<dl>
			<dt>Version installée</dt>
			<dd>{data.actuelle}</dd>
			{#if data.revision}
				<dt>Révision</dt>
				<dd>{data.revision}</dd>
			{/if}
			{#if data.obsolete}
				<dt>Version publiée</dt>
				<dd>{data.publiee}</dd>
			{/if}
			<dt>Licence</dt>
			<dd>
				<a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="external">{LICENCE}</a>
			</dd>
		</dl>
	</div>
</section>

<section class="carte" aria-labelledby="titre-source">
	<Download size={28} strokeWidth={1.75} aria-hidden="true" />
	<div>
		<h2 id="titre-source" class="t-heading">Code source</h2>
		{#if data.codeSource}
			<p>
				La licence vous donne le droit d’obtenir le code exact de cette installation, de l’étudier
				et de le modifier.
			</p>
			<div class="action">
				<Bouton href="/code-source" rechargement variante="secondaire">Télécharger le code</Bouton>
			</div>
		{:else}
			<p>
				Cette installation ne vient pas de l’image Docker du projet. Demandez son code à la personne
				qui gère l’installation : la licence vous le garantit.
			</p>
		{/if}
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

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--espace-1) var(--espace-4);
		margin-top: var(--espace-2);
	}

	dt {
		color: var(--ink-muted);
	}

	p {
		margin-top: var(--espace-1);
	}

	.action {
		margin-top: var(--espace-4);
	}
</style>
