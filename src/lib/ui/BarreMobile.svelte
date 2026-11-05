<script lang="ts">
	import { page } from '$app/state';
	import { Menu } from '@lucide/svelte';
	import type { Entree } from '#lib/fonctions.ts';
	import Icone from './Icone.svelte';
	import { photoAttendue } from './piece/photo-attente.svelte.ts';

	let { entrees, lien }: { entrees: Entree[]; lien: (href: string) => string } = $props();

	const actif = (e: Entree) =>
		e.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(e.href);

	const estPhoto = (e: Entree) => e.href === '/pieces/photo';
	let appareil = $state<HTMLInputElement | null>(null);

	/** L'appareil ne s'ouvre que sur un geste : c'est ce toucher qui l'ouvre, le lien suit. */
	function surPhoto() {
		appareil?.click();
	}

	function surCliche(e: Event & { currentTarget: HTMLInputElement }) {
		photoAttendue.fichier = e.currentTarget.files?.[0] ?? null;
		e.currentTarget.value = '';
	}
</script>

{#if entrees.some(estPhoto)}
	<input
		bind:this={appareil}
		hidden
		type="file"
		accept="image/*"
		capture="environment"
		aria-label="Prendre une photo"
		onchange={surCliche}
	/>
{/if}

<nav class="barre" aria-label="Navigation mobile">
	<ul>
		{#each entrees as e (e.href)}
			<li>
				<a
					href={lien(e.href)}
					aria-current={actif(e) ? 'page' : undefined}
					onclick={estPhoto(e) ? surPhoto : undefined}
				>
					<Icone nom={e.icone} taille={24} />
					<span>{e.libelleCourt ?? e.libelle}</span>
				</a>
			</li>
		{/each}
		<li>
			<a href={lien('/plus')} aria-current={page.url.pathname === '/plus' ? 'page' : undefined}>
				<Menu size={24} strokeWidth={1.75} aria-hidden="true" />
				<span>Plus</span>
			</a>
		</li>
	</ul>
</nav>

<style>
	.barre {
		display: none;
	}

	@media (max-width: 639.98px) {
		.barre {
			position: fixed;
			z-index: 20;
			right: 0;
			bottom: 0;
			left: 0;
			display: block;
			padding-bottom: env(safe-area-inset-bottom);
			border-top: 1px solid var(--border);
			background: var(--surface-raised);
		}

		ul {
			display: flex;
			height: var(--espace-8);
		}

		li {
			flex: 1;
		}

		a {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 2px;
			height: 100%;
			font-size: var(--typo-caption-taille);
			color: var(--ink-muted);
			text-decoration: none;
		}

		a[aria-current='page'] {
			color: var(--primary);
			font-weight: var(--typo-label-graisse);
		}
	}
</style>
