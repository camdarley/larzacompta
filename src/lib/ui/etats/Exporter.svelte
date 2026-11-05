<script lang="ts">
	import { page } from '$app/state';
	import { ChevronDown, Download } from '@lucide/svelte';
	import Menu from '#lib/ui/Menu.svelte';

	type Props = {
		/** État exporté, tel qu'affiché : `compte-de-resultat`, `tresorerie`, `actions`, `action`, `budget`. */
		etat: string;
		actionId?: number;
	};
	let { etat, actionId }: Props = $props();

	const adresse = (format: 'pdf' | 'xlsx') => {
		const exercice = page.url.searchParams.get('exercice');
		const comparer = page.url.searchParams.get('comparer');
		const q = new URLSearchParams({
			etat,
			format,
			...(exercice ? { exercice } : {}),
			...(comparer ? { comparer } : {}),
			...(actionId === undefined ? {} : { id: String(actionId) })
		});
		return `/etats/export?${q}`;
	};
</script>

<Menu nom="Exporter" classe="bouton-exporter" flottant>
	{#snippet bouton()}
		<Download size={20} strokeWidth={1.75} aria-hidden="true" />
		<span>Exporter</span>
		<ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
	{/snippet}
	<a href={adresse('pdf')} data-sveltekit-reload download>PDF</a>
	<a href={adresse('xlsx')} data-sveltekit-reload download>XLSX, pour un tableur</a>
</Menu>

<style>
	:global(.bouton-exporter) {
		min-height: var(--espace-row);
		padding: 0 var(--espace-3) !important;
		border: 1px solid var(--border-strong) !important;
		background: var(--surface-raised) !important;
		color: var(--primary) !important;
		font-size: 16px;
		font-weight: var(--typo-label-graisse);
	}

	:global(.bouton-exporter:hover) {
		background: var(--primary-soft) !important;
	}
</style>
