<script lang="ts" module>
	export type OptionRecherche = { id: number; libelle: string; detail?: string };
</script>

<script lang="ts">
	import { CircleAlert, ChevronDown, Lock, Plus, Sparkles } from '@lucide/svelte';
	import { normaliser } from '#lib/domaine/operations/suggestions.ts';
	import type { Snippet } from 'svelte';

	type Props = {
		etiquette: string;
		id: string;
		options: readonly OptionRecherche[];
		valeur?: number | null;
		/** Premiers de la liste quand rien n'est tapé. */
		recents?: readonly number[];
		/** Libellé du choix vide, « Sans Action ». Absent : le choix est obligatoire. */
		sansValeur?: string;
		/** Création à la volée : renvoie l'identifiant créé, ou rien en cas d'échec. */
		creer?: (texte: string) => Promise<number | null>;
		libelleCreer?: (texte: string) => string;
		/** Recherche déportée, pour les Opérations. */
		chercher?: (texte: string) => Promise<OptionRecherche[]>;
		/** Valeur suggérée, pas encore acceptée. Tab accepte, taper remplace. */
		suggere?: boolean;
		descriptionId?: string;
		onaccepter?: () => void;
		onchange?: (id: number | null) => void;
		/** `Entrée` sans liste ouverte : ajoute une Ligne depuis la dernière colonne. */
		onfin?: () => void;
		erreur?: string;
		aide?: string;
		lectureSeule?: boolean;
		masquerEtiquette?: boolean;
		placeholder?: string;
		terme?: Snippet;
	};

	let {
		etiquette,
		id,
		options,
		valeur = $bindable(null),
		recents = [],
		sansValeur,
		creer,
		libelleCreer,
		chercher,
		suggere = false,
		descriptionId,
		onaccepter,
		onchange,
		onfin,
		erreur,
		aide,
		lectureSeule = false,
		masquerEtiquette = false,
		placeholder,
		terme
	}: Props = $props();

	type Choix =
		| { type: 'option'; option: OptionRecherche }
		| { type: 'vide'; libelle: string }
		| { type: 'creer'; libelle: string; texte: string };

	let saisie = $state<string | null>(null);
	let ouvert = $state(false);
	let active = $state(0);
	let distants = $state<OptionRecherche[]>([]);
	/** Libellé retenu d'une recherche déportée : l'option n'est plus dans la liste ensuite. */
	let retenu = $state<OptionRecherche | null>(null);
	let cadre = $state<HTMLElement | null>(null);
	let position = $state<{
		left: string;
		width: string;
		top?: string;
		bottom?: string;
		maxHeight: string;
	} | null>(null);

	const idListe = $derived(`${id}-liste`);
	const libelleChoisi = $derived.by(() => {
		if (valeur === null) return '';
		return (
			options.find((o) => o.id === valeur)?.libelle ?? (retenu?.id === valeur ? retenu.libelle : '')
		);
	});
	const affiche = $derived(saisie ?? (valeur === null && sansValeur ? '' : libelleChoisi));

	function ordonner(liste: readonly OptionRecherche[]) {
		const rang = (o: OptionRecherche) => {
			const r = recents.indexOf(o.id);
			return r === -1 ? recents.length : r;
		};
		return [...liste].sort((a, b) => rang(a) - rang(b));
	}

	const choix = $derived.by((): Choix[] => {
		const q = normaliser(saisie ?? '');
		if (chercher) return distants.map((option) => ({ type: 'option', option }));
		const filtrees = options.filter((o) => normaliser(o.libelle).includes(q));
		const liste: Choix[] = (q === '' ? ordonner(filtrees) : filtrees).map((option) => ({
			type: 'option',
			option
		}));
		if (sansValeur && q === '') liste.unshift({ type: 'vide', libelle: sansValeur });
		const exact = options.some((o) => normaliser(o.libelle) === q);
		if (creer && libelleCreer && q !== '' && !exact) {
			const texte = (saisie ?? '').trim();
			liste.push({ type: 'creer', libelle: libelleCreer(texte), texte });
		}
		return liste;
	});

	function placer() {
		if (!cadre) return;
		const r = cadre.getBoundingClientRect();
		const dessous = window.innerHeight - r.bottom - 8;
		const dessus = r.top - 8;
		const enHaut = dessous < 180 && dessus > dessous;
		position = {
			left: `${r.left}px`,
			width: `${Math.max(r.width, 220)}px`,
			...(enHaut
				? { bottom: `${window.innerHeight - r.top + 4}px` }
				: { top: `${r.bottom + 4}px` }),
			maxHeight: `${Math.min(280, enHaut ? dessus : dessous)}px`
		};
	}

	function ouvrir() {
		if (lectureSeule) return;
		placer();
		active = 0;
		ouvert = true;
	}

	function fermer() {
		ouvert = false;
		saisie = null;
	}

	$effect(() => {
		if (!ouvert) return;
		const suivre = () => placer();
		window.addEventListener('scroll', suivre, true);
		window.addEventListener('resize', suivre);
		return () => {
			window.removeEventListener('scroll', suivre, true);
			window.removeEventListener('resize', suivre);
		};
	});

	let attente: ReturnType<typeof setTimeout> | undefined;

	function surSaisie(e: Event & { currentTarget: HTMLInputElement }) {
		saisie = e.currentTarget.value;
		active = 0;
		if (!ouvert) ouvrir();
		if (chercher) {
			clearTimeout(attente);
			const texte = saisie;
			attente = setTimeout(async () => {
				distants = await chercher(texte);
			}, 150);
		}
	}

	function choisir(c: Choix) {
		if (c.type === 'creer') {
			creer?.(c.texte).then((cree) => {
				if (cree !== null) {
					valeur = cree;
					onchange?.(cree);
				}
			});
		} else {
			const id = c.type === 'option' ? c.option.id : null;
			if (c.type === 'option' && chercher) retenu = c.option;
			valeur = id;
			onchange?.(id);
		}
		fermer();
	}

	function surTouche(e: KeyboardEvent) {
		if (lectureSeule) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!ouvert) {
				ouvrir();
				return;
			}
			const n = choix.length;
			if (n > 0) active = (active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
		} else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			const c = choix[active];
			if (ouvert && c) choisir(c);
			else onfin?.();
		} else if (e.key === 'Escape' && ouvert) {
			// Seule la liste se ferme : le panneau reste ouvert.
			e.stopPropagation();
			fermer();
		} else if (e.key === 'Tab') {
			const c = choix[active];
			if (ouvert && saisie !== null && saisie !== '' && c) choisir(c);
			else fermer();
			if (suggere) onaccepter?.();
		}
	}

	function surSortie(e: FocusEvent) {
		if (!cadre?.contains(e.relatedTarget as Node)) fermer();
	}

	function surFocus(e: FocusEvent & { currentTarget: HTMLInputElement }) {
		e.currentTarget.select();
	}

	const decrit = $derived(
		[erreur && `${id}-erreur`, descriptionId, aide && `${id}-aide`].filter(Boolean).join(' ') ||
			undefined
	);
