<script lang="ts">
	import { Upload } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import Bouton from './Bouton.svelte';

	type Props = {
		/** Reçoit les fichiers, déposés, collés ou choisis. */
		deposer: (fichiers: File[]) => void;
		libelleBouton?: string;
		accepte?: string;
		multiple?: boolean;
		occupe?: boolean;
		/** `compact` : un simple bouton, la page entière restant une zone de dépôt. */
		compact?: boolean;
		children?: Snippet;
		autres?: Snippet;
	};

	let {
		deposer,
		libelleBouton = 'Choisir un fichier',
		accepte,
		multiple = true,
		occupe = false,
		compact = false,
		children,
		autres
	}: Props = $props();

	let champ = $state<HTMLInputElement | null>(null);
	let survol = $state(false);

	function surChoix(e: Event & { currentTarget: HTMLInputElement }) {
		const fichiers = [...(e.currentTarget.files ?? [])];
		e.currentTarget.value = '';
		if (fichiers.length > 0) deposer(fichiers);
	}

	function surDepot(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		survol = false;
		const fichiers = [...(e.dataTransfer?.files ?? [])];
		if (fichiers.length > 0) deposer(fichiers);
	}

	function surSurvol(e: DragEvent) {
		e.preventDefault();
		survol = true;
	}
</script>

{#snippet bouton()}
	<input bind:this={champ} hidden type="file" accept={accepte} {multiple} onchange={surChoix} />
	<Bouton variante={compact ? 'discret' : 'principal'} {occupe} onclick={() => champ?.click()}>
		<Upload size={20} strokeWidth={1.75} aria-hidden="true" />
		{libelleBouton}
	</Bouton>
{/snippet}

{#if compact}
	{@render bouton()}
{:else}
	<div
		class="depot-fichier"
		class:survol
		role="group"
		aria-label="Dépôt de fichier"
		ondragover={surSurvol}
		ondragleave={() => (survol = false)}
		ondrop={surDepot}
	>
		{@render children?.()}
		<div class="actions">
			{@render bouton()}
			{@render autres?.()}
		</div>
	</div>
{/if}

<style>
	.depot-fichier {
		display: grid;
		justify-items: center;
		gap: var(--espace-3);
		padding: var(--espace-4) var(--espace-4) var(--espace-6);
		border: 2px dashed var(--border-strong);
		border-radius: var(--rayon-lg);
		background: var(--surface-sunken);
		text-align: center;
	}

	.survol {
		background: var(--primary-soft);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--espace-2);
	}
</style>
