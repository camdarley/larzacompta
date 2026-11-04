<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	type Option = { valeur: string; libelle: string };
	type Props = {
		etiquette: string;
		name: string;
		valeur?: string;
		options: readonly Option[];
		aide?: string;
		erreur?: string;
		id?: string;
		masquerEtiquette?: boolean;
		onchange?: (valeur: string) => void;
	};

	let {
		etiquette,
		name,
		valeur = $bindable(''),
		options,
		aide,
		erreur,
		id,
		masquerEtiquette = false,
		onchange
	}: Props = $props();

	const idAuto = $derived(id ?? `champ-${name}`);
</script>

<div class="champ" class:en-erreur={erreur}>
	<label class="t-label" class:visuellement-cache={masquerEtiquette} for={idAuto}>{etiquette}</label
	>
	<div class="cadre">
		<select
			id={idAuto}
			{name}
			bind:value={valeur}
			aria-invalid={erreur ? 'true' : undefined}
			aria-describedby={aide ? `${idAuto}-aide` : undefined}
			onchange={() => onchange?.(valeur)}
		>
			{#each options as o (o.valeur)}
				<option value={o.valeur}>{o.libelle}</option>
			{/each}
		</select>
		<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
	</div>
	{#if erreur}<p class="erreur t-caption">{erreur}</p>{/if}
	{#if aide}<p class="aide t-caption" id="{idAuto}-aide">{aide}</p>{/if}
</div>

<style>
	.champ {
		display: grid;
		gap: var(--espace-1);
		min-width: 0;
	}

	.cadre {
		position: relative;
		display: flex;
		align-items: center;
	}

	.cadre :global(svg) {
		position: absolute;
		right: var(--espace-3);
		color: var(--ink-muted);
		pointer-events: none;
	}

	select {
		appearance: none;
		width: 100%;
		min-height: var(--espace-row);
		padding: 0 var(--espace-6) 0 var(--espace-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--rayon-sm);
		background: var(--surface-raised);
		color: var(--ink);
		font-family: inherit;
		font-size: var(--typo-body-taille);
	}

	.en-erreur select {
		border-color: var(--danger);
	}

	.aide {
		color: var(--ink-muted);
	}

	.erreur {
		color: var(--danger);
	}

	@media (max-width: 639.98px) {
		select {
			min-height: var(--espace-touch);
		}
	}
</style>
