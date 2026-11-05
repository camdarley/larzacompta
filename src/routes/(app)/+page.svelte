<script lang="ts">
	import { page } from '$app/state';
	import {
		CircleAlert,
		CircleCheck,
		Coins,
		FileUp,
		Landmark,
		Lock,
		Paperclip,
		ReceiptText,
		SearchAlert,
		Sprout,
		TriangleAlert,
		History,
		Wallet
	} from '@lucide/svelte';
	import { formaterJourMois } from '#lib/domaine/dates.ts';
	import { peut } from '#lib/domaine/droits.ts';
	import type { TacheControle } from '#lib/domaine/etats/controle.ts';
	import { message, TEXTES } from '#lib/messages.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import SoldeCompte from '#lib/ui/SoldeCompte.svelte';
	import TuileAFaire from '#lib/ui/TuileAFaire.svelte';

	let { data } = $props();

	const lien = (href: string) => {
		const choisi = page.url.searchParams.get('exercice');
		if (!choisi) return href;
		const lie = href.includes('?') ? '&' : '?';
		return `${href}${lie}exercice=${encodeURIComponent(choisi)}`;
	};

	const TUILES = {
		lignes: { libelle: 'Lignes de relevé à pointer', icone: Landmark, href: '/pointage' },
		pieces: { libelle: 'Pièces manquantes', icone: Paperclip, href: '/pieces' },
		anciennes: {
			libelle: 'Opérations anciennes à pointer',
			icone: History,
			href: '/operations?anciennes=1'
		},
		comptages: { libelle: 'Caisses à compter', icone: Wallet, href: '/caisses' },
		sessions: { libelle: 'Sessions de caisse non clôturées', icone: Coins, href: '/caisses' },
		recettes: { libelle: 'Recettes d’espèces à revoir', icone: Coins, href: '/caisses' },
		cheques: {
			libelle: 'Chèques reçus à remettre',
			icone: ReceiptText,
			href: '/cheques?etat=en_attente'
		},
		cheques_absents: {
			libelle: 'Chèques vus en banque, absents du registre',
			icone: SearchAlert,
			href: '/cheques/emis'
		}
	} as const satisfies Record<TacheControle, unknown>;

	/** Une liste que le rôle n'atteint pas garde son compteur, sans lien (EXPERIENCE.md). */
	const hrefTuile = (id: TacheControle) => {
		if (id === 'lignes' && !data.pointage) return null;
		if ((id === 'comptages' || id === 'sessions' || id === 'recettes') && !data.caisses)
			return null;
		if ((id === 'cheques' || id === 'cheques_absents') && !data.cheques) return null;
		return TUILES[id].href;
	};

	/** Toute la carte mène au Pointage, au détail de caisse ou aux Chèques, si le rôle y a accès. */
	function hrefCarte(c: { compte: { id: number; type: string } }) {
		if (c.compte.type === 'caisse') return data.caisses ? lien(`/caisses/${c.compte.id}`) : null;
		if (c.compte.type === 'cheques_a_remettre') return data.cheques ? lien('/cheques') : null;
		return data.pointage ? lien(`/pointage/${c.compte.id}`) : null;
	}

	const icones = {
		ecart: TriangleAlert,
		taches: CircleAlert,
		a_jour: CircleCheck,
		premier_releve: FileUp,
		cloture: Lock
	};
	const Icone = $derived(data.pret ? icones[data.bilan.type] : Sprout);
</script>

<EnTete titre="Tableau de contrôle" sansTitre />

