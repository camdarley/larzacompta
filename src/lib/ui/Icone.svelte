<script lang="ts">
	import {
		BookOpen,
		CalendarRange,
		Camera,
		ChartColumn,
		CircleHelp,
		ClipboardCheck,
		FileText,
		Gauge,
		History,
		Landmark,
		ListTree,
		PiggyBank,
		ReceiptText,
		Settings,
		SquareCheckBig,
		Wallet
	} from '@lucide/svelte';
	import type { NomIcone } from '#lib/fonctions.ts';

	let { nom, taille = 20 }: { nom: NomIcone; taille?: number } = $props();

	const icones = {
		accueil: Gauge,
		operations: ListTree,
		pointage: SquareCheckBig,
		caisses: Wallet,
		cheques: ReceiptText,
		creances: Landmark,
		pieces: FileText,
		photo: Camera,
		factures: ClipboardCheck,
		actions: CalendarRange,
		etats: ChartColumn,
		budget: PiggyBank,
		reglages: Settings,
		journal: History,
		aide: CircleHelp
	};
	const Composant = $derived(icones[nom] ?? BookOpen);
</script>

<Composant size={taille} strokeWidth={1.75} aria-hidden="true" />