</script>

<div class="selecteur" class:en-erreur={erreur} class:lecture={lectureSeule}>
	<div class="tete t-label">
		<label class="t-label" class:visuellement-cache={masquerEtiquette || terme} for={id}
			>{etiquette}</label
		>
		{@render terme?.()}
	</div>
	<div class="cadre" bind:this={cadre} onfocusout={surSortie}>
		<input
			{id}
			type="text"
			role="combobox"
			autocomplete="off"
			aria-autocomplete="list"
			aria-expanded={ouvert}
			aria-controls={ouvert ? idListe : undefined}
			aria-activedescendant={ouvert && choix[active] ? `${id}-option-${active}` : undefined}
			aria-invalid={erreur ? 'true' : undefined}
			aria-describedby={decrit}
			readonly={lectureSeule}
			placeholder={placeholder ?? (valeur === null ? sansValeur : undefined)}
			class:suggere
			value={affiche}
			oninput={surSaisie}
			onkeydown={surTouche}
			onfocus={surFocus}
			onclick={() => (ouvert ? null : ouvrir())}
		/>
		{#if lectureSeule}
			<Lock size={16} strokeWidth={1.75} aria-hidden="true" />
		{:else if suggere}
			<Sparkles class="etincelle" size={16} strokeWidth={1.75} aria-hidden="true" />
		{:else}
			<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
		{/if}

		{#if ouvert}
			<ul
				id={idListe}
				role="listbox"
				aria-label={etiquette}
				class="liste"
				style:left={position?.left}
				style:width={position?.width}
				style:top={position?.top}
				style:bottom={position?.bottom}
				style:max-height={position?.maxHeight}
			>
				{#each choix as c, i (i)}
					<!-- Le clic ne doit pas retirer le focus du champ avant d'être pris en compte. -->
					<li
						id="{id}-option-{i}"
						role="option"
						aria-selected={i === active}
						class:active={i === active}
						class:creation={c.type === 'creer'}
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => choisir(c)}
						onkeydown={() => {}}
					>
						{#if c.type === 'option'}
							<span>{c.option.libelle}</span>
							{#if c.option.detail}<span class="detail t-caption">{c.option.detail}</span>{/if}
						{:else if c.type === 'creer'}
							<Plus size={16} strokeWidth={1.75} aria-hidden="true" />
							<span>{c.libelle}</span>
						{:else}
							<span class="t-muted">{c.libelle}</span>
						{/if}
					</li>
				{:else}
					<li class="rien t-caption" role="option" aria-selected="false" aria-disabled="true">
						Rien ne correspond
					</li>
				{/each}
			</ul>
		{/if}
	</div>
	{#if erreur}
		<p class="erreur t-caption" id="{id}-erreur">
			<CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
			{erreur}
		</p>
	{/if}
	{#if aide}<p class="aide t-caption" id="{id}-aide">{aide}</p>{/if}
</div>

<style>
	.selecteur {
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

	.cadre > :global(svg) {
		position: absolute;
		right: var(--espace-3);
		color: var(--ink-muted);
		pointer-events: none;
	}

	.cadre > :global(.etincelle) {
		color: var(--primary);
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
		font-size: var(--typo-body-taille);
		text-overflow: ellipsis;
	}

	input::placeholder {
		color: var(--ink-muted);
		opacity: 1;
	}

	input.suggere {
		background: var(--primary-soft);
	}

	.lecture input {
		background: var(--surface-sunken);
	}

	.en-erreur input {
		border-color: var(--danger);
	}

	.liste {
		position: fixed;
		z-index: 45;
		overflow-y: auto;
		padding: var(--espace-1);
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-raised);
		box-shadow: var(--elevation-flottant);
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-2);
		min-height: var(--espace-row);
		padding: var(--espace-1) var(--espace-3);
		border-radius: var(--rayon-sm);
		color: var(--ink);
		cursor: pointer;
	}

	li.active {
		background: var(--primary-soft);
	}

	li.creation {
		justify-content: flex-start;
		color: var(--primary);
		font-weight: var(--typo-label-graisse);
	}

	li.rien {
		color: var(--ink-muted);
		cursor: default;
	}

	.detail {
		flex: none;
		color: var(--ink-muted);
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

		li {
			min-height: var(--espace-touch);
		}
	}
</style>
