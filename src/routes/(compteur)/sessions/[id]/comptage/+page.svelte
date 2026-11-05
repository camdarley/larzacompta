<script lang="ts">
	import EcranComptage from '#lib/ui/caisse/EcranComptage.svelte';

	let { data } = $props();

	const compteur = $derived(data.acces.role === 'compteur');
</script>

{#key `${data.ecran.sessionId}-${data.ecran.mode}-${data.ecran.correction}`}
	<EcranComptage
		ecran={data.ecran}
		retour={compteur ? '/mes-caisses' : `/sessions/${data.ecran.sessionId}`}
		libelleRetour={compteur ? 'Retour à Mes caisses' : 'Retour à la Session'}
	/>
{/key}
