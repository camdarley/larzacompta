<script lang="ts">
	import { untrack } from 'svelte';
	import { centimes, formaterSaisie, lireMontant, type Centimes } from '#lib/domaine/montant.ts';
	import { message, messageErreur, type CodeMessage } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';

	type Props = {
		compteId: number;
		dateProposee: string;
		fermer: () => void;
		/** Après l'écriture : recharge la file. */
		apres: () => Promise<void>;
		/** Recopie d'une Opération sans ligne : la date reste à vérifier sur le relevé. */
		depuis?: { libelle: string; montant: Centimes } | null;
	};

	let { compteId, dateProposee, fermer, apres, depuis = null }: Props = $props();

	let date = $state(untrack(() => dateProposee));
	let libelle = $state(untrack(() => depuis?.libelle ?? ''));
	let montant = $state(
		untrack(() => (depuis ? formaterSaisie(centimes(Math.abs(depuis.montant))) : ''))
	);
	let sens = $state<'sortie' | 'entree'>(
		untrack(() => (depuis && depuis.montant > 0 ? 'entree' : 'sortie'))
	);
	let occupe = $state(false);
	let erreurs = $state<Record<string, string>>({});
	let alerte = $state<string | null>(null);

	async function enregistrer() {
		if (occupe) return;
		erreurs = {};
		alerte = null;
		if (libelle.trim() === '') erreurs.libelle = message('champ_requis');
		const lu = lireMontant(montant);
		if (!lu.ok || lu.valeur <= 0) erreurs.montant = message('montant_invalide');
		if (Object.keys(erreurs).length > 0 || !lu.ok) return;

		occupe = true;
		const r = await envoyer(`/api/pointage/comptes/${compteId}/lignes`, {
			date,
			libelle,
			montant: centimes(sens === 'sortie' ? -lu.valeur : lu.valeur)
		});
		occupe = false;
		if (r.type === 'ok') {
			fermer();
			await apres();
		} else if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'reseau' || r.type === 'serveur') {
			alerte = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		} else if (r.erreur.code === 'saisie_invalide') {
			const champs = (r.erreur.details?.champs ?? {}) as Record<string, CodeMessage>;
			erreurs = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, message(c)]));
		} else if (typeof r.erreur.details?.champ === 'string') {
			erreurs = { [r.erreur.details.champ]: messageErreur(r.erreur) };
		} else {
			alerte = messageErreur(r.erreur);
		}
	}
</script>

<Panneau ouvert titre="Saisir une ligne" {fermer}>
	<form
		class="saisie"
		onsubmit={(e) => {
			e.preventDefault();
			enregistrer();
		}}
	>
		{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}
		<p class="t-muted">
			{#if depuis}
				Vérifiez sur votre relevé la date et le montant de cette ligne. Elle se pointera ensuite
				avec l’Opération.
			{:else}
				Sans fichier à importer, recopiez ici la ligne de votre relevé. Elle se pointe comme les
				autres.
			{/if}
		</p>
		<Champ
			etiquette="Date"
			name="ligne-date"
			type="date"
			bind:valeur={date}
			erreur={erreurs.date}
		/>
		<Champ
			etiquette="Libellé"
			name="ligne-libelle"
			bind:valeur={libelle}
			erreur={erreurs.libelle}
			autocomplete="off"
		/>
		<div class="sens" role="group" aria-label="Sens">
			<button type="button" aria-pressed={sens === 'sortie'} onclick={() => (sens = 'sortie')}>
				Sortie
			</button>
			<button type="button" aria-pressed={sens === 'entree'} onclick={() => (sens = 'entree')}>
				Entrée
			</button>
		</div>
		<ChampMontant
			etiquette="Montant"
			name="ligne-montant"
			bind:valeur={montant}
			erreur={erreurs.montant}
		/>
		<button class="visuellement-cache" type="submit" tabindex="-1" aria-hidden="true">
			Enregistrer
		</button>
	</form>

	{#snippet pied()}
		<Bouton {occupe} onclick={enregistrer}>Ajouter la ligne</Bouton>
		<Bouton variante="discret" onclick={fermer}>Laisser tel quel</Bouton>
	{/snippet}
</Panneau>

<style>
	.saisie {
		display: grid;
		gap: var(--espace-4);
	}

	.sens {
		display: flex;
		gap: var(--espace-1);
		padding: var(--espace-1);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.sens button {
		flex: 1;
		min-height: 40px;
		border: 1px solid transparent;
		border-radius: var(--rayon-sm);
		background: transparent;
		color: var(--ink-muted);
		font: inherit;
		font-weight: var(--typo-label-graisse);
		cursor: pointer;
	}

	.sens button[aria-pressed='true'] {
		border-color: var(--border-strong);
		background: var(--surface-raised);
		color: var(--primary);
	}
</style>
