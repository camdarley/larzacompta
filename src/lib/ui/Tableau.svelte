<script lang="ts">
	import type { Snippet } from 'svelte';

	let { legende, children }: { legende: string; children: Snippet } = $props();
</script>

<div class="conteneur">
	<table class="tableau">
		<caption class="visuellement-cache">{legende}</caption>
		{@render children()}
	</table>
</div>

<style>
	.conteneur {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.tableau {
		width: 100%;
		border-collapse: collapse;
	}

	.tableau :global(th) {
		padding: var(--espace-2) var(--espace-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--typo-label-taille);
		font-weight: var(--typo-label-graisse);
		color: var(--ink-muted);
		text-align: left;
	}

	/* En dessous, un en-tête passe à la ligne plutôt que de pousser le tableau hors de l'écran. */
	@media (min-width: 1024px) {
		.tableau :global(th) {
			white-space: nowrap;
		}
	}

	.tableau :global(th.droite) {
		text-align: right;
	}

	.tableau :global(td) {
		height: var(--espace-row);
		padding: var(--espace-1) var(--espace-3);
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}

	@media (min-width: 640px) and (max-width: 799.98px) {
		.tableau :global(th),
		.tableau :global(td) {
			padding-inline: var(--espace-2);
		}
	}

	.tableau :global(tbody tr:last-child td) {
		border-bottom: 0;
	}

	.tableau :global(tbody tr:hover) {
		background: var(--surface-sunken);
	}

	/*
	 * Téléphone : rangées à deux lignes. La cellule `.principale` et le montant sur la première,
	 * le reste sur la seconde, en plus petit.
	 */
	@media (max-width: 639.98px) {
		.conteneur {
			overflow-x: visible;
		}

		.tableau :global(thead) {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		.tableau :global(tr) {
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 2px var(--espace-3);
			padding: var(--espace-2) var(--espace-3);
			border-bottom: 1px solid var(--border);
		}

		.tableau :global(tr::after) {
			content: '';
			order: 2;
			flex-basis: 100%;
		}

		.tableau :global(tbody tr:last-child) {
			border-bottom: 0;
		}

		.tableau :global(td) {
			order: 3;
			height: auto;
			padding: 0;
			border-bottom: 0;
			font-size: var(--typo-caption-taille);
			color: var(--ink-muted);
		}

		.tableau :global(td.principale) {
			order: 0;
			flex: 1 1 0;
			min-width: 0;
			font-size: var(--typo-body-taille);
			color: var(--ink);
		}

		.tableau :global(td.montant) {
			order: 1;
			font-size: var(--typo-amount-taille);
			color: var(--ink);
		}
	}
</style>
