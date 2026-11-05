<script lang="ts">
	import EnTete from '#lib/ui/EnTete.svelte';
	import Travail from '#lib/ui/pointage/Travail.svelte';

	let { data } = $props();
	const p = $derived(data.pointage);
</script>

<EnTete titre="Pointage" contexte={p.compte.libelle} sansTitre />

{#key p.compte.id}
	<Travail
		vue={p}
		compte={p.compte}
		comptes={p.comptes}
		raccourcis={data.raccourcis}
		aujourdhui={data.aujourdhui}
		lectureSeule={data.exercice?.statut === 'cloture'}
	/>
{/key}
