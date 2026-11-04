<script lang="ts">
	import '@fontsource-variable/fraunces/full.css';
	import '@fontsource-variable/source-sans-3/wght.css';
	import '#lib/ui/jetons.css';
	import '#lib/ui/base.css';
	import { afterNavigate } from '$app/navigation';
	import Toasts from '#lib/ui/Toasts.svelte';

	let { children } = $props();

	// Le focus suit la navigation vers un nouvel écran, pas l'ouverture d'un panneau (AD-19).
	afterNavigate(({ from, to, type }) => {
		if (type === 'enter' || from?.url.pathname === to?.url.pathname) return;
		document.querySelector<HTMLElement>('h1')?.focus();
	});
</script>

{@render children()}
<Toasts />
