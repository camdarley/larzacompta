<script lang="ts">
	import { goto } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import { CalendarRange, ListTree, Search, Terminal } from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontant, formaterMontantSigne } from '#lib/domaine/montant.ts';
	import type { RangeeOperation } from '#lib/domaine/operations/vues.ts';
	import { normaliser } from '#lib/domaine/operations/suggestions.ts';
	import type { Entree } from '#lib/fonctions.ts';
	import { demander } from './api.ts';
	import Icone from './Icone.svelte';
	import { urlAvec } from './url.ts';

	type Props = {
		ouvert?: boolean;
		entrees: readonly Entree[];
		peutSaisir: boolean;
		lien: (href: string) => string;
		ouvrirRaccourcis: () => void;
	};

	let { ouvert = $bindable(false), entrees, peutSaisir, lien, ouvrirRaccourcis }: Props = $props();

	type Choix = {
		cle: string;
		libelle: string;
		detail?: string;
		lancer: () => void;
		entree?: Entree;
	};
	type Groupe = { titre: string; icone: typeof Search; choix: Choix[] };

	let texte = $state('');
	let active = $state(0);
	let distant = $state<{
		operations: RangeeOperation[];
		actions: { id: number; libelle: string }[];
	}>({ operations: [], actions: [] });
	let champ = $state<HTMLInputElement | null>(null);

	const trouve = (libelle: string) => normaliser(libelle).includes(normaliser(texte));
	const aller = (href: string) => () => goto(href);

	const commandes = $derived(
		[
			...(peutSaisir
				? [
						{
							cle: 'nouvelle',
							libelle: 'Nouvelle Opération',
							lancer: aller(urlAvec({ op: 'nouvelle' }))
						}
					]
				: []),
			{ cle: 'preferences', libelle: 'Préférences', lancer: aller('/preferences') },
			{ cle: 'raccourcis', libelle: 'Raccourcis du clavier', lancer: ouvrirRaccourcis }
		].filter((c) => trouve(c.libelle))
	);

	const groupes = $derived.by((): Groupe[] => {
		const liste: Groupe[] = [
			{
				titre: 'Écrans',
				icone: ListTree,
				choix: entrees
					.filter((e) => trouve(e.libelle))
					.map((e) => ({
						cle: `ecran-${e.href}`,
						libelle: e.libelle,
						lancer: aller(lien(e.href)),
						entree: e
					}))
			},
			{ titre: 'Commandes', icone: Terminal, choix: commandes },
			{
				titre: 'Opérations',
				icone: Search,
				choix: distant.operations.map((o) => ({
					cle: `op-${o.id}`,
					libelle: o.ligneTrouvee ?? o.libelle,
					detail: `${formaterDateCourte(o.date)}, ${o.genre === 'interne' ? formaterMontant(o.montant) : formaterMontantSigne(o.montant)}`,
					lancer: aller(urlAvec({ op: String(o.id) }))
				}))
			},
			{
				titre: 'Actions',
				icone: CalendarRange,
				choix: distant.actions.map((a) => ({
					cle: `action-${a.id}`,
					libelle: a.libelle,
					lancer: aller(lien(`/actions/${a.id}`))
				}))
			}
		];
		return liste.filter((g) => g.choix.length > 0);
	});

	const aplatis = $derived(groupes.flatMap((g) => g.choix));

	let attente: ReturnType<typeof setTimeout> | undefined;

	function vider() {
		clearTimeout(attente);
		texte = '';
		active = 0;
		distant = { operations: [], actions: [] };
	}

	// Fermée, quel que soit le geste : la recherche suivante repart d'un champ vide.
	$effect(() => {
		if (!ouvert) vider();
	});

	function surSaisie() {
		active = 0;
		clearTimeout(attente);
		const q = texte;
		if (q.trim() === '') {
			distant = { operations: [], actions: [] };
			return;
		}
		attente = setTimeout(async () => {
			const r = await demander<typeof distant>(`/api/palette?q=${encodeURIComponent(q)}`);
			if (r.type === 'ok' && q === texte) distant = r.valeur;
		}, 120);
	}

	function lancer(c: Choix | undefined) {
		if (!c) return;
		ouvert = false;
		c.lancer();
	}

	function surTouche(e: KeyboardEvent) {
		const n = aplatis.length;
		if (e.key === 'ArrowDown' && n > 0) {
			e.preventDefault();
			active = (active + 1) % n;
		} else if (e.key === 'ArrowUp' && n > 0) {
			e.preventDefault();
			active = (active + n - 1) % n;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			lancer(aplatis[active]);
		}
	}

	const rang = (c: Choix) => aplatis.indexOf(c);
	const selection = $derived(aplatis[active]);
