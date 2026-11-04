<script lang="ts">
	import {
		Check,
		Circle,
		CircleAlert,
		CornerUpLeft,
		Lock,
		Pencil,
		Sparkles,
		TriangleAlert
	} from '@lucide/svelte';

	export type EtatPastille =
		| 'pointe'
		| 'a_pointer'
		| 'a_regarder'
		| 'ecart'
		| 'suggestion'
		| 'cloture'
		| 'brouillon'
		| 'rattachee'
		| 'ouvert';

	let { etat, texte }: { etat: EtatPastille; texte?: string } = $props();

	/** Vocabulaire fixe : toujours une icône et un mot (DESIGN.md). */
	const definitions = {
		pointe: { mot: 'Pointé', icone: Check, ton: 'vert' },
		a_pointer: { mot: 'À pointer', icone: Circle, ton: 'creux' },
		a_regarder: { mot: 'À regarder', icone: CircleAlert, ton: 'ambre' },
		ecart: { mot: 'Écart', icone: TriangleAlert, ton: 'rouge' },
		suggestion: { mot: 'Suggestion', icone: Sparkles, ton: 'violet' },
		cloture: { mot: 'Clôturé', icone: Lock, ton: 'creux' },
		brouillon: { mot: 'Brouillon', icone: Pencil, ton: 'creux' },
		rattachee: { mot: 'Sur Exercice antérieur', icone: CornerUpLeft, ton: 'creux' },
		ouvert: { mot: 'Ouvert', icone: Circle, ton: 'vert' }
	} as const;

	const d = $derived(definitions[etat]);
</script>

<span class="pastille t-label {d.ton}">
	<d.icone size={14} strokeWidth={2} aria-hidden="true" />
	{texte ?? d.mot}
</span>

<style>
	.pastille {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		padding: 2px var(--espace-2);
		border-radius: var(--rayon-full);
		white-space: nowrap;
	}

	.vert {
		background: var(--success-soft);
		color: var(--success);
	}

	.creux {
		background: var(--surface-sunken);
		color: var(--ink-muted);
	}

	.ambre {
		background: var(--warning-soft);
		color: var(--warning);
	}

	.rouge {
		background: var(--danger-soft);
		color: var(--danger);
	}

	.violet {
		background: var(--primary-soft);
		color: var(--primary);
	}
</style>
