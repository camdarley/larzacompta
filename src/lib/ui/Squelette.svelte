<div class="squelette" aria-hidden="true">
	<div class="bloc titre"></div>
	<div class="bloc"></div>
	<div class="bloc"></div>
	<div class="bloc court"></div>
</div>

<style>
	.squelette {
		display: grid;
		gap: var(--espace-3);
	}

	.bloc {
		height: var(--espace-row);
		border-radius: var(--rayon-sm);
		background: var(--surface-sunken);
	}

	.titre {
		width: 40%;
		height: var(--espace-6);
	}

	.court {
		width: 60%;
	}
</style>