</script>

<Dialog.Root bind:open={ouvert}>
	<Dialog.Portal>
		<Dialog.Overlay class="ape-voile ape-voile-haut" />
		<Dialog.Content
			class="ape-palette"
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				champ?.focus();
			}}
		>
			<Dialog.Title class="visuellement-cache">Recherche globale</Dialog.Title>
			<div class="champ">
				<Search size={20} strokeWidth={1.75} aria-hidden="true" />
				<input
					bind:this={champ}
					bind:value={texte}
					type="text"
					role="combobox"
					autocomplete="off"
					aria-label="Chercher un écran, une Opération, une Action"
					aria-expanded={aplatis.length > 0}
					aria-controls="palette-liste"
					aria-activedescendant={selection ? `palette-${selection.cle}` : undefined}
					placeholder="Un écran, une Opération, un montant…"
					oninput={surSaisie}
					onkeydown={surTouche}
				/>
			</div>
			<div id="palette-liste" role="listbox" aria-label="Résultats" class="resultats">
				{#each groupes as g (g.titre)}
					<div role="group" aria-labelledby="palette-groupe-{g.titre}">
						<p class="t-caption t-muted titre" id="palette-groupe-{g.titre}">{g.titre}</p>
						{#each g.choix as c (c.cle)}
							<!-- Le clic ne doit pas retirer le focus du champ. -->
							<div
								id="palette-{c.cle}"
								role="option"
								tabindex="-1"
								aria-selected={rang(c) === active}
								class="choix"
								class:active={rang(c) === active}
								onpointerdown={(e) => e.preventDefault()}
								onclick={() => lancer(c)}
								onkeydown={() => {}}
							>
								{#if c.entree}
									<Icone nom={c.entree.icone} />
								{:else}
									<g.icone size={20} strokeWidth={1.75} aria-hidden="true" />
								{/if}
								<span class="libelle">{c.libelle}</span>
								{#if c.detail}<span class="detail t-caption t-muted">{c.detail}</span>{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="rien t-muted">Rien ne correspond.</p>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.ape-palette) {
		position: fixed;
		z-index: 51;
		top: 12vh;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		width: min(640px, calc(100vw - 2 * var(--espace-page-mobile)));
		max-height: 70vh;
		overflow: hidden;
		border-radius: var(--rayon-xl);
		background: var(--surface-raised);
		box-shadow: var(--elevation-superpose);
	}

	.champ {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		padding: var(--espace-3) var(--espace-4);
		border-bottom: 1px solid var(--border);
		color: var(--ink-muted);
	}

	input {
		flex: 1;
		min-width: 0;
		min-height: var(--espace-row);
		border: 0;
		background: transparent;
		color: var(--ink);
		font-family: inherit;
		font-size: var(--typo-heading-taille);
		font-weight: var(--typo-heading-graisse);
		outline: none;
	}

	input::placeholder {
		color: var(--ink-muted);
		opacity: 1;
		font-weight: var(--typo-body-graisse);
	}

	.resultats {
		overflow-y: auto;
		padding: var(--espace-2);
	}

	.titre {
		padding: var(--espace-2) var(--espace-3) var(--espace-1);
	}

	.choix {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-row);
		padding: var(--espace-1) var(--espace-3);
		border-radius: var(--rayon-sm);
		cursor: pointer;
	}

	.choix :global(svg) {
		flex: none;
		color: var(--ink-muted);
	}

	.choix.active {
		background: var(--primary-soft);
		color: var(--primary);
	}

	.choix.active :global(svg) {
		color: var(--primary);
	}

	.libelle {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail {
		flex: none;
	}

	@media (max-width: 639.98px) {
		.choix {
			flex-wrap: wrap;
			padding-block: var(--espace-2);
		}

		.libelle {
			flex-basis: calc(100% - 32px);
			white-space: normal;
		}

		.detail {
			margin-left: 28px;
		}
	}

	.rien {
		padding: var(--espace-4);
		text-align: center;
	}
</style>
