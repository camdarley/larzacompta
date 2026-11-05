<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Check, ChevronRight, LoaderCircle } from '@lucide/svelte';
	import {
		cleBudget,
		formaterPourcentage,
		vueBudget,
		type BlocBudget,
		type EcartBudget,
		type LigneBudget,
		type LignePrevue,
		type RangeeBudget,
		type SensBudget,
		type EntreeVueBudget
	} from '#lib/domaine/budget/index.ts';
	import { basculer, lireOuvertes } from '#lib/domaine/etats/arbre.ts';
	import {
		formaterMontant,
		formaterMontantSigne,
		formaterSaisie,
		lectureMontant,
		lireMontant,
		type Centimes
	} from '#lib/domaine/montant.ts';
	import { message, messageErreur, TEXTES } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import Pastille from '#lib/ui/Pastille.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import { urlAvec } from '#lib/ui/url.ts';
	import BarreRealise from './BarreRealise.svelte';

	type Props = {
		exerciceId: number;
		lignes: readonly LigneBudget[];
		realise: readonly LigneBudget[];
		parametrage: EntreeVueBudget['parametrage'];
		vides: readonly (number | null)[];
		natures: readonly { id: number; libelle: string }[];
		modifiable: boolean;
	};
	const props: Props = $props();

	/** Le calcul se refait ici à chaque sortie de champ : l'écran suit sans attendre le serveur. */
	// svelte-ignore state_referenced_locally
	let prevus = $state<LignePrevue[]>([...props.lignes]);
	// svelte-ignore state_referenced_locally
	let textes = $state<Record<string, string>>(
		Object.fromEntries(props.lignes.map((l) => [cleBudget(l), formaterSaisie(l.montant)]))
	);
	let erreurs = $state<Record<string, string>>({});

	const vue = $derived(
		vueBudget({
			prevus,
			realise: props.realise,
			parametrage: props.parametrage,
			vides: props.vides
		})
	);

	const parametreOuvert = $derived(page.url.searchParams.get('ouvert'));
	const toutOuvert = $derived(parametreOuvert === 'tout');
	const ouvertes = $derived(
		toutOuvert ? new Set(vue.blocs.map((b) => b.cle)) : lireOuvertes(parametreOuvert)
	);
	const estOuvert = (b: BlocBudget) => ouvertes.has(b.cle);
	const depliable = (b: BlocBudget) => b.rangees.length > 0 || props.modifiable;

	/** Un bloc replié : ouvrir un seul bloc depuis « tout déplié » garde les autres ouverts. */
	const urlBascule = (cle: string) => {
		const suite = basculer(ouvertes, cle);
		return urlAvec({ ouvert: suite === '' ? null : suite });
	};

	function deplier(cle: string) {
		active = cle;
		return goto(urlBascule(cle), { reset: false, replaceState: true });
	}

	type RangeeVue =
		| { type: 'bloc'; cle: string; bloc: BlocBudget }
		| { type: 'nature'; cle: string; bloc: BlocBudget; rangee: RangeeBudget }
		| { type: 'ajout'; cle: string; bloc: BlocBudget };

	const rangees = $derived(
		vue.blocs.flatMap((bloc): RangeeVue[] => {
			if (!estOuvert(bloc)) return [{ type: 'bloc', cle: bloc.cle, bloc }];
			return [
				{ type: 'bloc', cle: bloc.cle, bloc },
				...bloc.rangees.map((rangee) => ({
					type: 'nature' as const,
					cle: rangee.cle,
					bloc,
					rangee
				})),
				...(props.modifiable ? [{ type: 'ajout' as const, cle: `${bloc.cle}-ajout`, bloc }] : [])
			];
		})
	);

	/** Un seul arrêt de tabulation par rangée de structure : les flèches parcourent ensuite. */
	let active = $state<string | null>(null);
	const arret = $derived(rangees.some((r) => r.cle === active) ? active : rangees[0]?.cle);
	let corps = $state<HTMLElement | null>(null);

	function focaliser(cle: string | undefined) {
		if (cle === undefined) return;
		active = cle;
		corps?.querySelector<HTMLElement>(`tr[data-cle="${cle}"]`)?.focus();
	}

	const champs = () => [
		...(corps?.querySelectorAll<HTMLInputElement>('input[name^="prevu-"]') ?? [])
	];

	function champVoisin(depuis: HTMLElement, pas: 1 | -1) {
		const tous = champs();
		const voisin = tous[tous.indexOf(depuis as HTMLInputElement) + pas];
		voisin?.focus();
	}

	function surTouche(e: KeyboardEvent) {
		const cible = e.target as HTMLElement;
		if (cible instanceof HTMLInputElement) {
			if (e.key === 'Enter') {
				e.preventDefault();
				champVoisin(cible, e.shiftKey ? -1 : 1);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				annuler(cible);
			}
			return;
		}
		if (cible instanceof HTMLSelectElement) return;
		const tr = cible.closest<HTMLElement>('tr[data-cle]');
		const r = rangees.find((x) => x.cle === tr?.dataset.cle);
		if (r === undefined || cible !== tr) return;
		const i = rangees.indexOf(r);
		const replie = r.type === 'bloc' && !estOuvert(r.bloc) && depliable(r.bloc);
		const ouvert = r.type === 'bloc' && estOuvert(r.bloc);
		const parent = r.type === 'bloc' ? undefined : r.bloc.cle;
		const entrer = () => {
			if (r.type === 'bloc') {
				if (depliable(r.bloc)) deplier(r.cle);
			} else {
				tr?.querySelector<HTMLElement>('input, select')?.focus();
			}
		};
		const faire: Record<string, () => void> = {
			ArrowDown: () => focaliser(rangees[i + 1]?.cle),
			ArrowUp: () => focaliser(rangees[i - 1]?.cle),
			Home: () => focaliser(rangees[0]?.cle),
			End: () => focaliser(rangees.at(-1)?.cle),
			ArrowRight: () => {
				if (replie) deplier(r.cle);
				else if (ouvert) focaliser(rangees[i + 1]?.cle);
			},
			ArrowLeft: () => {
				if (ouvert) deplier(r.cle);
				else focaliser(parent);
			},
			Enter: entrer,
			' ': entrer
		};
		const action = faire[e.key];
		if (action === undefined) return;
		e.preventDefault();
		action();
	}

	function surClic(e: MouseEvent, bloc: BlocBudget) {
		if ((e.target as HTMLElement).closest('a, button')) return;
		if (depliable(bloc)) deplier(bloc.cle);
	}

	/** Un champ qui prend le focus s'offre à la frappe : on remplace sans effacer à la main. */
	function surFocus(e: FocusEvent) {
		const champ = e.target;
		if (champ instanceof HTMLInputElement) champ.select();
	}

	// Enregistrement à la sortie du champ, une ligne à la fois, dans l'ordre de la saisie.
	const attente = new SvelteMap<string, LignePrevue>();
	let enCours = false;
	let statut = $state<'' | 'envoi' | 'fait'>('');
	let alerte = $state<string | null>(null);
	let reprise = $state(false);

	async function vider() {
		if (enCours) return;
		enCours = true;
		statut = 'envoi';
		alerte = null;
		reprise = false;
		for (const [cle, ligne] of attente) {
			const r = await envoyer<{ montant: number | null }>('/api/budget', {
				exerciceId: props.exerciceId,
				...ligne
			});
			if (r.type === 'ok') {
				if (attente.get(cle) === ligne) attente.delete(cle);
				continue;
			}
			enCours = false;
			statut = '';
			if (r.type === 'session') {
				demanderReconnexion(vider);
			} else if (r.type === 'refus') {
				attente.delete(cle);
				alerte = messageErreur(r.erreur);
			} else {
				reprise = true;
				alerte = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
			}
			return;
		}
		enCours = false;
		// Une sortie de champ arrivée pendant le dernier envoi : la file n'est pas finie.
		if (attente.size > 0) return vider();
		statut = 'fait';
	}

	function ecrire(ligne: LignePrevue) {
		const cle = cleBudget(ligne);
		prevus = [...prevus.filter((l) => cleBudget(l) !== cle), ligne];
		attente.set(cle, ligne);
		return vider();
	}

	function surSortie(r: RangeeBudget) {
		const texte = (textes[r.cle] ?? '').trim();
		delete erreurs[r.cle];
		const lu = texte === '' ? null : lireMontant(texte);
		if (lu !== null && !lu.ok) return;
		if (lu !== null && lu.valeur < 0) {
			erreurs[r.cle] = message('montant_invalide');
			return;
		}
		const montant = lu === null ? null : lu.valeur;
		if (montant === r.prevu) return;
		const { actionId, natureId, sens } = r;
		return ecrire({ actionId, natureId, sens, montant });
	}

	function annuler(champ: HTMLInputElement) {
		const cle = cleDuChamp(champ);
		const prevu = prevus.find((l) => cleBudget(l) === cle)?.montant ?? null;
		textes[cle] = prevu === null ? '' : formaterSaisie(prevu);
		delete erreurs[cle];
		focaliser(cle);
	}

	const cleDuChamp = (champ: HTMLInputElement) => champ.name.replace(/^prevu-/, '');

	/** Une prévision nouvelle n'existe qu'à l'écran tant qu'elle n'a pas de montant. */
	function ajouter(bloc: BlocBudget, valeur: string) {
		const [nature, sens] = valeur.split('-');
		const ligne: LignePrevue = {
			actionId: bloc.actionId,
			natureId: Number(nature),
			sens: sens as SensBudget,
			montant: null
		};
		prevus = [...prevus, ligne];
		const cle = cleBudget(ligne);
		tick().then(() => corps?.querySelector<HTMLElement>(`input[name="prevu-${cle}"]`)?.focus());
	}

	const LIBELLES_SENS: Record<SensBudget, string> = { recette: 'Recette', depense: 'Dépense' };

	function optionsAjout(bloc: BlocBudget) {
		const pris = new Set(bloc.rangees.map((r) => r.cle));
		const position = (id: number, sens: SensBudget) =>
			cleBudget({ actionId: bloc.actionId, natureId: id, sens });
		return [
			{ valeur: '', libelle: 'Ajouter une prévision' },
			...props.natures.flatMap((n) =>
				(['recette', 'depense'] as const)
					.filter((sens) => !pris.has(position(n.id, sens)))
					.map((sens) => ({
						valeur: `${n.id}-${sens}`,
						libelle: `${n.libelle}, ${LIBELLES_SENS[sens].toLowerCase()}`
					}))
			)
		];
	}

	let ajouts = $state<Record<string, string>>({});

	const signeSi = (signe: boolean, c: Centimes) =>
		signe ? formaterMontantSigne(c) : formaterMontant(c);
