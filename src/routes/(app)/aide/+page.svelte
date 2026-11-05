<script lang="ts">
	import {
		ARTICLES,
		GLOSSAIRE,
		PREMIERE_ANNEE,
		RACCOURCIS,
		RACCOURCIS_POINTAGE
	} from '#lib/aide.ts';
	import EnTete from '#lib/ui/EnTete.svelte';
	import Touche from '#lib/ui/Touche.svelte';
</script>

<EnTete
	titre="Aide"
	sousTitre="Tout ce qu’il faut pour tenir la trésorerie, sans formation. Cette aide reste sur votre instance."
/>

<div class="lecture">
	<section id="premiere-annee">
		<h2 class="t-heading">Votre première année</h2>
		<ol class="annee">
			{#each PREMIERE_ANNEE as e (e.titre)}
				<li><strong>{e.titre}.</strong> {e.texte}</li>
			{/each}
		</ol>
	</section>

	{#each ARTICLES as a (a.id)}
		<section id={a.id}>
			<h2 class="t-heading">{a.titre}</h2>
			{#each a.paragraphes as p (p)}<p>{p}</p>{/each}
		</section>
	{/each}

	<section id="glossaire">
		<h2 class="t-heading">Glossaire</h2>
		<dl>
			{#each GLOSSAIRE as t (t.terme)}
				<div id="terme-{t.ancre}">
					<dt>{t.terme}</dt>
					<dd>{t.definition}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section id="raccourcis">
		<h2 class="t-heading">Raccourcis du clavier</h2>
		<ul>
			{#each RACCOURCIS as r (r.touche)}
				<li><Touche contenu>{r.touche}</Touche> {r.effet}</li>
			{/each}
		</ul>
		<h3 class="t-label">Dans le Pointage</h3>
		<ul>
			{#each RACCOURCIS_POINTAGE as r (r.touche)}
				<li><Touche contenu>{r.touche}</Touche> {r.effet}</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.lecture {
		display: grid;
		gap: var(--espace-6);
		max-width: var(--espace-reading-max);
		margin-top: var(--espace-6);
	}

	section > :global(* + *) {
		margin-top: var(--espace-2);
	}

	.annee {
		display: grid;
		gap: var(--espace-2);
	}

	.annee li {
		display: block;
		min-height: 0;
	}

	dl {
		display: grid;
		gap: var(--espace-3);
	}

	dt {
		font-weight: var(--typo-body-strong-graisse);
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-row);
	}
</style>
