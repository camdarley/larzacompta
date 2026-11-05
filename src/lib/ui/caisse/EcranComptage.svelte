<script lang="ts">
	import { CircleCheck, ChevronLeft, ChevronDown } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		AUTRES_COUPURES,
		BILLETS,
		coupuresSaisies,
		PIECES,
		totalComptage
	} from '#lib/domaine/caisse/index.ts';
	import type { EcranComptage } from '#lib/domaine/caisse/vues.ts';
	import { formaterDateCourte, formaterDateLongue } from '#lib/domaine/dates.ts';
	import { centimes, formaterMontant, type Centimes } from '#lib/domaine/montant.ts';
	import { messageErreur, message, TEXTES, type CodeMessage } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import { suivreClavier } from '#lib/ui/clavier.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import { effacerBrouillon, ecrireBrouillon, lireBrouillon } from './brouillon.ts';
	import CompteurCoupure from './CompteurCoupure.svelte';

	type Props = {
		ecran: EcranComptage;
		/** Mes caisses pour un·e compteur·se, la Session ou la caisse sinon. */
		retour: string;
		libelleRetour: string;
	};

	let { ecran, retour, libelleRetour }: Props = $props();

	const TITRES = { ouverture: 'Ouverture', controle: 'Comptage', fin: 'Comptage final' };

	const nomBrouillon = untrack(() =>
		[ecran.sessionId ? `s${ecran.sessionId}` : `c${ecran.compteId}`, ecran.mode].join('-')
	);

	const quantites = new SvelteMap(
		untrack(() => ecran.quantites.map((c) => [c.coupure, c.quantite]))
	);
	let date = $state(untrack(() => ecran.date));
	let dateOuverte = $state(untrack(() => ecran.date !== ecran.aujourdhui));
	let autresOuvertes = $state(
		untrack(() => ecran.quantites.some((c) => AUTRES_COUPURES.includes(c.coupure)))
	);
	const seuleAction = untrack(() => (ecran.actions.length === 1 ? ecran.actions[0] : undefined));
	let actionId = $state(seuleAction ? String(seuleAction.id) : '');
	let erreurAction = $state<string | null>(null);
	let erreurDate = $state<string | null>(null);

	/** Total du Comptage refusé par le recomptage : le renvoyer à l'identique confirme (C9). */
	let totalPrecedent = $state<Centimes | null>(null);
	let different = $state<string | null>(null);
	let confirme = $state<string | null>(null);
	let reseau = $state(false);
	let erreur = $state<string | null>(null);
	let occupe = $state(false);
	let fini = $state<{ total: Centimes; coupures: ReturnType<typeof coupuresSaisies> } | null>(null);
	let liste = $state<HTMLElement | null>(null);

	const coupures = $derived(coupuresSaisies(quantites));
	const total = $derived(totalComptage(coupures));
	const estOuverture = $derived(ecran.mode === 'ouverture' && !ecran.correction);
	const titreAction = $derived.by(() => {
		if (estOuverture) {
			const choisie = ecran.actions.find((a) => String(a.id) === actionId);
			return choisie?.libelle ?? null;
		}
		return ecran.action;
	});
	const sousTitre = $derived([titreAction, formaterDateLongue(date)].filter(Boolean).join(', '));
	const optionsAction = $derived([
		...(ecran.actions.length > 1 ? [{ valeur: '', libelle: 'Choisir une Action' }] : []),
		...ecran.actions.map((a) => ({ valeur: String(a.id), libelle: a.libelle })),
		{ valeur: 'sans', libelle: 'Sans Action' }
	]);

	function changer(coupure: Centimes, quantite: number) {
		quantites.set(coupure, quantite);
		reseau = false;
		erreur = null;
		ecrireBrouillon(nomBrouillon, coupuresSaisies(quantites));
	}

	function suivante() {
		const champs = [...(liste?.querySelectorAll<HTMLInputElement>('input') ?? [])];
		champs[champs.indexOf(document.activeElement as HTMLInputElement) + 1]?.focus();
	}

	// Un rechargement en cours de Comptage reprend les quantités. Rien de plus n'est gardé.
	$effect(() => {
		const brouillon = lireBrouillon(nomBrouillon);
		if (brouillon !== null) {
			quantites.clear();
			for (const c of brouillon) quantites.set(c.coupure, c.quantite);
			if (brouillon.some((c) => AUTRES_COUPURES.includes(c.coupure))) autresOuvertes = true;
		}
	});

	// L'écran reste allumé si le navigateur le permet : un Comptage dure plusieurs minutes.
	$effect(() => {
		let verrou: { release(): Promise<void> } | undefined;
		let fini = false;
		const demander = async () => {
			try {
				const v = await navigator.wakeLock?.request('screen');
				if (fini) await v?.release();
				else verrou = v;
			} catch {
				// Refusé ou batterie faible : le Comptage continue, l'écran s'éteindra.
			}
		};
		const revenir = () => {
			if (document.visibilityState === 'visible') void demander();
		};
		void demander();
		document.addEventListener('visibilitychange', revenir);
		return () => {
			fini = true;
			document.removeEventListener('visibilitychange', revenir);
			void verrou?.release().catch(() => {});
		};
	});

	const adresse = () =>
		ecran.sessionId
			? `/api/sessions/${ecran.sessionId}/comptage`
			: `/api/caisses/${ecran.compteId}/comptage`;

	function corps() {
		const commun = { coupures, date, confirmation: totalPrecedent };
		if (ecran.sessionId) return { ...commun, corriger: ecran.correction };
		return ecran.mode === 'controle'
			? commun
			: { ...commun, actionId: actionId === 'sans' ? null : Number(actionId) };
	}

	async function enregistrer() {
		if (occupe) return;
		erreurAction = null;
		erreurDate = null;
		erreur = null;
		if (estOuverture && actionId === '') {
			erreurAction = message('champ_requis');
			document.getElementById('comptage-action')?.focus();
			return;
		}
		occupe = true;
		const r = await envoyer<{ sessionId: number | null; ecart: Centimes }>(adresse(), corps());
		occupe = false;
		reseau = false;
		if (r.type === 'ok') {
			confirme =
				r.valeur.ecart === 0
					? null
					: message('difference_confirmee', {
							montant: formaterMontant(centimes(Math.abs(r.valeur.ecart)))
						});
			effacerBrouillon(nomBrouillon);
			fini = { total, coupures };
			await tick();
			document.querySelector<HTMLElement>('h1')?.focus();
		} else if (r.type === 'reseau') {
			reseau = true;
		} else if (r.type === 'session') {
			demanderReconnexion(() => void enregistrer());
		} else if (r.type === 'serveur') {
			erreur = message('erreur_serveur');
		} else if (r.erreur.code === 'recomptage_requis') {
			totalPrecedent = total;
			const code: CodeMessage =
				ecran.mode === 'controle' ? 'comptage_reserve_different' : 'comptage_ouverture_different';
			different = message(code, r.erreur.details);
			await tick();
			document.getElementById('recomptage')?.focus();
		} else if (r.erreur.details?.champ === 'date') {
			dateOuverte = true;
			erreurDate = messageErreur(r.erreur);
		} else {
			erreur = messageErreur(r.erreur);
		}
	}
