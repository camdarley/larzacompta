<script lang="ts">
	import {
		ARTICLES,
		ARTICLES_ETATS,
		GLOSSAIRE,
		PREMIERE_ANNEE,
		RACCOURCIS,
		RACCOURCIS_POINTAGE
	} from '#lib/aide.ts';
	import { ChevronDown } from '@lucide/svelte';
	import { page } from '$app/state';
	import EnTete from '#lib/ui/EnTete.svelte';
	import Touche from '#lib/ui/Touche.svelte';

	let { data } = $props();

	/** Le·la compteur·se vient pour compter : son article passe avant le reste. */
	const compteur = $derived(page.data.acces?.role === 'compteur');
	const articles = $derived.by(() => {
		const tous = [...ARTICLES, ...ARTICLES_ETATS];
		if (!compteur) return tous;
		return [...tous.filter((a) => a.id === 'comptage'), ...tous.filter((a) => a.id !== 'comptage')];
	});

	const sommaire = $derived([
		...(compteur ? [] : [{ id: 'premiere-annee', titre: 'Votre première année' }]),
		...articles.map((a) => ({ id: a.id, titre: a.titre })),
		...(compteur ? [{ id: 'premiere-annee', titre: 'Votre première année' }] : []),
		{ id: 'glossaire', titre: 'Glossaire' },
		{ id: 'raccourcis', titre: 'Raccourcis du clavier' },
		...(data.codeSource ? [{ id: 'code-source', titre: 'Code source' }] : [])
	]);
</script>

{#snippet liens()}
	<ol>
		{#each sommaire as e (e.id)}
			<li><a href="#{e.id}">{e.titre}</a></li>
		{/each}
	</ol>
{/snippet}

{#snippet premiereAnnee()}
	<section id="premiere-annee">
		<h2 class="t-heading">Votre première année</h2>
		<ol class="annee">
			{#each PREMIERE_ANNEE as e (e.titre)}
				<li><strong>{e.titre}.</strong> {e.texte}</li>
			{/each}
		</ol>
	</section>
{/snippet}

<EnTete
	titre="Aide"
	sousTitre={compteur
		? 'Tout ce qu’il faut pour compter une caisse, sans formation. Cette aide reste sur votre instance.'
		: 'Tout ce qu’il faut pour tenir la trésorerie, sans formation. Cette aide reste sur votre instance.'}
/>

<div class="aide">
	<details class="sommaire-replie">
		<summary class="t-label">
			Sommaire
			<ChevronDown class="chevron" size={20} strokeWidth={1.75} aria-hidden="true" />
		</summary>
		<nav aria-label="Sommaire de l’Aide">{@render liens()}</nav>
	</details>
	<nav class="sommaire-colonne" aria-label="Sommaire de l’Aide">
		<p class="t-label">Sommaire</p>
		{@render liens()}
	</nav>
	<div class="lecture">
		{#if !compteur}{@render premiereAnnee()}{/if}

		{#each articles as a (a.id)}
			<section id={a.id}>
				<h2 class="t-heading">{a.titre}</h2>
				{#each a.paragraphes as p (p)}<p>{p}</p>{/each}
			</section>
		{/each}

		{#if compteur}{@render premiereAnnee()}{/if}

		<section id="glossaire">
			<h2 class="t-heading">Glossaire</h2>
			<dl>
				{#each GLOSSAIRE as t (t.terme)}
					<div id="terme-{t.ancre}">
						<dt>{t.terme}</dt>
						<dd>{t.definition}</dd>
					</div>
				{/each}
			</dl>
		</section>

		<section id="raccourcis">
			<h2 class="t-heading">Raccourcis du clavier</h2>
			<ul>
				{#each RACCOURCIS as r (r.touche)}
					<li><Touche contenu>{r.touche}</Touche> {r.effet}</li>
				{/each}
			</ul>
			<h3 class="t-label">Dans le Pointage</h3>
			<ul>
				{#each RACCOURCIS_POINTAGE as r (r.touche)}
					<li><Touche contenu>{r.touche}</Touche> {r.effet}</li>
				{/each}
			</ul>
		</section>

		{#if data.codeSource}
			<section id="code-source">
				<h2 class="t-heading">Code source</h2>
				<p>
					Cet outil est un logiciel libre, sous licence AGPL-3.0.
					<a href="/code-source" data-sveltekit-reload>Télécharger le code de cette installation</a
					>.
				</p>
			</section>
		{/if}
	</div>
</div>

<style>
	.aide {
		display: grid;
		gap: var(--espace-4);
		margin-top: var(--espace-6);
	}

	.aide section {
		scroll-margin-top: var(--espace-6);
	}

	.sommaire-replie {
		padding: var(--espace-2) var(--espace-3);
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-raised);
	}

	.sommaire-replie summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: var(--espace-touch);
		cursor: pointer;
	}

	.sommaire-replie summary :global(.chevron) {
		color: var(--ink-muted);
		transition: transform var(--mouvement-etat);
	}

	.sommaire-replie[open] summary :global(.chevron) {
		transform: rotate(180deg);
	}

	.sommaire-colonne {
		display: none;
	}

	.aide ol {
		display: grid;
		gap: var(--espace-1);
	}

	.aide nav li {
		display: block;
		min-height: 0;
	}

	.aide nav a {
		display: block;
		padding: var(--espace-1) 0;
		text-decoration: none;
	}

	.aide nav a:hover {
		text-decoration: underline;
	}

	/* Assez de place : le sommaire suit la lecture, à droite. */
	@media (min-width: 1024px) {
		.aide {
			grid-template-columns: minmax(0, var(--espace-reading-max)) minmax(200px, 280px);
			align-items: start;
			gap: var(--espace-7, 48px);
		}

		.sommaire-replie {
			display: none;
		}

		.sommaire-colonne {
			position: sticky;
			top: var(--espace-4);
			display: grid;
			grid-column: 2;
			grid-row: 1;
			gap: var(--espace-2);
			max-height: calc(100dvh - 2 * var(--espace-4));
			overflow-y: auto;
			font-size: var(--typo-label-taille);
		}

		.lecture {
			grid-column: 1;
			grid-row: 1;
		}
	}

	.lecture {
		display: grid;
		gap: var(--espace-6);
		max-width: var(--espace-reading-max);
	}

	section > :global(* + *) {
		margin-top: var(--espace-2);
	}

	.annee {
		display: grid;
		gap: var(--espace-2);
	}

	.annee li {
		display: block;
		min-height: 0;
	}

	dl {
		display: grid;
		gap: var(--espace-3);
	}

	dt {
		font-weight: var(--typo-body-strong-graisse);
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-row);
	}
</style>
