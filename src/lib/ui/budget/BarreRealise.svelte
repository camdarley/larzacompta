<script lang="ts">
	/** La petite barre du réalisé : ses chiffres sont à côté, elle ne se lit pas (DESIGN.md). */
	let { part, depassement }: { part: number; depassement: boolean } = $props();
</script>

<progress class:depassement max="100" value={part} aria-hidden="true"></progress>

<style>
	progress {
		display: block;
		flex: none;
		width: 56px;
		height: 6px;
		border: 0;
		border-radius: var(--rayon-full);
		overflow: hidden;
		background: var(--surface-sunken);
		appearance: none;
	}

	progress::-webkit-progress-bar {
		background: var(--surface-sunken);
	}

	progress::-webkit-progress-value {
		background: var(--primary);
	}

	progress::-moz-progress-bar {
		background: var(--primary);
	}

	.depassement::-webkit-progress-value {
		background: var(--warning);
	}

	.depassement::-moz-progress-bar {
		background: var(--warning);
	}
</style>