</script>

{#snippet montant(valeur: Centimes | null, signe: boolean)}
	{#if valeur !== null}
		<span class="visuellement-cache">{lectureMontant(valeur)}</span>
		<span aria-hidden="true">{signeSi(signe, valeur)}</span>
	{/if}
{/snippet}

{#snippet colonnes(e: EcartBudget, signe: boolean, barre: RangeeBudget | null, muet = false)}
	<td role="gridcell" class="montant realise" data-titre="Réalisé">
		{#if !muet}
			<span class="avec-barre">
				{#if barre && barre.prevu !== null}<BarreRealise
						part={barre.part}
						depassement={barre.depassement}
					/>{/if}
				<span>{@render montant(e.realise, signe)}</span>
			</span>
		{/if}
	</td>
	<td role="gridcell" class="montant difference" data-titre="Différence">
		{#if !muet}
			<span>{@render montant(e.difference, true)}</span>
			{#if e.pourcentage !== null}
				<span class="seulement-telephone">{formaterPourcentage(e.pourcentage)}</span>
			{/if}
		{/if}
	</td>
	<td role="gridcell" class="montant pourcent" data-titre="%">
		{e.pourcentage === null ? '' : formaterPourcentage(e.pourcentage)}
	</td>
{/snippet}

<div class="barre-outils seulement-ordinateur">
	<p class="statut t-caption" role="status">
		{#if statut === 'envoi'}
			<LoaderCircle size={16} strokeWidth={1.75} aria-hidden="true" /> Enregistrement…
		{:else if statut === 'fait'}
			<Check size={16} strokeWidth={2} aria-hidden="true" /> {TEXTES.enregistre}
		{/if}
	</p>
	<Bouton variante="discret" href={urlAvec({ ouvert: toutOuvert ? null : 'tout' })} conserverFocus>
		{toutOuvert ? 'Tout replier' : 'Tout déplier'}
	</Bouton>
</div>

{#if alerte}
	<div class="alerte">
		<Bandeau ton="erreur" alerte>
			{alerte}
			{#snippet action()}
				{#if reprise}<Bouton variante="secondaire" onclick={vider}>Réessayer</Bouton>{/if}
			{/snippet}
		</Bandeau>
	</div>
{/if}

<div class="conteneur">
	<!-- `treegrid` explicite : la mise en page téléphone retire au tableau ses rôles implicites. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
	<table role="treegrid" aria-label="Budget" class="budget">
		<thead>
			<!-- svelte-ignore a11y_no_redundant_roles -->
			<tr role="row">
				<th role="columnheader" scope="col">Libellé</th>
				<th role="columnheader" scope="col" class="droite c-prevu">Prévu</th>
				<th role="columnheader" scope="col" class="droite c-realise">Réalisé</th>
				<th role="columnheader" scope="col" class="droite c-difference">Différence</th>
				<th role="columnheader" scope="col" class="droite c-pourcent">%</th>
			</tr>
		</thead>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<tbody bind:this={corps} onkeydown={surTouche} onfocusin={surFocus}>
			{#each rangees as r (r.cle)}
				{#if r.type === 'bloc'}
					{@const b = r.bloc}
					<!-- Le clavier passe par `surTouche`, sur le corps du tableau. -->
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<tr
						role="row"
						class="rangee bloc"
						class:vide={b.rangees.length === 0}
						data-cle={r.cle}
						aria-level={1}
						aria-expanded={depliable(b) ? estOuvert(b) : undefined}
						tabindex={r.cle === arret ? 0 : -1}
						onclick={(e) => surClic(e, b)}
						onfocus={() => (active = r.cle)}
					>
						<td role="gridcell" class="libelle">
							<span class="tete">
								{#if depliable(b)}
									<a
										class="chevron"
										class:deplie={estOuvert(b)}
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
									<span class="chevron"></span>
								{/if}
								{#if b.actionId === null}
									<span class="nom">{b.libelle}</span>
								{:else}
									<a class="nom" href="/actions/{b.actionId}" tabindex="-1">{b.libelle}</a>
								{/if}
								{#if b.depassement}<Pastille etat="a_regarder" />{/if}
							</span>
						</td>
						<td role="gridcell" class="montant prevu" data-titre="Prévu">
							{@render montant(b.prevu, true)}
						</td>
						{@render colonnes(b, true, null, b.rangees.length === 0)}
					</tr>
				{:else if r.type === 'nature'}
					{@const n = r.rangee}
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<tr
						role="row"
						class="rangee nature"
						data-cle={r.cle}
						aria-level={2}
						tabindex={r.cle === arret ? 0 : -1}
						onfocus={() => (active = r.cle)}
					>
						<td role="gridcell" class="libelle">
							<span class="tete">
								<span class="nom">{n.libelle}</span>
								<span class="sens t-caption">{LIBELLES_SENS[n.sens]}</span>
								{#if n.depassement}<Pastille etat="a_regarder" />{/if}
							</span>
						</td>
						<td role="gridcell" class="prevu" data-titre="Prévu">
							{#if props.modifiable}
								<span class="montant seulement-telephone">
									{@render montant(n.prevu, false)}
								</span>
								<div class="seulement-ordinateur">
									<ChampMontant
										etiquette="Prévu, {n.libelle}, {LIBELLES_SENS[n.sens].toLowerCase()}, {r.bloc
											.libelle}"
										name="prevu-{r.cle}"
										id="prevu-{r.cle}"
										masquerEtiquette
										bind:valeur={() => textes[r.cle] ?? '', (v) => (textes[r.cle] = v)}
										erreur={erreurs[r.cle]}
										onsortie={() => surSortie(n)}
									/>
								</div>
							{:else}
								<span class="montant">{@render montant(n.prevu, false)}</span>
							{/if}
						</td>
						{@render colonnes(n, false, n)}
					</tr>
				{:else}
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<tr
						role="row"
						class="rangee ajout seulement-ordinateur"
						data-cle={r.cle}
						aria-level={2}
						tabindex={r.cle === arret ? 0 : -1}
						onfocus={() => (active = r.cle)}
					>
						<td role="gridcell" class="libelle" colspan="5">
							<ChampListe
								etiquette="Ajouter une prévision à {r.bloc.libelle}"
								name="ajout-{r.cle}"
								masquerEtiquette
								options={optionsAjout(r.bloc)}
								bind:valeur={() => ajouts[r.cle] ?? '', (v) => (ajouts[r.cle] = v)}
								onchange={(v) => {
									ajouts[r.cle] = '';
									if (v !== '') ajouter(r.bloc, v);
								}}
							/>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
		<tfoot>
			{#each [{ libelle: 'Recettes', e: vue.totaux.recettes, signe: false }, { libelle: 'Dépenses', e: vue.totaux.depenses, signe: false }, { libelle: 'Résultat', e: vue.totaux.resultat, signe: true }] as t (t.libelle)}
				<!-- svelte-ignore a11y_no_redundant_roles -->
				<tr role="row" class="total" class:resultat={t.signe}>
					<td role="gridcell" class="libelle">{t.libelle}</td>
					<td role="gridcell" class="montant prevu" data-titre="Prévu">
						{@render montant(t.e.prevu, t.signe)}
					</td>
					{@render colonnes(t.e, t.signe, null)}
				</tr>
			{/each}
		</tfoot>
	</table>
</div>

<style>
	.barre-outils {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-3);
		min-height: var(--espace-row);
		margin-bottom: var(--espace-1);
	}

	.statut {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		color: var(--ink-muted);
	}

	.alerte {
		margin-bottom: var(--espace-3);
	}

	.conteneur {
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
		overflow: hidden;
	}

	.budget {
		width: 100%;
		border-collapse: collapse;
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

	.c-prevu {
		width: 164px;
	}

	.c-realise {
		width: 196px;
	}

	.c-difference {
		width: 132px;
	}

	.c-pourcent {
		width: 84px;
	}

	td {
		height: var(--espace-row);
		padding: var(--espace-1) var(--espace-3);
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}

	.rangee:hover {
		background: var(--surface-sunken);
	}

	.rangee:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: -2px;
	}

	.bloc[aria-expanded] {
		cursor: pointer;
	}

	.bloc td {
		font-weight: var(--typo-body-strong-graisse);
	}

	.nature .libelle,
	.ajout .libelle {
		padding-left: calc(var(--espace-3) + var(--espace-5));
	}

	.nature td {
		padding-block: 2px;
	}

	.ajout td {
		padding-block: 2px;
	}

	/* Une rangée par Action : discrète tant qu'on ne s'en sert pas, comme un lien. */
	.ajout .libelle :global(.champ) {
		width: max-content;
		max-width: 320px;
	}

	.ajout :global(select) {
		padding-left: 0;
		border-color: transparent;
		background: transparent;
		color: var(--primary);
		font-weight: var(--typo-body-strong-graisse);
	}

	.ajout :global(select:hover),
	.ajout :global(select:focus-visible) {
		border-color: var(--border-strong);
		background: var(--surface-raised);
	}

	.ajout :global(select option) {
		color: var(--ink);
		font-weight: var(--typo-body-graisse);
	}

	.tete {
		display: flex;
		align-items: center;
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
		min-width: 0;
		color: var(--ink);
		text-decoration: none;
	}

	a.nom:hover {
		color: var(--primary);
		text-decoration: underline;
	}

	.sens {
		color: var(--ink-muted);
		font-weight: var(--typo-caption-graisse);
	}

	td.montant {
		text-align: right;
		white-space: nowrap;
	}

	span.montant {
		display: block;
		text-align: right;
	}

	.avec-barre {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--espace-2);
		min-width: 0;
	}

	.pourcent {
		color: var(--ink-muted);
	}

	tfoot .libelle {
		padding-left: calc(var(--espace-3) + 24px + var(--espace-2));
	}

	tfoot td {
		font-weight: var(--typo-body-strong-graisse);
	}

	tfoot .total:first-child td {
		border-top: 1px solid var(--ink);
	}

	tfoot .total:last-child td {
		border-bottom: 0;
	}

	@media (max-width: 639.98px) {
		thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		.bloc {
			background: var(--surface-sunken);
		}

		tbody tr,
		tfoot tr {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 2px var(--espace-2);
			padding: var(--espace-2) var(--espace-3);
			border-bottom: 1px solid var(--border);
		}

		.bloc.vide {
			display: none;
		}

		td {
			height: auto;
			padding: 0;
			border: 0;
		}

		.libelle {
			grid-column: 1 / -1;
		}

		.nature .libelle,
		tfoot .libelle {
			padding-left: 0;
		}

		td[data-titre] {
			display: grid;
			align-content: start;
			font-size: var(--typo-caption-taille);
			text-align: left;
		}

		td[data-titre]::before {
			content: attr(data-titre);
			color: var(--ink-muted);
			font-weight: var(--typo-caption-graisse);
		}

		span.montant {
			font-size: var(--typo-caption-taille);
			text-align: left;
		}

		.avec-barre {
			flex-direction: column;
			align-items: flex-start;
			gap: 2px;
		}

		td.pourcent {
			display: none;
		}

		.difference {
			white-space: normal;
		}

		tfoot .total:first-child td {
			border-top: 0;
		}

		tfoot .total:first-child {
			border-top: 1px solid var(--ink);
		}

		tbody tr.rangee:last-child {
			border-bottom: 0;
		}
	}
</style>
