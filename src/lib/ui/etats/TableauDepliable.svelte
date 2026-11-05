<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ChevronRight, FileText, Image as IconeImage } from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import {
		aplatir,
		basculer,
		lireOuvertes,
		type Noeud,
		type Rangee
	} from '#lib/domaine/etats/arbre.ts';
	import {
		formaterMontant,
		formaterMontantSigne,
		lectureMontant,
		type Centimes
	} from '#lib/domaine/montant.ts';
	import type { PieceJ } from '#lib/domaine/journal.ts';
	import Panneau from '#lib/ui/Panneau.svelte';
	import Pastille from '#lib/ui/Pastille.svelte';
	import VisionneusePiece from '#lib/ui/piece/VisionneusePiece.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	type Props = {
		noeuds: Noeud[];
		legende: string;
		/** Exercice regardé : une Ligne rattachée ailleurs porte sa `pastille`. */
		exerciceId?: number | null;
		nomExercice?: (id: number) => string;
		/** Sur téléphone, seuls Libellé et Résultat restent (États). */
		reduit?: boolean;
		/** Chemin d'une Action, pour rejoindre sa page depuis sa rangée. */
		hrefAction?: (id: number) => string;
		/** Une colonne de Résultat par Exercice comparé, sur ordinateur seulement (FR-34). */
		colonnesComparees?: readonly { exerciceId: number; libelle: string }[];
	};

	let {
		noeuds,
		legende,
		exerciceId = null,
		nomExercice = () => '',
		reduit = false,
		hrefAction,
		colonnesComparees = []
	}: Props = $props();

	const ouvertes = $derived(lireOuvertes(page.url.searchParams.get('ouvert')));
	const rangees = $derived(aplatir(noeuds, ouvertes));

	/** Un seul arrêt de tabulation : les flèches parcourent ensuite la grille. */
	let active = $state<string | null>(null);
	const arret = $derived(rangees.some((r) => r.cle === active) ? active : rangees[0]?.cle);
	let corps = $state<HTMLElement | null>(null);

	const urlBascule = (cle: string) => {
		const suite = basculer(ouvertes, cle);
		return urlAvec({ ouvert: suite === '' ? null : suite });
	};

	function deplier(r: Rangee) {
		// `reset: false` garde le défilement et le focus : seule la rangée change d'état.
		active = r.cle;
		return goto(urlBascule(r.cle), { reset: false, replaceState: true });
	}

	function focaliser(cle: string | undefined) {
		if (cle === undefined) return;
		active = cle;
		corps?.querySelector<HTMLElement>(`tr[data-cle="${cle}"]`)?.focus();
	}

	function surTouche(e: KeyboardEvent) {
		const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-cle]');
		// Une touche tapée sur un lien de la rangée garde son sens, sauf les flèches.
		const r = rangees.find((x) => x.cle === tr?.dataset.cle);
		if (r === undefined) return;
		const i = rangees.indexOf(r);
		const faire: Record<string, () => void> = {
			ArrowDown: () => focaliser(rangees[i + 1]?.cle),
			ArrowUp: () => focaliser(rangees[i - 1]?.cle),
			Home: () => focaliser(rangees[0]?.cle),
			End: () => focaliser(rangees.at(-1)?.cle),
			ArrowRight: () => {
				if (r.depliable && !r.deplie) deplier(r);
				else if (r.deplie) focaliser(rangees[i + 1]?.cle);
			},
			ArrowLeft: () => {
				if (r.deplie) deplier(r);
				else focaliser(r.parent ?? undefined);
			},
			Enter: () => activer(r, tr as HTMLElement),
			' ': () => activer(r, tr as HTMLElement)
		};
		const action = faire[e.key];
		if (action === undefined || (e.key === 'Enter' && e.target !== tr)) return;
		if (e.key === ' ' && e.target !== tr) return;
		e.preventDefault();
		action();
	}

	function activer(r: Rangee, tr: HTMLElement) {
		if (r.depliable) deplier(r);
		else tr.querySelector<HTMLElement>('a.ouvrir')?.click();
	}

	/** Toute la rangée est cliquable, un vrai lien reste dedans pour le clavier. */
	function surClic(e: MouseEvent, r: Rangee) {
		if ((e.target as HTMLElement).closest('a, button')) return;
		active = r.cle;
		if (r.depliable) deplier(r);
		else (e.currentTarget as HTMLElement).querySelector<HTMLElement>('a.ouvrir')?.click();
	}

	const montant = (r: Rangee, c: Centimes) =>
		r.absent || (c === 0 && (r.type === 'nature' || r.type === 'ligne')) ? '' : formaterMontant(c);

	/** La Pièce regardée vit dans l'URL : recharger rouvre la même visionneuse. */
	function piecesDe(liste: readonly Noeud[]): PieceJ[] {
		return liste.flatMap((n) => [...(n.ligne?.pieces ?? []), ...piecesDe(n.enfants)]);
	}
	const sha = $derived(page.url.searchParams.get('visionneuse'));
	const piece = $derived(
		sha === null ? null : (piecesDe(noeuds).find((p) => p.sha256 === sha) ?? null)
	);
