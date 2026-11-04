<script lang="ts">
	import { CircleUserRound, LogOut, SlidersHorizontal } from '@lucide/svelte';
	import Menu from './Menu.svelte';

	let { nom }: { nom: string } = $props();
</script>

<Menu nom="Menu personnel de {nom}" sens="haut" classe="menu-personnel">
	{#snippet bouton()}
		<CircleUserRound size={20} strokeWidth={1.75} aria-hidden="true" />
		<span class="nom">{nom}</span>
	{/snippet}
	<a href="/preferences">
		<SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
		Préférences
	</a>
	<form method="post" action="/deconnexion" data-sveltekit-reload>
		<button type="submit">
			<LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
			Se déconnecter
		</button>
	</form>
</Menu>

<style>
	:global(.menu-personnel:hover) {
		background: var(--primary-soft) !important;
		color: var(--primary);
	}

	.nom {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 1023.98px) {
		.nom {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		:global(.menu-personnel) {
			justify-content: center;
		}
	}
</style>
