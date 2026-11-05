<script lang="ts">
	type Props = {
		/** Identifie le groupe de boutons : une Opération peut toucher deux caisses. */
		nom: string;
		question: string;
		valeur: boolean;
		changer: (valeur: boolean) => void;
	};

	let { nom, question, valeur, changer }: Props = $props();
</script>

<!-- Pas de `legend` : Safari la pose à cheval sur le bord, même flottante. -->
<div class="question" role="radiogroup" aria-labelledby="{nom}-question">
	<p class="t-label" id="{nom}-question">{question}</p>
	<div class="reponses">
		<label>
			<input type="radio" name={nom} checked={valeur} onchange={() => changer(true)} />
			Oui
		</label>
		<label>
			<input type="radio" name={nom} checked={!valeur} onchange={() => changer(false)} />
			Non
		</label>
	</div>
</div>

<style>
	.question {
		display: grid;
		gap: var(--espace-1);
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--warning-soft);
	}

	.reponses {
		display: flex;
		gap: var(--espace-4);
	}

	label {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: 40px;
		cursor: pointer;
	}

	input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--primary);
	}
</style>
