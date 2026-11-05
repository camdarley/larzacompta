<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { CircleCheck, Ellipsis } from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import type { DepenseSansPiece, PieceDeposee } from '#lib/domaine/pieces/index.ts';
	import { phraseAutres } from '#lib/domaine/pieces/index.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Menu from '#lib/ui/Menu.svelte';
	import DepotPiece from '#lib/ui/piece/DepotPiece.svelte';
	import { deposerPiece } from '#lib/ui/piece/depot.ts';
	import EntetePieces from '#lib/ui/piece/EntetePieces.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import { urlAvec } from '#lib/ui/url.ts';

	let { data } = $props();

	let erreur = $state<{ texte: string; reessayer: (() => void) | null } | null>(null);
	let survolee = $state<number | null>(null);

	function suivre(r: Awaited<ReturnType<typeof envoyer>>): boolean {
		if (r.type === 'ok') {
			erreur = null;
			return true;
		}
		if (r.type === 'session') demanderReconnexion();
		else if (r.type === 'refus') erreur = { texte: messageErreur(r.erreur), reessayer: null };
		else {
			const code = r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur';
			erreur = { texte: message(code), reessayer: null };
		}
		return false;
	}

	function apresDepot(d: DepenseSansPiece, p: PieceDeposee) {
		const autre = phraseAutres(p.autresOperations);
		afficherToast(autre ? `Pièce jointe. ${autre}.` : 'Pièce jointe.', {
			libelle: 'Annuler',
			faire: async () => {
				suivre(await envoyer(`/api/pieces/${p.id}/detacher`, { operationId: d.id }));
				await refreshAll();
			}
		});
		refreshAll();
	}

	async function surDepotRangee(e: DragEvent, d: DepenseSansPiece) {
		e.preventDefault();
		survolee = null;
		for (const fichier of e.dataTransfer?.files ?? []) {
			const r = await deposerPiece(fichier, { operationId: d.id });
			if (suivre(r) && r.type === 'ok') apresDepot(d, r.valeur);
		}
	}

	async function dispenser(d: DepenseSansPiece, sansPiece: boolean) {
		if (!suivre(await envoyer(`/api/operations/${d.id}/sans-piece`, { sansPiece }))) return;
		if (sansPiece) {
			afficherToast('Cette dépense ne demande plus de Pièce.', {
				libelle: 'Annuler',
				faire: () => void dispenser(d, false)
			});
		}
		await refreshAll();
	}
</script>

<EntetePieces manquantes={data.manquantes.length} toutes={data.existantes} />

{#if erreur}
	<div class="alerte">
		<Bandeau ton="erreur" alerte>
			{erreur.texte}
			{#snippet action()}
				{#if erreur?.reessayer}
					<Bouton variante="secondaire" onclick={() => erreur?.reessayer?.()}>Réessayer</Bouton>
				{/if}
			{/snippet}
		</Bandeau>
	</div>
{/if}

{#if data.manquantes.length === 0}
	<EtatVide
		icone={CircleCheck}
		titre="Aucune Pièce ne manque"
		phrase="Chaque dépense a sa Pièce."
	/>
{:else}
	<Tableau legende="Dépenses sans Pièce">
		<thead>
			<tr>
				<th scope="col">Date</th>
				<th scope="col">Dépense</th>
				<th scope="col">Compte</th>
				<th scope="col" class="droite">Montant</th>
				{#if data.peutSaisir}
					<th scope="col"><span class="visuellement-cache">Actions</span></th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each data.manquantes as d (d.id)}
				<tr
					class:survol={survolee === d.id}
					ondragover={data.peutSaisir
						? (e) => {
								e.preventDefault();
								survolee = d.id;
							}
						: undefined}
					ondragleave={() => (survolee = null)}
					ondrop={data.peutSaisir ? (e) => surDepotRangee(e, d) : undefined}
				>
					<td class="date">{formaterDateCourte(d.date)}</td>
					<td class="principale">
						<a href={urlAvec({ op: String(d.id) })} data-sveltekit-reset="false">{d.libelle}</a>
						<span class="t-caption t-muted resume">
							{d.actions === 'Sans Action' ? d.natures : `${d.natures}, ${d.actions}`}
						</span>
					</td>
					<td class="t-muted">{d.compte}</td>
					<td class="montant">{formaterMontant(d.montant)}</td>
					{#if data.peutSaisir}
						<td class="actions">
							<div class="gestes">
								<DepotPiece
									operationId={d.id}
									compact
									libelleBouton="Joindre"
									nomCompact="Joindre une Pièce à {d.libelle}"
									surDepose={(p) => apresDepot(d, p)}
									surErreur={(texte, reessayer) => (erreur = { texte, reessayer })}
								/>
								<Menu nom="Actions de {d.libelle}" flottant classe="bouton-ligne">
									{#snippet bouton()}
										<Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
									{/snippet}
									<button type="button" onclick={() => dispenser(d, true)}
										>Pas besoin de Pièce</button
									>
								</Menu>
							</div>
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</Tableau>
{/if}

<style>
	.alerte {
		margin-bottom: var(--espace-4);
	}

	.droite {
		text-align: right;
	}

	.date {
		white-space: nowrap;
	}

	.resume {
		display: block;
	}

	.gestes {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--espace-1);
		white-space: nowrap;
	}

	:global(.bouton-ligne) {
		justify-content: center;
		width: var(--espace-row) !important;
		color: var(--ink-muted);
	}

	tr.survol {
		background: var(--primary-soft) !important;
	}

	@media (max-width: 639.98px) {
		.actions {
			flex-basis: 100%;
		}
	}
</style>