</script>

{#snippet cellule(texte: string, c: Centimes)}
	{#if texte !== ''}
		<span class="visuellement-cache">{lectureMontant(c)}</span>
		<span aria-hidden="true">{texte}</span>
	{/if}
{/snippet}

<div class="conteneur" class:reduit class:compare={colonnesComparees.length > 0}>
	<!-- `treegrid` explicite : la mise en page téléphone retire au tableau ses rôles implicites. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
	<table role="treegrid" aria-label={legende} class="depliable">
		<thead>
			<!-- svelte-ignore a11y_no_redundant_roles -->
			<tr role="row">
				<th role="columnheader" scope="col">Libellé</th>
				<th role="columnheader" scope="col" class="droite col-detail">Recettes</th>
				<th role="columnheader" scope="col" class="droite col-detail">Dépenses</th>
				<th role="columnheader" scope="col" class="droite">Résultat</th>
				{#each colonnesComparees as c (c.exerciceId)}
					<th role="columnheader" scope="col" class="droite col-comparee">
						<span class="visuellement-cache">Résultat</span>
						{c.libelle}
					</th>
				{/each}
			</tr>
		</thead>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<tbody bind:this={corps} onkeydown={surTouche}>
			{#each rangees as r (r.cle)}
				<!-- Le clavier passe par `surTouche`, sur le corps du tableau. -->
				<!-- svelte-ignore a11y_no_redundant_roles -->
				<tr
					role="row"
					class="rangee {r.type} niveau-{r.niveau}"
					class:absente={r.absent}
					class:total={r.cle === 'total'}
					data-cle={r.cle}
					aria-level={r.niveau}
					aria-posinset={r.rang}
					aria-setsize={r.freres}
					aria-expanded={r.depliable ? r.deplie : undefined}
					tabindex={r.cle === arret ? 0 : -1}
					onclick={(e) => surClic(e, r)}
					onfocus={() => (active = r.cle)}
				>
					<td role="gridcell" class="libelle">
						<span class="tete">
							{#if r.depliable}
								<!-- Pour la souris et le doigt : la rangée porte déjà `aria-expanded`. -->
								<a
									class="chevron"
									class:deplie={r.deplie}
									href={urlBascule(r.cle)}
									aria-hidden="true"
									tabindex="-1"
									data-sveltekit-reset="false"
									data-sveltekit-replacestate
									data-sveltekit-noscroll
								>
									<ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
								</a>
							{:else}
								<span class="chevron vide"></span>
							{/if}
							{#if r.ligne}
								<span class="date t-caption">{formaterDateCourte(r.ligne.date)}</span>
								<a
									class="ouvrir"
									href={urlAvec({ op: String(r.ligne.operationId) })}
									data-sveltekit-reset="false"
									tabindex="-1">{r.libelle}</a
								>
								{#each r.ligne.pieces as p (p.id)}
									<a
										class="piece"
										href={urlAvec({ visionneuse: p.sha256 })}
										aria-label="Ouvrir la Pièce {p.nomOriginal}"
										data-sveltekit-reset="false"
										tabindex="-1"
									>
										{#if p.mime === 'application/pdf'}
											<FileText size={18} strokeWidth={1.75} aria-hidden="true" />
										{:else}
											<IconeImage size={18} strokeWidth={1.75} aria-hidden="true" />
										{/if}
									</a>
								{/each}
								{#if exerciceId !== null && r.ligne.exerciceRattachementId !== exerciceId}
									<Pastille
										etat="rattachee"
										texte="Sur {nomExercice(r.ligne.exerciceRattachementId)}"
									/>
								{/if}
							{:else if r.actionId !== undefined && hrefAction}
								<a class="nom" href={hrefAction(r.actionId)} tabindex="-1">{r.libelle}</a>
							{:else}
								<span class="nom">{r.libelle}</span>
							{/if}
						</span>
						<!-- Sur téléphone, Recettes et Dépenses passent sous le nom. -->
						{#if r.type !== 'ligne' && (r.recettes !== 0 || r.depenses !== 0)}
							<span class="detail-telephone t-caption" aria-hidden="true">
								{#if r.recettes !== 0}<span>Recettes {formaterMontant(r.recettes)}</span>{/if}
								{#if r.depenses !== 0}<span>Dépenses {formaterMontant(r.depenses)}</span>{/if}
							</span>
						{/if}
					</td>
					<td role="gridcell" class="montant col-detail">
						{@render cellule(montant(r, r.recettes), r.recettes)}
					</td>
					<td role="gridcell" class="montant col-detail">
						{@render cellule(montant(r, r.depenses), r.depenses)}
					</td>
					<td role="gridcell" class="montant resultat">
						{@render cellule(r.absent ? '' : formaterMontantSigne(r.resultat), r.resultat)}
					</td>
					{#each colonnesComparees as c, i (c.exerciceId)}
						{@const valeur = r.comparaisons?.[i] ?? null}
						<td role="gridcell" class="montant resultat col-comparee">
							{#if valeur !== null}{@render cellule(formaterMontantSigne(valeur), valeur)}{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<Panneau
	ouvert={piece !== null}
	titre={piece?.nomOriginal ?? ''}
	fermer={() => changerUrl({ visionneuse: null })}
	sansConfirmation
	lecture
>
	{#if piece}<VisionneusePiece {piece} />{/if}
</Panneau>

<style>
	.conteneur {
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
		overflow: hidden;
	}

	/* Une colonne de plus par Exercice : au-delà de la largeur, le tableau défile, pas la page. */
	.conteneur.compare {
		overflow-x: auto;
	}

	.depliable {
		width: 100%;
		border-collapse: collapse;
	}

	.col-comparee {
		color: var(--ink-muted);
		white-space: nowrap;
	}

	.total {
		cursor: default;
		font-weight: var(--typo-body-strong-graisse);
	}

	.total td {
		border-top: 1px solid var(--ink);
	}

	.total .montant {
		font-weight: var(--typo-body-strong-graisse);
	}

	th {
		padding: var(--espace-2) var(--espace-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--typo-label-taille);
		font-weight: var(--typo-label-graisse);
		color: var(--ink-muted);
		text-align: left;
		white-space: nowrap;
	}

	th.droite {
		text-align: right;
	}

	td {
		height: var(--espace-row);
		padding: var(--espace-1) var(--espace-3);
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}

	tbody tr:last-child td {
		border-bottom: 0;
	}

	.rangee {
		cursor: default;
	}

	.rangee[aria-expanded],
	.rangee.ligne {
		cursor: pointer;
	}

	.rangee:hover {
		background: var(--surface-sunken);
	}

	.rangee:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: -2px;
	}

	.groupe,
	.section,
	.action {
		font-weight: var(--typo-body-strong-graisse);
	}

	.groupe .montant,
	.section .montant,
	.action .montant {
		font-weight: var(--typo-body-strong-graisse);
	}

	.niveau-2 .libelle {
		padding-left: calc(var(--espace-3) + var(--espace-5));
	}

	.niveau-3 .libelle {
		padding-left: calc(var(--espace-3) + 2 * var(--espace-5));
	}

	.niveau-4 .libelle {
		padding-left: calc(var(--espace-3) + 3 * var(--espace-5));
	}

	.tete {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0 var(--espace-2);
		min-width: 0;
	}

	.chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 24px;
		height: 24px;
		color: var(--ink-muted);
		transition: transform 120ms ease-out;
	}

	.chevron.deplie {
		transform: rotate(90deg);
	}

	.nom {
		color: var(--ink);
		text-decoration: none;
		min-width: 0;
	}

	a.nom:hover {
		color: var(--primary);
		text-decoration: underline;
	}

	.date {
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums lining-nums;
	}

	.ouvrir {
		min-width: 0;
	}

	.piece {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--rayon-sm);
		color: var(--primary);
	}

	.piece:hover {
		background: var(--primary-soft);
	}

	.detail-telephone {
		display: none;
	}

	.resultat {
		white-space: nowrap;
	}

	.col-detail {
		white-space: nowrap;
	}

	@media (max-width: 639.98px) {
		.conteneur,
		.conteneur.compare {
			overflow: visible;
		}

		/* Sur téléphone, seul l'Exercice regardé reste (EXPERIENCE.md). */
		.col-comparee,
		.absente,
		.total {
			display: none !important;
		}

		thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		.col-detail {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		tbody tr {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: var(--espace-2);
			min-height: var(--espace-touch);
			padding: var(--espace-2) var(--espace-3);
			border-bottom: 1px solid var(--border);
		}

		tbody tr:last-child {
			border-bottom: 0;
		}

		td {
			height: auto;
			padding: 0;
			border-bottom: 0;
		}

		.libelle {
			flex: 1;
			min-width: 0;
		}

		.niveau-2 .libelle {
			padding-left: var(--espace-3);
		}

		.niveau-3 .libelle {
			padding-left: var(--espace-5);
		}

		.niveau-4 .libelle {
			padding-left: calc(var(--espace-5) + var(--espace-3));
		}

		.detail-telephone {
			display: flex;
			flex-wrap: wrap;
			gap: 0 var(--espace-3);
			margin-top: 2px;
			padding-left: calc(28px + var(--espace-2));
			color: var(--ink-muted);
			font-weight: var(--typo-caption-graisse);
			font-variant-numeric: tabular-nums lining-nums;
		}

		/* Une Ligne : le libellé d'abord, sa date dessous, son icône à portée de pouce. */
		.ligne .chevron {
			display: none;
		}

		.ligne .date {
			order: 3;
			flex-basis: 100%;
		}

		.ligne .piece {
			margin-block: -10px;
		}

		.reduit .detail-telephone {
			display: none;
		}

		/* Cible tactile : tout le chevron, bien au-delà de ses 24 px visibles. */
		.chevron {
			width: 28px;
			height: 28px;
		}

		.piece {
			width: 44px;
			height: 44px;
		}
	}
</style>
