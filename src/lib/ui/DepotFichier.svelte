<script lang="ts">
	import { Camera, Upload } from '@lucide/svelte';
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
		/** Zone basse, pour un `panneau`. */
		serre?: boolean;
		/** Bouton secondaire : la zone n'est pas l'action attendue de l'écran. */
		discret?: boolean;
		/** Sur téléphone, « Prendre une photo » ouvre l'appareil. */
		photo?: boolean;
		/** Accepte le collage d'un fichier, où que soit le focus. */
		collage?: boolean;
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
		serre = false,
		discret = false,
		photo = false,
		collage = false,
		children,
		autres
	}: Props = $props();

	let champ = $state<HTMLInputElement | null>(null);
	let appareil = $state<HTMLInputElement | null>(null);
	let survol = $state(false);

	function surCollage(e: ClipboardEvent) {
		if (!collage) return;
		const fichiers = [...(e.clipboardData?.files ?? [])];
		if (fichiers.length === 0) return;
		e.preventDefault();
		deposer(fichiers);
	}

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

<svelte:window onpaste={surCollage} />

{#snippet bouton()}
	<input
		bind:this={champ}
		hidden
		type="file"
		accept={accepte}
		{multiple}
		onchange={surChoix}
		oninput={(e) => e.stopPropagation()}
	/>
	{#if photo}
		<input
			bind:this={appareil}
			hidden
			type="file"
			accept="image/*"
			capture="environment"
			aria-label="Prendre une photo"
			onchange={surChoix}
			oninput={(e) => e.stopPropagation()}
		/>
		<span class="seulement-telephone">
			<Bouton
				variante={compact ? 'discret' : 'secondaire'}
				{occupe}
				onclick={() => appareil?.click()}
			>
				<Camera size={20} strokeWidth={1.75} aria-hidden="true" />
				Prendre une photo
			</Bouton>
		</span>
	{/if}
	<Bouton
		variante={compact ? 'discret' : discret ? 'secondaire' : 'principal'}
		{occupe}
		onclick={() => champ?.click()}
	>
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
		class:serre
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

	.serre {
		gap: var(--espace-2);
		padding: var(--espace-3);
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
