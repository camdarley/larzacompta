<script lang="ts">
	import { page } from '$app/state';

	type Onglet = {
		libelle: string;
		href: string;
		compteur?: number;
		/** Une page fille garde son onglet actif : Remise n° 3 reste dans Remises. */
		sousPages?: boolean;
	};
	type Props = { nom: string; onglets: readonly Onglet[]; vertical?: boolean };

	let { nom, onglets, vertical = false }: Props = $props();
	let liste = $state<HTMLElement | null>(null);

	const actif = (o: Onglet) => {
		const chemin = o.href.split('?')[0] as string;
		const ici = page.url.pathname;
		return ici === chemin || (o.sousPages === true && ici.startsWith(`${chemin}/`));
	};

	/** Sur téléphone la rangée défile : l'onglet actif ne doit pas rester coupé au bord. */
	$effect(() => {
		void page.url.pathname;
		const courant = liste?.querySelector<HTMLElement>('[aria-current="page"]');
		const rangee = liste?.querySelector('ul');
		if (!courant || !rangee || rangee.scrollWidth <= rangee.clientWidth) return;
		rangee.scrollLeft = courant.offsetLeft - (rangee.clientWidth - courant.offsetWidth) / 2;
	});

	/** Chaque onglet a son URL ; les flèches parcourent la liste (EXPERIENCE.md). */
	function surTouche(e: KeyboardEvent) {
		const suivant = e.key === 'ArrowRight' || (vertical && e.key === 'ArrowDown');
		const precedent = e.key === 'ArrowLeft' || (vertical && e.key === 'ArrowUp');
		if (!suivant && !precedent) return;
		const liens = [...(liste?.querySelectorAll('a') ?? [])];
		const i = liens.indexOf(document.activeElement as HTMLAnchorElement);
		if (i < 0) return;
		e.preventDefault();
		const n = liens.length;
		liens[(i + (suivant ? 1 : -1) + n) % n]?.focus();
	}
</script>

<nav class="onglets" class:vertical aria-label={nom} bind:this={liste}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<ul onkeydown={surTouche}>
		{#each onglets as o (o.href)}
			<li>
				<a
					class="t-label"
					href={o.href}
					aria-current={actif(o) ? 'page' : undefined}
					data-sveltekit-preload-data="hover"
				>
					{o.compteur === undefined ? o.libelle : `${o.libelle} (${o.compteur})`}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.onglets {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-1) var(--espace-4);
		border-bottom: 1px solid var(--border);
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: var(--espace-row);
		padding: 0 var(--espace-1);
		border-bottom: 2px solid transparent;
		color: var(--ink-muted);
		text-decoration: none;
	}

	a:hover {
		color: var(--primary);
	}

	a[aria-current='page'] {
		color: var(--primary);
		border-bottom-color: var(--primary);
	}

	/* Une seule rangée sur téléphone : elle défile, le trait actif reste sous son onglet. */
	@media (max-width: 639.98px) {
		ul {
			position: relative;
			flex-wrap: nowrap;
			gap: 0 var(--espace-3);
			overflow-x: auto;
			scrollbar-width: none;
		}

		li {
			flex: none;
		}

		a {
			min-height: var(--espace-touch);
			white-space: nowrap;
		}
	}

	/* Colonne de sections à gauche sur ordinateur. */
	@media (min-width: 1024px) {
		.vertical ul {
			flex-direction: column;
			gap: var(--espace-1);
			border-bottom: 0;
		}

		.vertical a {
			display: flex;
			padding: 0 var(--espace-3);
			border-bottom: 0;
			border-radius: var(--rayon-md);
		}

		.vertical a:hover {
			background: var(--surface-sunken);
		}

		.vertical a[aria-current='page'] {
			background: var(--primary-soft);
		}
	}
</style>
