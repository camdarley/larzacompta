<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Ellipsis, Handshake, Paperclip, Plus } from '@lucide/svelte';
	import type { BlocSuivi, RangeeSuivi, Sens } from '#lib/domaine/creances/index.ts';
	import type { PieceDeposee } from '#lib/domaine/pieces/index.ts';
	import { formaterDateLongue } from '#lib/domaine/dates.ts';
	import { dateProposee } from '#lib/domaine/operations/lecture.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import ChampZone from '#lib/ui/ChampZone.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Menu from '#lib/ui/Menu.svelte';
	import { rendreFocus } from '#lib/ui/retour-focus.ts';
	import Panneau from '#lib/ui/Panneau.svelte';
	import Pastille from '#lib/ui/Pastille.svelte';
	import BlocPiecesSomme from '#lib/ui/piece/BlocPiecesSomme.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	let { data, form } = $props();

	const parametre = $derived(page.url.searchParams.get('ajout'));
	const ouvert = $derived(data.peutSaisir && (parametre === 'creance' || parametre === 'dette'));
	const fermer = () => changerUrl({ ajout: null });
	let piecesEnSaisie = $state<PieceDeposee[]>([]);
	const envoi = creerEnvoi({
		apres: () => {
			piecesEnSaisie = [];
			fermer();
		}
	});

	// La somme dont on regarde les Pièces : `?somme=12`.
	const toutes = $derived([...data.suivi.aRecevoir.rangees, ...data.suivi.aPayer.rangees]);
	const regardee = $derived(
		toutes.find((r) => String(r.id) === page.url.searchParams.get('somme')) ?? null
	);
	const fermerPieces = () => changerUrl({ somme: null });
	/** Une Dette inscrite au bilan doit avoir sa facture. Celle d'un Avoir a déjà la sienne. */
	const sansPiece = (r: RangeeSuivi) =>
		r.sens === 'dette' && r.factureId === null && r.pieces.length === 0;

	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const erreurs = $derived(form?.erreur?.champs ?? {});
	const sensInitial = $derived((saisie.sens ?? parametre ?? 'creance') as Sens);

	const fige = $derived(data.exercice?.statut === 'cloture');
	const actif = $derived(data.peutSaisir && !fige);
	const vide = $derived(
		data.suivi.aRecevoir.rangees.length === 0 && data.suivi.aPayer.rangees.length === 0
	);
	const dateParDefaut = $derived(dateProposee(data.aujourdhui, data.exercice));
	const passe = $derived((data.exercice?.fin ?? data.aujourdhui) < data.aujourdhui);
	const optionsAction = $derived([
		{ valeur: '', libelle: 'Sans Action' },
		...data.actions.map((a) => ({ valeur: String(a.id), libelle: a.libelle }))
	]);

	let erreur = $state<string | null>(null);

	function suivre(r: Awaited<ReturnType<typeof envoyer>>): boolean {
		if (r.type === 'ok') {
			erreur = null;
			return true;
		}
		if (r.type === 'session') demanderReconnexion();
		else if (r.type === 'refus') erreur = messageErreur(r.erreur);
		else erreur = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		return false;
	}

	async function annuler(r: RangeeSuivi) {
		if (!suivre(await envoyer(`/api/creances/${r.id}/annuler`))) return;
		afficherToast('Somme annulée.', {
			libelle: 'Annuler',
			faire: async () => {
				suivre(await envoyer(`/api/creances/${r.id}/retablir`));
				await refreshAll();
			}
		});
		await refreshAll();
		// La rangée et son menu sont partis : le focus va à une cible stable.
		if (document.activeElement === document.body) rendreFocus(null);
	}
</script>