{#each data.bandeaux as b (b)}
	<div class="exploitation">
		<Bandeau ton="regarder">
			{TEXTES[b]}
			{#if b !== 'version_obsolete'}
				<a href="/reglages/sauvegardes">Voir les sauvegardes</a>
			{/if}
		</Bandeau>
	</div>
{/each}

{#if data.pret}
	{#each data.demesures as compte (compte)}
		<div class="exploitation">
			<Bandeau ton="erreur">
				{message('releve_demesure')}
				{#if data.pointage}<a href="/pointage/{compte}">Ouvrir le Pointage</a>{/if}
			</Bandeau>
		</div>
	{/each}
{/if}

{#if !data.pret}
	<EtatVide
		principal
		icone={Sprout}
		titre="Bienvenue"
		phrase="Commençons par vos Comptes et leurs soldes de départ."
	>
		{#snippet action()}
			{#if peut(data.acces.role, 'parametrer')}
				<Bouton href="/bienvenue">Lancer l’assistant</Bouton>
			{/if}
		{/snippet}
	</EtatVide>
{:else}
	<header class="bilan {data.bilan.type}">
		<Icone size={32} strokeWidth={1.75} aria-hidden="true" />
		<div>
			<h1 class="t-display" tabindex="-1">{data.phrase}</h1>
			{#if data.dernierPointage}
				<p class="t-muted">Dernier relevé pointé le {formaterJourMois(data.dernierPointage)}.</p>
			{:else if data.premierReleve && data.pointage}
				{#if data.bilan.type !== 'premier_releve'}<p>{TEXTES.premier_releve}</p>{/if}
				<div class="suite"><Bouton href="/pointage">Importer un relevé</Bouton></div>
			{/if}
		</div>
	</header>

	{#each data.anomalies as a (a)}
		<div class="erreur"><Bandeau ton="erreur" alerte>{a}</Bandeau></div>
	{/each}

	<ul class="soldes" id="soldes">
		{#each data.cartes as c (c.compte.id)}
			<li>
				<SoldeCompte carte={c} href={hrefCarte(c)} />
			</li>
		{/each}
	</ul>

	{#if data.taches.length > 0 || data.aClore}<section
			class="a-faire"
			aria-labelledby="titre-a-faire"
		>
			<h2 id="titre-a-faire" class="t-heading">À faire</h2>
			<ul>
				{#each data.taches as t (t.id)}
					<li>
						<TuileAFaire
							libelle={TUILES[t.id].libelle}
							compteur={t.compteur}
							icone={TUILES[t.id].icone}
							href={hrefTuile(t.id) === null ? null : lien(hrefTuile(t.id) as string)}
						/>
					</li>
				{/each}
				{#if data.aClore}
					<li>
						<a class="cloture" href="/reglages/exercices/{data.aClore.id}/cloture">
							<Lock size={20} strokeWidth={1.75} aria-hidden="true" />
							{data.aClore.libelle} est terminé : vérifier et clôturer
						</a>
					</li>
				{/if}
			</ul>
		</section>{/if}
{/if}

<style>
	.exploitation {
		margin-bottom: var(--espace-4);
	}

	.exploitation a {
		display: inline-block;
		margin-left: var(--espace-1);
	}

	.bilan {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-3);
		margin-bottom: var(--espace-6);
		color: var(--primary);
	}

	.bilan h1 {
		color: var(--ink);
	}

	.bilan.ecart {
		color: var(--danger);
	}

	.bilan.taches {
		color: var(--warning);
	}

	.bilan.a_jour {
		color: var(--success);
	}

	.bilan :global(svg) {
		flex: none;
		margin-top: 4px;
	}

	.bilan p {
		color: var(--ink);
	}

	.bilan p.t-muted {
		color: var(--ink-muted);
	}

	.suite {
		margin-top: var(--espace-3);
	}

	.erreur {
		margin-bottom: var(--espace-4);
	}

	.soldes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--espace-4);
	}

	.a-faire {
		max-width: var(--espace-reading-max, 720px);
		margin-top: var(--espace-6);
	}

	.a-faire ul {
		margin-top: var(--espace-2);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
		overflow: hidden;
	}

	.a-faire li + li {
		border-top: 1px solid var(--border);
	}

	.cloture {
		display: flex;
		align-items: center;
		gap: var(--espace-3);
		min-height: var(--espace-touch);
		padding: var(--espace-2) var(--espace-3);
		text-decoration: none;
	}

	.cloture:hover {
		background: var(--primary-soft);
	}

	.cloture :global(svg) {
		flex: none;
	}
</style>
