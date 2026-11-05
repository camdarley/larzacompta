<script lang="ts">
	type Props = { src: string; titre: string };

	let { src, titre }: Props = $props();
</script>

<div class="apercu">
	<iframe {src} title={titre}></iframe>
</div>

<style>
	.apercu {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-sunken);
	}

	iframe {
		display: block;
		width: 100%;
		height: calc(100dvh - 180px);
		min-height: 420px;
		border: 0;
	}
</style>
