<script lang="ts">
	import { page } from '$app/state';
	import { Plus } from '@lucide/svelte';
	import type { Exercice } from '#lib/domaine/exercices.ts';
	import type { Entree, Navigation } from '#lib/fonctions.ts';
	import { urlAvec } from './url.ts';
	import Icone from './Icone.svelte';
	import MenuPersonnel from './MenuPersonnel.svelte';
	import SelecteurExercice from './SelecteurExercice.svelte';

	type Props = {
		nomApe: string;
		nav: Navigation;
		exercices: Exercice[];
		exercice: Exercice | null;
		nomAcces: string;
		peutSaisir: boolean;
		lien: (href: string) => string;
	};

	let { nomApe, nav, exercices, exercice, nomAcces, peutSaisir, lien }: Props = $props();

	const actif = (e: Entree) =>
		e.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(e.href);
</script>

{#snippet entree(e: Entree)}
	<li>
		<a href={lien(e.href)} aria-current={actif(e) ? 'page' : undefined}>
			<Icone nom={e.icone} />
			<span class="libelle">{e.libelle}</span>
		</a>
	</li>
{/snippet}

<aside class="barre">
	<div class="tete">
		<p class="t-heading nom">{nomApe}</p>
		{#if exercice}<SelecteurExercice {exercices} {exercice} />{/if}
	</div>

	{#if peutSaisir && exercice}
		<a
			class="nouvelle"
			href={urlAvec({ op: 'nouvelle', depuis: null, rendre: null })}
			data-sveltekit-reset="false"
			aria-label="Nouvelle Opération"
		>
			<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
			<span class="libelle">Nouvelle Opération</span>
		</a>
	{/if}

	<nav aria-label="Navigation principale" class="principale">
		{#each nav.groupes as g (g.titre)}
			<div class="groupe">
				<p class="t-caption titre-groupe">{g.titre}</p>
				<ul>
					{#each g.entrees as e (e.href)}{@render entree(e)}{/each}
				</ul>
			</div>
		{/each}
	</nav>

	<div class="pied">
		<nav aria-label="Navigation secondaire">
			<ul>
				{#each nav.bas as e (e.href)}{@render entree(e)}{/each}
			</ul>
		</nav>
		<MenuPersonnel nom={nomAcces} />
	</div>
</aside>

<style>
	.barre {
		position: sticky;
		top: 0;
		display: flex;
		flex-direction: column;
		gap: var(--espace-4);
		height: 100dvh;
		padding: var(--espace-4) var(--espace-3);
		background: var(--surface-sunken);
		color: var(--ink-muted);
	}

	.tete {
		display: grid;
		gap: var(--espace-2);
		padding: 0 var(--espace-1);
	}

	.nom {
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.principale {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.groupe + .groupe {
		margin-top: var(--espace-4);
	}

	.titre-groupe {
		padding: 0 var(--espace-3);
		margin-bottom: var(--espace-1);
	}

	ul {
		display: grid;
		gap: 2px;
	}

	a {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-row);
		padding: 0 var(--espace-3);
		border-radius: var(--rayon-md);
		color: var(--ink-muted);
		text-decoration: none;
		transition: background-color var(--mouvement-etat);
	}

	a:hover {
		background: var(--surface-base);
		color: var(--ink);
	}

	a[aria-current='page'] {
		background: var(--primary-soft);
		color: var(--primary);
		font-weight: var(--typo-label-graisse);
	}

	a.nouvelle {
		justify-content: center;
		background: var(--primary);
		color: var(--on-primary);
		font-weight: var(--typo-label-graisse);
	}

	a.nouvelle:hover {
		background: var(--primary-hover);
		color: var(--on-primary);
	}

	.pied {
		display: grid;
		gap: var(--espace-1);
		padding-top: var(--espace-2);
		border-top: 1px solid var(--border);
	}

	/* Tablette : rail d'icônes. L'en-tête compact porte le nom et l'Exercice. */
	@media (max-width: 1023.98px) {
		.barre {
			align-items: center;
			padding: var(--espace-3) var(--espace-1);
		}

		.tete,
		.titre-groupe {
			display: none;
		}

		.libelle {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		a {
			justify-content: center;
			width: var(--espace-touch);
			height: var(--espace-touch);
			padding: 0;
		}

		.groupe + .groupe {
			margin-top: var(--espace-2);
			padding-top: var(--espace-2);
			border-top: 1px solid var(--border);
		}
	}

	@media (max-width: 639.98px) {
		.barre {
			display: none;
		}
	}
</style>
