<script lang="ts">
	import { Minus, Plus } from '@lucide/svelte';
	import { estBillet } from '#lib/domaine/caisse/index.ts';
	import { centimes, formaterMontant, type Centimes } from '#lib/domaine/montant.ts';

	type Props = {
		coupure: Centimes;
		quantite: number;
		changer: (quantite: number) => void;
		/** « Suivant » du clavier numérique. */
		suivant?: () => void;
	};

	let { coupure, quantite, changer, suivant }: Props = $props();

	const billet = $derived(estBillet(coupure));
	/** 20 pour un billet, 0,50 pour une pièce : assez court pour tenir dans la forme. */
	const valeur = $derived(
		coupure >= 100 ? String(coupure / 100) : `0,${String(coupure).padStart(2, '0')}`
	);
	const nom = $derived(`${billet ? 'Billets' : 'Pièces'} de ${formaterMontant(coupure)}`);
	const sousTotal = $derived(centimes(coupure * quantite));

	const MAX = 999_999;
	const borne = (n: number) => Math.min(MAX, Math.max(0, n));

	function pas(sens: 1 | -1) {
		const nouvelle = borne(quantite + sens);
		if (nouvelle === quantite) return;
		changer(nouvelle);
		navigator.vibrate?.(8);
	}

	// Appui long : 1 par appui, puis répété tant que le doigt reste posé.
	let attente: ReturnType<typeof setTimeout> | undefined;
	let repetition: ReturnType<typeof setInterval> | undefined;

	function relacher() {
		clearTimeout(attente);
		clearInterval(repetition);
	}

	function appui(e: PointerEvent, sens: 1 | -1) {
		if (e.button !== 0) return;
		e.preventDefault();
		relacher();
		pas(sens);
		attente = setTimeout(() => {
			repetition = setInterval(() => pas(sens), 90);
		}, 450);
	}

	/** Un lecteur d'écran ou un clavier passe par `click`, sans `pointerdown`. */
	function clic(e: MouseEvent, sens: 1 | -1) {
		if (e.detail === 0) pas(sens);
	}

	function saisir(e: Event & { currentTarget: HTMLInputElement }) {
		const champ = e.currentTarget;
		const net = champ.value.replace(/\D/g, '').slice(0, 6);
		if (champ.value !== net) champ.value = net;
		changer(net === '' ? 0 : borne(Number(net)));
	}

	function surTouche(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			suivant?.();
		}
	}

	$effect(() => relacher);
</script>

<li class="compteur-coupure">
	<span
		class="forme"
		class:billet
		class:piece={!billet}
		class:centimes={coupure < 100}
		aria-hidden="true">{valeur}</span
	>
	<div class="reglage">
		<button
			type="button"
			class="pas"
			tabindex="-1"
			aria-label="Retirer : {nom}"
			disabled={quantite === 0}
			onpointerdown={(e) => appui(e, -1)}
			onpointerup={relacher}
			onpointerleave={relacher}
			onpointercancel={relacher}
			onclick={(e) => clic(e, -1)}
			oncontextmenu={(e) => e.preventDefault()}
		>
			<Minus size={24} strokeWidth={2.25} aria-hidden="true" />
		</button>
		<input
			class="quantite"
			type="text"
			inputmode="numeric"
			pattern="[0-9]*"
			enterkeyhint="next"
			autocomplete="off"
			aria-label={nom}
			value={quantite === 0 ? '' : quantite}
			placeholder="0"
			oninput={saisir}
			onkeydown={surTouche}
			onfocus={(e) => e.currentTarget.select()}
		/>
		<button
			type="button"
			class="pas"
			tabindex="-1"
			aria-label="Ajouter : {nom}"
			onpointerdown={(e) => appui(e, 1)}
			onpointerup={relacher}
			onpointerleave={relacher}
			onpointercancel={relacher}
			onclick={(e) => clic(e, 1)}
			oncontextmenu={(e) => e.preventDefault()}
		>
			<Plus size={24} strokeWidth={2.25} aria-hidden="true" />
		</button>
	</div>
	<span class="sous-total" class:vide={quantite === 0}>{formaterMontant(sousTotal)}</span>
</li>

<style>
	.compteur-coupure {
		display: grid;
		grid-template-columns: var(--espace-touch-large) auto minmax(0, 1fr);
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-touch-large);
	}

	.forme {
		display: grid;
		place-items: center;
		height: 40px;
		background: var(--surface-sunken);
		border: 1px solid var(--border-strong);
		color: var(--ink);
		font-family: var(--typo-heading-famille);
		font-size: var(--typo-heading-taille);
		font-weight: var(--typo-heading-graisse);
		font-variant-numeric: tabular-nums;
	}

	/* « 0,50 » ne tient pas dans le cercle à la taille `heading`. */
	.forme.centimes {
		font-size: var(--typo-label-taille);
	}

	.billet {
		width: var(--espace-touch-large);
		border-radius: var(--rayon-sm);
	}

	.piece {
		justify-self: center;
		width: 48px;
		height: 48px;
		border-radius: var(--rayon-full);
	}

	.reglage {
		display: grid;
		grid-template-columns: var(--espace-touch-large) 48px var(--espace-touch-large);
		align-items: center;
	}

	.pas {
		display: grid;
		place-items: center;
		width: var(--espace-touch-large);
		height: var(--espace-touch-large);
		padding: 0;
		border: 0;
		border-radius: var(--rayon-md);
		background: var(--primary-soft);
		color: var(--primary);
		cursor: pointer;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	.pas:active:not(:disabled) {
		background: var(--primary);
		color: var(--on-primary);
	}

	.pas:disabled {
		color: var(--ink-muted);
		background: var(--surface-sunken);
		cursor: default;
	}

	.quantite {
		width: 100%;
		height: var(--espace-touch-large);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ink);
		font-family: var(--typo-amount-lg-famille);
		font-size: 22px;
		font-weight: var(--typo-amount-lg-graisse);
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.quantite::placeholder {
		color: var(--ink-muted);
		font-weight: 400;
		opacity: 1;
	}

	.quantite:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: -2px;
		border-radius: var(--rayon-sm);
	}

	.sous-total {
		font-family: var(--typo-amount-famille);
		font-size: var(--typo-amount-taille);
		font-weight: var(--typo-amount-graisse);
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}

	.vide {
		color: var(--ink-muted);
	}

	/* À 320 px, le sous-total passe sous la rangée : les boutons gardent leurs 56 px. */
	@media (max-width: 389.98px) {
		.compteur-coupure {
			grid-template-columns: var(--espace-touch-large) minmax(0, 1fr);
			row-gap: 0;
		}

		.reglage {
			justify-self: end;
		}

		.sous-total {
			grid-column: 2;
			padding-right: var(--espace-1);
			font-size: var(--typo-caption-taille);
		}

		.sous-total.vide {
			display: none;
		}
	}
</style>
