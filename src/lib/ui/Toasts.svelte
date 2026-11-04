<script lang="ts">
	import { reprendreToast, retirerToast, suspendreToast, toasts } from './toasts.svelte.ts';
</script>

<div class="pile" aria-live="polite" role="status">
	{#each toasts.liste as t (t.id)}
		<div
			class="toast"
			role="presentation"
			onmouseenter={() => suspendreToast(t.id)}
			onmouseleave={() => reprendreToast(t.id)}
			onfocusin={() => suspendreToast(t.id)}
			onfocusout={() => reprendreToast(t.id)}
		>
			<span>{t.texte}</span>
			{#if t.action}
				<button
					type="button"
					onclick={() => {
						t.action?.faire();
						retirerToast(t.id);
					}}>{t.action.libelle}</button
				>
			{/if}
		</div>
	{/each}
</div>

<style>
	.pile {
		position: fixed;
		left: var(--espace-5);
		bottom: var(--espace-5);
		z-index: 60;
		display: grid;
		gap: var(--espace-2);
		max-width: min(420px, calc(100vw - 2 * var(--espace-page-mobile)));
	}

	.toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-4);
		padding: var(--espace-3) var(--espace-4);
		border-radius: var(--rayon-md);
		background: var(--ink);
		color: var(--surface-base);
		box-shadow: var(--elevation-flottant);
	}

	button {
		border: 0;
		background: none;
		padding: 0;
		color: inherit;
		font: inherit;
		font-weight: var(--typo-label-graisse);
		text-decoration: underline;
		cursor: pointer;
	}

	@media (max-width: 639.98px) {
		.pile {
			left: var(--espace-page-mobile);
			right: var(--espace-page-mobile);
			bottom: calc(var(--espace-8) + var(--espace-3) + env(safe-area-inset-bottom));
			max-width: none;
		}
	}
</style>