</script>

<svelte:head>
	<title>{TITRES[ecran.mode]}, {ecran.caisse}</title>
</svelte:head>

{#snippet coupuresDe(valeurs: readonly Centimes[])}
	{#each valeurs as coupure (coupure)}
		<CompteurCoupure
			{coupure}
			quantite={quantites.get(coupure) ?? 0}
			changer={(q) => changer(coupure, q)}
			suivant={suivante}
		/>
	{/each}
{/snippet}

{#if fini}
	<section class="fini">
		<CircleCheck size={40} strokeWidth={1.75} aria-hidden="true" />
		<h1 class="t-title" tabindex="-1">
			Comptage enregistré. {ecran.caisse}, {formaterMontant(fini.total)}.
		</h1>
		{#if confirme}<Bandeau ton="info">{confirme}</Bandeau>{/if}
		{#if fini.coupures.length > 0}
			<ul class="rappel">
				{#each fini.coupures as c (c.coupure)}
					<li>
						<span>{c.quantite} × {formaterMontant(c.coupure)}</span>
						<span class="montant">{formaterMontant(centimes(c.coupure * c.quantite))}</span>
					</li>
				{/each}
			</ul>
		{/if}
		<Bouton href={retour} pleineLargeur>{libelleRetour}</Bouton>
	</section>
{:else}
	<div class="ecran">
		<header class="tete">
			<a class="retour" href={retour} aria-label={libelleRetour}>
				<ChevronLeft size={24} strokeWidth={1.75} aria-hidden="true" />
			</a>
			<div>
				<h1 class="t-heading" tabindex="-1">
					{ecran.caisse} · {ecran.correction ? 'Correction' : TITRES[ecran.mode]}
				</h1>
				<p class="t-caption t-muted">{sousTitre}</p>
			</div>
		</header>

		{#if different}
			<section id="recomptage" class="recomptage" tabindex="-1" aria-live="polite">
				<h2 class="t-heading">Recomptez une fois</h2>
				<p>{different}</p>
				<p class="t-caption t-muted">
					Les quantités restent là : corrigez si besoin. Enregistrer le même total confirme la
					différence.
				</p>
			</section>
		{:else if ecran.message === 'repris'}
			<p class="note">{TEXTES.comptage_repris}</p>
		{:else if ecran.message === 'a_compter'}
			<p class="note">{TEXTES.comptage_a_faire}</p>
		{/if}

		{#if estOuverture}
			<div class="action">
				<ChampListe
					etiquette="Action"
					id="comptage-action"
					name="action"
					options={optionsAction}
					bind:valeur={actionId}
					erreur={erreurAction ?? undefined}
				/>
			</div>
		{/if}

		<div class="coupures" bind:this={liste}>
			<h2 class="visuellement-cache">Billets</h2>
			<ul>{@render coupuresDe(BILLETS)}</ul>
			<h2 class="visuellement-cache">Pièces</h2>
			<ul>{@render coupuresDe(PIECES)}</ul>
			{#if autresOuvertes}
				<h2 class="t-caption t-muted autres">Autres coupures</h2>
				<ul>{@render coupuresDe(AUTRES_COUPURES)}</ul>
			{:else}
				<button class="deplier" type="button" onclick={() => (autresOuvertes = true)}>
					<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
					Autres coupures
				</button>
			{/if}
		</div>

		<div class="moment">
			{#if dateOuverte}
				<Champ
					etiquette="Date du Comptage"
					id="comptage-date"
					name="date"
					type="date"
					bind:valeur={date}
					erreur={erreurDate ?? undefined}
				/>
			{:else}
				<button class="deplier" type="button" onclick={() => (dateOuverte = true)}>
					Compté à un autre moment ?
				</button>
			{/if}
		</div>

		{#if reseau}
			<div class="alerte">
				<Bandeau ton="regarder" alerte>
					{TEXTES.comptage_reseau}
					{#snippet action()}
						<Bouton variante="secondaire" {occupe} onclick={enregistrer}>Réessayer</Bouton>
					{/snippet}
				</Bandeau>
			</div>
		{:else if erreur}
			<div class="alerte">
				<Bandeau ton="erreur" alerte>{erreur}</Bandeau>
			</div>
		{/if}

		<footer class="total-comptage" use:suivreClavier>
			<div class="ligne-total">
				<span class="t-caption t-muted">{ecran.caisse}</span>
				<output class="total" aria-live="polite" aria-label="Total du Comptage"
					>{formaterMontant(total)}</output
				>
			</div>
			<Bouton pleineLargeur {occupe} onclick={enregistrer}>
				{ecran.correction ? 'Enregistrer la correction' : 'Enregistrer le Comptage'}
			</Bouton>
			{#if date !== ecran.aujourdhui}
				<p class="t-caption t-muted date-choisie">Daté du {formaterDateCourte(date)}</p>
			{/if}
		</footer>
	</div>
{/if}

<style>
	.ecran,
	.fini {
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
	}

	.ecran {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		padding: 0 var(--espace-page-mobile) var(--reserve-clavier, 0px);
	}

	.tete {
		position: sticky;
		z-index: 2;
		top: 0;
		display: flex;
		align-items: center;
		gap: var(--espace-1);
		margin: 0 calc(-1 * var(--espace-page-mobile));
		padding: var(--espace-2) var(--espace-page-mobile);
		background: var(--surface-base);
		border-bottom: 1px solid var(--border);
	}

	.retour {
		display: grid;
		place-items: center;
		flex: none;
		width: var(--espace-touch);
		height: var(--espace-touch);
		margin-left: calc(-1 * var(--espace-2));
		color: var(--ink);
		border-radius: var(--rayon-md);
	}

	.note,
	.recomptage {
		margin-top: var(--espace-3);
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--primary-soft);
	}

	.recomptage {
		display: grid;
		gap: var(--espace-1);
		outline: none;
		background: var(--warning-soft);
	}

	.action {
		margin-top: var(--espace-3);
	}

	.coupures {
		flex: 1;
		padding: var(--espace-2) 0;
	}

	.coupures ul {
		display: grid;
		gap: var(--espace-1);
	}

	.coupures h2 + ul {
		margin-top: var(--espace-1);
	}

	.autres {
		margin-top: var(--espace-4);
	}

	.deplier {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		min-height: var(--espace-touch);
		padding: 0;
		border: 0;
		background: none;
		color: var(--primary);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.alerte {
		margin-bottom: var(--espace-3);
	}

	.total-comptage {
		position: sticky;
		z-index: 2;
		bottom: var(--clavier, 0px);
		display: grid;
		gap: var(--espace-2);
		margin: 0 calc(-1 * var(--espace-page-mobile));
		padding: var(--espace-3) var(--espace-page-mobile)
			calc(var(--espace-3) + env(safe-area-inset-bottom));
		background: var(--surface-raised);
		border-top: 1px solid var(--border);
	}

	/* Au-dessus du clavier, la marge de la barre d'accueil ne sert plus. */
	.total-comptage:global([data-clavier]) {
		padding-block: var(--espace-2);
	}

	.ligne-total {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--espace-3);
	}

	.total {
		font-family: var(--typo-amount-xl-famille);
		font-size: var(--typo-amount-xl-taille);
		font-weight: var(--typo-amount-xl-graisse);
		line-height: var(--typo-amount-xl-interligne);
		font-variant-numeric: tabular-nums;
	}

	.date-choisie {
		text-align: center;
	}

	.fini {
		display: grid;
		justify-items: center;
		gap: var(--espace-4);
		padding: var(--espace-7) var(--espace-page-mobile);
		text-align: center;
		color: var(--success);
	}

	.fini h1 {
		color: var(--ink);
		outline: none;
	}

	.fini :global(.bouton),
	.rappel {
		width: 100%;
	}

	.rappel {
		color: var(--ink);
		display: grid;
		gap: var(--espace-1);
		padding: var(--espace-3);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.rappel li {
		display: flex;
		justify-content: space-between;
		gap: var(--espace-3);
	}

	@media (min-width: 640px) {
		.tete {
			margin: 0;
			padding-inline: 0;
		}

		.total-comptage {
			margin: 0;
			padding-inline: var(--espace-4);
			border: 1px solid var(--border);
			border-radius: var(--rayon-lg) var(--rayon-lg) 0 0;
		}
	}
</style>
