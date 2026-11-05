<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, Ellipsis } from '@lucide/svelte';
	import { LIBELLES_COMPTAGE, type MouvementSession } from '#lib/domaine/caisse/vues.ts';
	import {
		formaterDateCourte,
		formaterDateLongue,
		formaterHorodatage
	} from '#lib/domaine/dates.ts';
	import { centimes, formaterMontant } from '#lib/domaine/montant.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import CalculPose from '#lib/ui/CalculPose.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import Menu from '#lib/ui/Menu.svelte';
	import { urlAvec } from '#lib/ui/url.ts';

	let { data, form } = $props();

	const s = $derived(data.session);
	const saisir = $derived(data.peutSaisir && s.ouverte);
	const absolu = (n: number) => formaterMontant(centimes(Math.abs(n)));

	let confirmer = $state(false);
	let rouvrir = $state(false);
	const envoiCloture = creerEnvoi({
		toast: 'Session clôturée.',
		apres: () => (confirmer = false)
	});
	const envoiReouverture = creerEnvoi({
		toast: 'Session rouverte.',
		apres: () => (rouvrir = false)
	});

	const fermerDialogues = () => {
		confirmer = false;
		rouvrir = false;
	};

	const depense = $derived(
		urlAvec({
			op: 'nouvelle',
			intention: 'depense',
			compte: String(s.compteId),
			mode: 'especes'
		})
	);
	const transfert = $derived(
		urlAvec({ op: 'nouvelle', intention: 'interne', de: String(s.compteId) })
	);
	const termes = $derived(
		s.termes && [
			{ libelle: 'Comptage final', montant: s.termes.comptageFinal },
			{ libelle: 'Fond de caisse', montant: s.termes.fond, signe: '−' as const },
			{ libelle: 'Dépenses en espèces', montant: s.termes.depenses, signe: '+' as const },
			{ libelle: 'Transferts sortants', montant: s.termes.transfertsSortants, signe: '+' as const },
			{ libelle: 'Transferts entrants', montant: s.termes.transfertsEntrants, signe: '−' as const }
		]
	);
	const pourAction = $derived(s.action ? ` pour la ${s.action.libelle}` : '');
	const phraseCloture = $derived(
		s.termes && s.termes.recette !== 0
			? `La Recette d’espèces de ${formaterMontant(s.termes.recette)} sera enregistrée${pourAction}.`
			: 'La caisse n’a ni gagné ni perdu : aucune Recette d’espèces ne sera enregistrée.'
	);
</script>