{#snippet bloc(titre: string, b: BlocSuivi, videTexte: string)}
	<section class="bloc" aria-label={titre}>
		<header class="tete">
			<h2 class="t-heading">{titre}</h2>
			<p class="total">
				<span class="t-caption t-muted">Total</span>
				<span class="montant-lg">{formaterMontant(b.total)}</span>
			</p>
		</header>
		{#if b.rangees.length === 0}
			<p class="rien t-muted">{videTexte}</p>
		{:else}
			<Tableau legende={titre}>
				<thead>
					<tr>
						<th scope="col" class="c-tiers">Tiers</th>
						<th scope="col" class="c-motif">Motif</th>
						<th scope="col" class="c-action">Action</th>
						<th scope="col" class="c-piece">Pièce</th>
						<th scope="col" class="droite c-reste">Reste dû</th>
						{#if actif}
							<th scope="col" class="seulement-ordinateur c-gestes">
								<span class="visuellement-cache">Actions</span>
							</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each b.rangees as r (r.id)}
						<tr id="somme-{r.id}">
							<td class="principale">{r.tiers}</td>
							<td>
								{#if r.factureId !== null && data.peutSaisir}
									<a href="/factures/{r.factureId}">{r.motif}</a>
								{:else}
									{r.motif}
								{/if}
							</td>
							<td class="t-muted">{r.action ?? ''}</td>
							<td>
								{#if r.pieces.length > 0}
									<Bouton variante="discret" href={urlAvec({ somme: String(r.id) })} conserverFocus>
										<Paperclip size={20} strokeWidth={1.75} aria-hidden="true" />
										{r.pieces.length}
										<span class="visuellement-cache">Pièces de {r.tiers}, {r.motif}</span>
									</Bouton>
								{:else if sansPiece(r)}
									{#if data.peutSaisir}
										<a
											class="lien-pastille"
											href={urlAvec({ somme: String(r.id) })}
											aria-label="Sans Pièce : joindre la Pièce de {r.tiers}, {r.motif}"
										>
											<Pastille etat="a_regarder" texte="Sans Pièce" />
										</a>
									{:else}
										<Pastille etat="a_regarder" texte="Sans Pièce" />
									{/if}
								{:else if data.peutSaisir && r.factureId === null}
									<Bouton variante="discret" href={urlAvec({ somme: String(r.id) })} conserverFocus>
										<Paperclip size={20} strokeWidth={1.75} aria-hidden="true" />
										<span class="visuellement-cache">Joindre une Pièce à {r.tiers}, {r.motif}</span>
									</Bouton>
								{/if}
							</td>
							<td class="montant">
								{formaterMontant(r.reste)}
								{#if r.reste !== r.montant}
									<span class="sur t-caption t-muted">sur {formaterMontant(r.montant)}</span>
								{/if}
							</td>
							{#if actif}
								<td class="gestes seulement-ordinateur">
									<Bouton
										variante="discret"
										href={urlAvec({ op: 'nouvelle', solder: String(r.id) })}
										conserverFocus
									>
										Solder
									</Bouton>
									{#if !r.geree}
										<Menu nom="Actions de {r.tiers}" flottant classe="bouton-ligne">
											{#snippet bouton()}
												<Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
											{/snippet}
											<button type="button" onclick={() => annuler(r)}>Annuler cette somme</button>
										</Menu>
									{/if}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</Tableau>
		{/if}
	</section>
{/snippet}

<EnTete
	titre="Créances et Dettes"
	aide={{ ancre: 'creance-dette', texte: 'Qu’est-ce qu’une Créance, une Dette ?' }}
	sousTitre={passe ? `Reste dû au ${formaterDateLongue(data.suivi.date)}.` : undefined}
>
	{#snippet actions()}
		{#if actif && !vide}
			<span class="seulement-ordinateur">
				<Bouton href={urlAvec({ ajout: 'creance' })} conserverFocus>
					<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
					Ajouter
				</Bouton>
			</span>
		{/if}
	{/snippet}
</EnTete>

{#if erreur}
	<div class="alerte"><Bandeau ton="erreur" alerte>{erreur}</Bandeau></div>
{/if}

{#if vide}
	<EtatVide
		icone={Handshake}
		titre="Rien en attente"
		phrase="Personne ne doit rien à l’association, et l’association ne doit rien à personne."
	>
		{#snippet action()}
			{#if actif}
				<span class="seulement-ordinateur">
					<Bouton href={urlAvec({ ajout: 'creance' })} conserverFocus>Ajouter</Bouton>
				</span>
			{/if}
		{/snippet}
	</EtatVide>
{:else}
	<div class="blocs">
		{@render bloc('À recevoir', data.suivi.aRecevoir, 'Personne ne doit rien à l’association.')}
		{@render bloc('À payer', data.suivi.aPayer, 'L’association ne doit rien à personne.')}
	</div>
{/if}

<Panneau {ouvert} titre="Ajouter une somme" {fermer}>
	{#key parametre}
		<form
			id="form-creance"
			method="post"
			action="?/ajouter"
			class="pile"
			novalidate
			use:enhance={envoi.soumettre}
		>
			<ChampListe
				etiquette="Sens"
				name="sens"
				valeur={sensInitial}
				options={[
					{ valeur: 'creance', libelle: 'À recevoir : on doit cette somme à l’association' },
					{ valeur: 'dette', libelle: 'À payer : l’association doit cette somme' }
				]}
				aide="Un remboursement de bénévole en attente est une somme à payer."
			/>
			<Champ
				etiquette="Tiers"
				name="tiers"
				required
				valeur={saisie.tiers ?? ''}
				erreur={erreurs.tiers}
				autocomplete="off"
			/>
			<Champ
				etiquette="Motif"
				name="motif"
				required
				valeur={saisie.motif ?? ''}
				erreur={erreurs.motif}
				autocomplete="off"
			/>
			<div class="deux">
				<ChampMontant
					etiquette="Montant"
					name="montant"
					required
					valeur={saisie.montant ?? ''}
					erreur={erreurs.montant}
				/>
				<Champ
					etiquette="Date"
					name="date"
					type="date"
					required
					valeur={saisie.date ?? dateParDefaut}
					erreur={erreurs.date}
				/>
			</div>
			<ChampListe
				etiquette="Action"
				name="actionId"
				valeur={saisie.actionId ?? ''}
				options={optionsAction}
			/>
			<ChampZone etiquette="Note" name="note" lignes={2} valeur={saisie.note ?? ''} />
			<input type="hidden" name="pieces" value={piecesEnSaisie.map((p) => p.id).join(',')} />
			<BlocPiecesSomme creanceId={null} bind:enSaisie={piecesEnSaisie} actif />
			{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
				<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
			{/if}
		</form>
	{/key}
	{#snippet pied()}
		<Bouton type="submit" form="form-creance" occupe={envoi.occupe}>Enregistrer</Bouton>
	{/snippet}
</Panneau>

<Panneau
	ouvert={regardee !== null}
	titre={regardee ? `${regardee.tiers}, ${regardee.motif}` : ''}
	fermer={fermerPieces}
>
	{#if regardee}
		<BlocPiecesSomme creanceId={regardee.id} pieces={regardee.pieces} actif={data.peutSaisir} />
	{/if}
</Panneau>

<style>
	.alerte {
		margin-top: var(--espace-4);
	}

	.blocs {
		display: grid;
		gap: var(--espace-6);
		margin-top: var(--espace-5);
	}

	.bloc {
		display: grid;
		gap: var(--espace-2);
	}

	.tete {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--espace-3);
	}

	.total {
		display: inline-flex;
		align-items: baseline;
		gap: var(--espace-2);
	}

	.rien {
		padding: var(--espace-3) 0;
	}

	/* Mêmes colonnes dans les deux blocs : ils se lisent l'un sous l'autre. */
	.c-tiers {
		width: 22%;
	}

	.c-motif {
		width: 26%;
	}

	.c-piece {
		width: 10%;
	}

	.lien-pastille {
		text-decoration: none;
	}

	.c-action {
		width: 16%;
	}

	.c-reste {
		width: 14%;
	}

	.c-gestes {
		width: 14%;
	}

	.sur {
		display: block;
		font-weight: var(--typo-body-graisse, 400);
	}

	.gestes {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--espace-1);
		height: var(--espace-row);
	}

	:global(.bouton-ligne) {
		justify-content: center;
		width: var(--espace-row) !important;
		color: var(--ink-muted);
	}

	.pile {
		display: grid;
		gap: var(--espace-4);
	}

	.deux {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--espace-3);
		align-items: start;
	}

	@media (max-width: 639.98px) {
		.deux {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
