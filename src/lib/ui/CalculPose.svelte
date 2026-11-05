<script lang="ts">
	import { formaterMontant, lectureMontant, type Centimes } from '#lib/domaine/montant.ts';

	/** `href` : le terme mène à son détail (EXPERIENCE.md). */
	type Terme = { libelle: string; montant: Centimes; signe?: '+' | '−'; href?: string };
	type Props = { termes: Terme[]; totalLibelle: string; total: Centimes };

	let { termes, totalLibelle, total }: Props = $props();

	const liens = $derived(termes.some((t) => t.href));

	/** Lu comme une phrase, une addition posée ne s'écoute pas colonne par colonne. */
	const phrase = $derived(
		[
			...termes.map((t, i) =>
				i === 0
					? `${t.libelle} ${lectureMontant(t.montant)}`
					: `${t.signe === '−' ? 'moins' : 'plus'} ${t.libelle} ${lectureMontant(t.montant)}`
			),
			`égale ${totalLibelle} ${lectureMontant(total)}`
		].join(', ')
	);
</script>

<!-- Avec des liens, la phrase reste lue à part : un rôle `img` les rendrait inatteignables. -->
{#if liens}<p class="visuellement-cache">{phrase}</p>{/if}
<div class="calcul-pose" role={liens ? undefined : 'img'} aria-label={liens ? undefined : phrase}>
	{#each termes as t (t.libelle)}
		<div class="ligne">
			<span class="signe" aria-hidden="true">{t.signe ?? ''}</span>
			<span class="libelle t-caption">
				{#if t.href}<a href={t.href}>{t.libelle}</a>{:else}{t.libelle}{/if}
			</span>
			<span class="montant">{formaterMontant(t.montant)}</span>
		</div>
	{/each}
	<div class="ligne total">
		<span class="signe"></span>
		<span class="libelle">{totalLibelle}</span>
		<span class="montant">{formaterMontant(total)}</span>
	</div>
</div>

<style>
	.calcul-pose {
		display: grid;
		gap: 2px;
	}

	.ligne {
		display: grid;
		grid-template-columns: 1ch 1fr auto;
		align-items: baseline;
		gap: var(--espace-2);
	}

	.libelle {
		color: var(--ink-muted);
	}

	.total {
		margin-top: var(--espace-1);
		padding-top: var(--espace-1);
		border-top: 1px solid var(--ink);
		font-weight: var(--typo-body-strong-graisse);
	}

	.total .libelle {
		color: var(--ink);
	}

	.total .montant {
		font-weight: var(--typo-body-strong-graisse);
	}
</style>
