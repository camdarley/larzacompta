<script lang="ts">
	import doc from '../../../../../../docs/restauration.md?raw';
	import Documentation from '#lib/ui/Documentation.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
</script>

<EnTete
	titre="Restaurer les données"
	contexte="Réglages"
	sousTitre="Ce guide s’adresse à la personne qui gère l’installation."
/>

<p><a href="/reglages/sauvegardes">Retour aux sauvegardes</a></p>

<Documentation source={doc} />
