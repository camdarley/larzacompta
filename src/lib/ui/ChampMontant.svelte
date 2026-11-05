<script lang="ts">
	import {
		formaterMontant,
		formaterSaisie,
		lireMontant,
		type Centimes
	} from '#lib/domaine/montant.ts';
	import { CircleAlert, Lock } from '@lucide/svelte';
	import { message } from '#lib/messages.ts';

	type Props = {
		etiquette: string;
		name: string;
		valeur?: string;
		aide?: string;
		erreur?: string;
		id?: string;
		/** Valeur insérée par la touche `=`, le reste à répartir par exemple. */
		reste?: Centimes;
		lectureSeule?: boolean;
		masquerEtiquette?: boolean;
		required?: boolean;
		placeholder?: string;
		oninput?: () => void;
		onsortie?: () => void;
		terme?: import('svelte').Snippet;
	};

	let {
		etiquette,
		name,
		valeur = $bindable(''),
		aide,
		erreur,
		id,
		reste,
		lectureSeule = false,
		masquerEtiquette = false,
		required = false,
		placeholder,
		oninput,
		onsortie,
		terme
	}: Props = $props();

	const idAuto = $derived(id ?? `champ-${name}`);
	let erreurLocale = $state<string | undefined>();
	let enCours = $state(false);

	const lecture = $derived(valeur.trim() === '' ? null : lireMontant(valeur));
	const formule = $derived(/\d\s*[+\-−]\s*\d/.test(valeur) ? lecture : null);
	/** L'erreur venue du parent se corrige en direct, comme un champ texte (EXPERIENCE.md). */
	let corrigee = $state(false);
	$effect.pre(() => {
		void erreur;
		corrigee = false;
	});
	const erreurAffichee = $derived(
		erreurLocale ?? (corrigee && valeur.trim() !== '' ? undefined : erreur)
	);
	const decrit = $derived(
		[erreurAffichee && `${idAuto}-erreur`, aide && `${idAuto}-aide`].filter(Boolean).join(' ') ||
			undefined
	);

	function surSortie() {
		enCours = false;
		if (lecture === null) {
			erreurLocale = undefined;
		} else if (lecture.ok) {
			erreurLocale = undefined;
			valeur = formaterSaisie(lecture.valeur);
		} else {
			erreurLocale = message('montant_invalide');
		}
		onsortie?.();
	}

	function surTouche(e: KeyboardEvent) {
		if (e.key === '=' && reste !== undefined) {
			e.preventDefault();
			valeur = formaterSaisie(reste);
			corrigee = true;
			oninput?.();
		}
	}
</script>

<div class="champ" class:en-erreur={erreurAffichee}>
	<div class="tete t-label">
		<label class="t-label" class:visuellement-cache={masquerEtiquette || terme} for={idAuto}
			>{etiquette}</label
		>
		{@render terme?.()}
	</div>
	<div class="cadre" class:lecture={lectureSeule}>
		<input
			id={idAuto}
			{name}
			type="text"
			inputmode="decimal"
			autocomplete="off"
			bind:value={valeur}
			readonly={lectureSeule}
			{required}
			{placeholder}
			aria-invalid={erreurAffichee ? 'true' : undefined}
			aria-describedby={decrit}
			onfocus={() => (enCours = true)}
			onblur={surSortie}
			onkeydown={surTouche}
			oninput={() => {
				erreurLocale = undefined;
				corrigee = true;
				oninput?.();
			}}
		/>
		{#if lectureSeule}
			<Lock size={16} strokeWidth={1.75} aria-hidden="true" />
		{:else}
			<span class="symbole" aria-hidden="true">€</span>
		{/if}
	</div>
	{#if enCours && formule?.ok}
		<p class="t-caption t-muted" aria-live="polite">= {formaterMontant(formule.valeur)}</p>
	{/if}
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

	.cadre :global(svg) {
		position: absolute;
		right: var(--espace-3);
		color: var(--ink-muted);
	}

	.cadre {
		position: relative;
		display: flex;
		align-items: center;
	}

	input {
		width: 100%;
		min-height: var(--espace-row);
		padding: 0 var(--espace-6) 0 var(--espace-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--rayon-sm);
		background: var(--surface-raised);
		color: var(--ink);
		font-family: inherit;
		font-size: var(--typo-amount-taille);
		font-weight: var(--typo-amount-graisse);
		font-variant-numeric: tabular-nums lining-nums;
		text-align: right;
	}

	input::placeholder {
		color: var(--ink-muted);
		opacity: 1;
	}

	.lecture input {
		background: var(--surface-sunken);
	}

	.en-erreur input {
		border-color: var(--danger);
	}

	.symbole {
		position: absolute;
		right: var(--espace-3);
		color: var(--ink-muted);
		pointer-events: none;
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