{#snippet mouvements(liste: readonly MouvementSession[], vide: string)}
	{#if liste.length === 0}
		<p class="t-muted vide">{vide}</p>
	{:else}
		<ul class="lignes">
			{#each liste as m (m.operationId)}
				<li>
					<div class="texte">
						<a href={urlAvec({ op: String(m.operationId) })} data-sveltekit-reset="false"
							>{m.libelle}</a
						>
						<p class="t-caption t-muted">
							{formaterDateCourte(m.date)}{m.autreCompte
								? `, ${m.montant < 0 ? 'vers' : 'depuis'} ${m.autreCompte}`
								: ''}
						</p>
					</div>
					<p class="montant">{m.montant < 0 ? '−' : '+'}{absolu(m.montant)}</p>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<a class="retour" href="/caisses/{s.compteId}">
	<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
	{s.caisse}
</a>

<EnTete
	titre="Session de {s.caisse}"
	contexte="Caisses"
	sousTitre={[
		s.action?.libelle ?? 'Sans Action',
		s.depuis ? formaterDateLongue(s.depuis) : null,
		s.ouverte ? 'ouverte' : `clôturée le ${formaterHorodatage(s.cloturee ?? '')}`
	]
		.filter(Boolean)
		.join(', ')}
>
	{#snippet actions()}
		{#if saisir}
			<Bouton variante="secondaire" href={depense} conserverFocus>
				Ajouter une dépense en espèces
			</Bouton>
			<Bouton variante="secondaire" href={transfert} conserverFocus>Transférer</Bouton>
			{#if data.banque !== null}
				<Bouton
					variante="secondaire"
					href={urlAvec({
						op: 'nouvelle',
						intention: 'interne',
						de: String(s.compteId),
						vers: String(data.banque)
					})}
					conserverFocus
				>
					Déposer en banque
				</Bouton>
			{/if}
		{/if}
		{#if data.peutSaisir && s.peutRouvrir}
			<Menu nom="Actions de la Session" flottant classe="bouton-tete">
				{#snippet bouton()}<Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />{/snippet}
				<button type="button" onclick={() => (rouvrir = true)}>Rouvrir</button>
			</Menu>
		{/if}
	{/snippet}
</EnTete>

{#if form?.erreur}
	<div class="alerte"><Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau></div>
{/if}

<div class="colonnes">
	<div class="pile">
		<section aria-labelledby="titre-comptages">
			<h2 id="titre-comptages" class="t-heading">
				<AideTerme ancre="comptage">Comptages</AideTerme>
			</h2>
			<ul class="lignes">
				{#each s.comptages as c (c.id)}
					<li>
						<div class="texte">
							<p>{LIBELLES_COMPTAGE[c.type]}</p>
							<p class="t-caption t-muted">
								{formaterDateCourte(c.date)}{c.ecart
									? `, Écart de caisse de ${absolu(c.ecart)}`
									: ''}
							</p>
						</div>
						<p class="montant">{formaterMontant(c.total)}</p>
					</li>
				{/each}
			</ul>
			{#if saisir}
				<div class="suite">
					{#if s.termes}
						<Bouton variante="discret" href="/sessions/{s.id}/comptage">
							Corriger le Comptage final
						</Bouton>
					{:else}
						<Bouton href="/sessions/{s.id}/comptage">Compter la fin de journée</Bouton>
						<Bouton variante="discret" href="/sessions/{s.id}/comptage?corriger=ouverture">
							Corriger l’ouverture
						</Bouton>
					{/if}
				</div>
			{/if}
		</section>

		<section aria-labelledby="titre-depenses">
			<h2 id="titre-depenses" class="t-heading">Dépenses en espèces</h2>
			{@render mouvements(s.depenses, 'Aucune dépense.')}
		</section>

		<section aria-labelledby="titre-transferts">
			<h2 id="titre-transferts" class="t-heading">Transferts</h2>
			{@render mouvements(s.transferts, 'Aucun transfert.')}
		</section>

		{#if s.apres.length > 0}
			<section aria-labelledby="titre-apres">
				<h2 id="titre-apres" class="t-heading">Après le Comptage</h2>
				<p class="t-caption t-muted">
					Ces sommes ont bougé après le Comptage final : elles n’entrent pas dans la recette.
				</p>
				{@render mouvements(s.apres, '')}
			</section>
		{/if}
	</div>

	<section class="recette" aria-labelledby="titre-recette">
		<h2 id="titre-recette" class="t-heading">
			<AideTerme ancre="recette-especes">Recette d’espèces</AideTerme>
		</h2>
		{#if s.termes && termes}
			<CalculPose {termes} totalLibelle="Recette d’espèces" total={s.termes.recette} />
			{#if saisir}
				<Bouton pleineLargeur onclick={() => (confirmer = true)}>Clôturer la Session</Bouton>
			{:else if s.recetteOperationId}
				<p class="t-caption">
					<a href={urlAvec({ op: String(s.recetteOperationId) })} data-sveltekit-reset="false"
						>Voir l’Opération</a
					>
					{#if s.action}, dans <a href="/actions/{s.action.id}">{s.action.libelle}</a>{/if}
				</p>
			{/if}
		{:else}
			<p class="t-muted">La recette se calcule après le Comptage final.</p>
		{/if}
	</section>
</div>

<Dialogue
	ouvert={confirmer}
	titre="Clôturer la Session ?"
	libelleAction="Clôturer la Session"
	confirmer={() => {}}
	revenir={fermerDialogues}
>
	{phraseCloture}
	{#snippet actionPerso()}
		<form method="post" action="?/cloturer" use:enhance={envoiCloture.soumettre}>
			<input type="hidden" name="id" value={s.id} />
			<Bouton type="submit" occupe={envoiCloture.occupe}>Clôturer la Session</Bouton>
		</form>
	{/snippet}
</Dialogue>

<Dialogue
	ouvert={rouvrir}
	titre="Rouvrir la Session ?"
	libelleAction="Rouvrir"
	confirmer={() => {}}
	revenir={fermerDialogues}
>
	Sa Recette d’espèces sera annulée, puis recalculée à la prochaine clôture.
	{#snippet actionPerso()}
		<form method="post" action="?/rouvrir" use:enhance={envoiReouverture.soumettre}>
			<input type="hidden" name="id" value={s.id} />
			<Bouton type="submit" occupe={envoiReouverture.occupe}>Rouvrir</Bouton>
		</form>
	{/snippet}
</Dialogue>

<style>
	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		margin-bottom: var(--espace-3);
	}

	.alerte {
		margin-top: var(--espace-4);
	}

	.colonnes {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
		align-items: start;
		gap: var(--espace-5);
		margin-top: var(--espace-5);
	}

	.pile {
		display: grid;
		gap: var(--espace-5);
	}

	.lignes {
		margin-top: var(--espace-2);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.lignes li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-3);
		min-height: var(--espace-row-double);
		padding: var(--espace-2) var(--espace-3);
	}

	.lignes li + li {
		border-top: 1px solid var(--border);
	}

	.texte {
		min-width: 0;
	}

	.texte a {
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.montant {
		white-space: nowrap;
	}

	.vide {
		margin-top: var(--espace-1);
	}

	.suite {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
		margin-top: var(--espace-3);
	}

	.recette {
		position: sticky;
		top: var(--espace-4);
		display: grid;
		gap: var(--espace-3);
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	@media (max-width: 899.98px) {
		.colonnes {
			grid-template-columns: minmax(0, 1fr);
		}

		.recette {
			position: static;
		}
	}
</style>
