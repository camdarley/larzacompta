<script lang="ts">
	import { page } from '$app/state';
	import { LogOut, SlidersHorizontal } from '@lucide/svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import Icone from '#lib/ui/Icone.svelte';

	let { data } = $props();

	const lien = (href: string) => {
		const choisi = page.url.searchParams.get('exercice');
		return choisi ? `${href}?exercice=${encodeURIComponent(choisi)}` : href;
	};
</script>

<EnTete titre="Plus" />

{#each data.nav.groupes as g (g.titre)}
	<section class="groupe">
		<h2 class="t-caption t-muted">{g.titre}</h2>
		<ul>
			{#each g.entrees as e (e.href)}
				<li>
					<a href={lien(e.href)}><Icone nom={e.icone} />{e.libelle}</a>
				</li>
			{/each}
		</ul>
	</section>
{/each}

<section class="groupe">
	<h2 class="t-caption t-muted">Autres</h2>
	<ul>
		{#each data.nav.bas as e (e.href)}
			<li>
				<a href={lien(e.href)}><Icone nom={e.icone} />{e.libelle}</a>
			</li>
		{/each}
		<li>
			<a href="/preferences">
				<SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
				Préférences
			</a>
		</li>
		<li>
			<form method="post" action="/deconnexion" data-sveltekit-reload>
				<button type="submit">
					<LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
					Se déconnecter
				</button>
			</form>
		</li>
	</ul>
</section>

<style>
	.groupe {
		margin-top: var(--espace-5);
	}

	ul {
		margin-top: var(--espace-1);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	li + li {
		border-top: 1px solid var(--border);
	}

	a,
	button {
		display: flex;
		align-items: center;
		gap: var(--espace-3);
		width: 100%;
		min-height: var(--espace-touch);
		padding: 0 var(--espace-4);
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}
</style>
