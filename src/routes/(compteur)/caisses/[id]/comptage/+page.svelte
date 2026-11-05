<script lang="ts">
	import EcranComptage from '#lib/ui/caisse/EcranComptage.svelte';

	let { data } = $props();

	const compteur = $derived(data.acces.role === 'compteur');
</script>

{#key data.ecran.compteId}
	<EcranComptage
		ecran={data.ecran}
		retour={compteur ? '/mes-caisses' : `/caisses/${data.ecran.compteId}`}
		libelleRetour={compteur ? 'Retour à Mes caisses' : `Retour à ${data.ecran.caisse}`}
	/>
{/key}
