<script lang="ts">
	type Props = {
		etiquette: string;
		name: string;
		valeur?: string;
		aide?: string;
		erreur?: string;
		lignes?: number;
		autocomplete?: 'street-address' | 'off';
	};

	let {
		etiquette,
		name,
		valeur = $bindable(''),
		aide,
		erreur,
		lignes = 3,
		autocomplete
	}: Props = $props();
	const id = $derived(`champ-${name}`);
</script>

<div class="champ" class:en-erreur={erreur}>
	<label class="t-label" for={id}>{etiquette}</label>
	<textarea
		{id}
		{name}
		rows={lignes}
		{autocomplete}
		bind:value={valeur}
		aria-invalid={erreur ? 'true' : undefined}
		aria-describedby={aide ? `${id}-aide` : undefined}></textarea>
	{#if erreur}<p class="erreur t-caption">{erreur}</p>{/if}
	{#if aide}<p class="aide t-caption" id="{id}-aide">{aide}</p>{/if}
</div>

<style>
	.champ {
		display: grid;
		gap: var(--espace-1);
		min-width: 0;
	}

	textarea {
		width: 100%;
		padding: var(--espace-2) var(--espace-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--rayon-sm);
		background: var(--surface-raised);
		color: var(--ink);
		font-family: inherit;
		font-size: var(--typo-body-taille);
		line-height: var(--typo-body-interligne);
		resize: vertical;
	}

	.en-erreur textarea {
		border-color: var(--danger);
	}

	.aide {
		color: var(--ink-muted);
	}

	.erreur {
		color: var(--danger);
	}
</style>
