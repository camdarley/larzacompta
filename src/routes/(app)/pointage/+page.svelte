<script lang="ts">
	import { Landmark } from '@lucide/svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
</script>

<EnTete titre="Pointage" />

<EtatVide
	icone={Landmark}
	titre="Aucun Compte à pointer"
	phrase="Seuls les Comptes banque et épargne se pointent. Ajoutez-en un dans les Réglages."
>
	{#snippet action()}
		<Bouton href="/reglages/comptes">Ouvrir les Comptes</Bouton>
	{/snippet}
</EtatVide>
