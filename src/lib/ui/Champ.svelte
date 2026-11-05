<script lang="ts">
	import { CircleAlert, Lock } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'value' | 'oninput'> & {
		etiquette: string;
		name: string;
		valeur?: string;
		aide?: string;
		/** Erreur venue du serveur, gardée jusqu'à la prochaine frappe. */
		erreur?: string;
		/** Contrôle à la sortie du champ : rend un message, ou rien si tout va bien. */
		controler?: (valeur: string) => string | undefined;
		lectureSeule?: boolean;
		champ?: HTMLInputElement;
		oninput?: (valeur: string) => void;
		onblur?: (e: FocusEvent) => void;
		apres?: Snippet;
		terme?: Snippet;
	};

	let {
		etiquette,
		name,
		valeur = $bindable(''),
		aide,
		erreur,
		controler,
		lectureSeule = false,
		type = 'text',
		id,
		champ = $bindable(),
		oninput,
		onblur,
		apres,
		terme,
		...reste
	}: Props = $props();

	const idAuto = $derived(id ?? `champ-${name}`);
	let erreurLocale = $state<string | undefined>();
	let erreurLevee = $state(false);
	let vu = $state(false);

	const erreurAffichee = $derived(erreurLocale ?? (erreurLevee ? undefined : erreur));
	const decrit = $derived(
		[erreurAffichee && `${idAuto}-erreur`, aide && `${idAuto}-aide`].filter(Boolean).join(' ') ||
			undefined
	);

	$effect(() => {
		// Une nouvelle erreur du serveur redevient visible.
		void erreur;
		erreurLevee = false;
	});

	function surSaisie(e: Event & { currentTarget: HTMLInputElement }) {
		valeur = e.currentTarget.value;
		erreurLevee = true;
		// Après une première erreur, le contrôle suit la frappe.
		if (vu) erreurLocale = controler?.(valeur);
		oninput?.(valeur);
	}

	function surSortie(e: FocusEvent) {
		if (valeur !== '') vu = true;
		erreurLocale = valeur === '' ? undefined : controler?.(valeur);
		onblur?.(e);
	}
</script>

<div class="champ" class:en-erreur={erreurAffichee} class:lecture={lectureSeule}>
	<div class="tete t-label">
		<label class="t-label" class:visuellement-cache={terme} for={idAuto}>{etiquette}</label>
		{@render terme?.()}
	</div>
	<div class="cadre">
		<input
			{...reste}
			bind:this={champ}
			id={idAuto}
			{name}
			{type}
			value={valeur}
			readonly={lectureSeule}
			aria-invalid={erreurAffichee ? 'true' : undefined}
			aria-describedby={decrit}
			oninput={surSaisie}
			onblur={surSortie}
		/>
		{#if lectureSeule}<Lock size={16} strokeWidth={1.75} aria-hidden="true" />{/if}
	</div>
	{@render apres?.()}
	{#if erreurAffichee}
		<p class="erreur t-caption" id="{idAuto}-erreur">
			<CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
			{erreurAffichee}
		</p>
	{/if}
	{#if aide}<p class="aide t-caption" id="{idAuto}-aide">{aide}</p>{/if}
</div>

<style>
	.champ {
		display: grid;
		gap: var(--espace-1);
		min-width: 0;
	}

	.tete {
		display: flex;
		align-items: center;
		gap: var(--espace-1);
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
	}

	input {
		width: 100%;
		min-height: var(--espace-row);
		padding: 0 var(--espace-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--rayon-sm);
		background: var(--surface-raised);
		color: var(--ink);
		font-family: inherit;
		font-size: var(--typo-body-taille);
		line-height: var(--typo-body-interligne);
	}

	.lecture input {
		background: var(--surface-sunken);
		padding-right: var(--espace-6);
	}

	.en-erreur input {
		border-color: var(--danger);
	}

	.aide {
		color: var(--ink-muted);
	}

	.erreur {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-1);
		color: var(--danger);
	}

	.erreur :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	@media (max-width: 639.98px) {
		input {
			min-height: var(--espace-touch);
		}
	}
</style>
