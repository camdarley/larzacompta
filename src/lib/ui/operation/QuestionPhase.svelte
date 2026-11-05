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

<fieldset class="question">
	<legend class="t-label">{question}</legend>
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
</fieldset>

<style>
	.question {
		display: grid;
		gap: var(--espace-1);
		margin: 0;
		padding: var(--espace-3);
		border: 0;
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
