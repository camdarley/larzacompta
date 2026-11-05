/**
 * État du `panneau` Opération. Il vit hors du rendu : une erreur, une coupure ou une reconnexion
 * ne touchent jamais ce qui est saisi. Les calculs viennent de `#lib/domaine`.
 */
import { lireMontant, formaterSaisie, centimes, type Centimes } from '#lib/domaine/montant.ts';
import { differentiel, type Intention } from '#lib/domaine/operations/formes.ts';
import { resteARepartir, type PartLigne } from '#lib/domaine/operations/ventilation.ts';
import type { SommeASolder } from '#lib/domaine/creances/index.ts';
import type { ModePaiement, OperationJ } from '#lib/domaine/journal.ts';
import type { PieceDeposee } from '#lib/domaine/pieces/index.ts';
import type { ModeleSumup } from '#lib/domaine/releve/cheques.ts';

export type Choix = Intention | 'interne' | 'remboursement' | 'somme' | 'compensee';

export type LigneEtat = {
	cle: number;
	montant: string;
	/** La Ligne suit le total tant que personne n'a touché son montant. */
	auto: boolean;
	contraire: boolean;
	reduction: boolean;
	natureId: number | null;
	actionId: number | null;
	rattachementId: number | null;
	note: string;
	noteOuverte: boolean;
	rattachementOuvert: boolean;
	suggestion: string | null;
};

let prochaineCle = 1;

function ligneVide(partiel: Partial<LigneEtat> = {}): LigneEtat {
	return {
		cle: prochaineCle++,
		montant: '',
		auto: true,
		contraire: false,
		reduction: false,
		natureId: null,
		actionId: null,
		rattachementId: null,
		note: '',
		noteOuverte: false,
		rattachementOuvert: false,
		suggestion: null,
		...partiel
	};
}

function lire(texte: string): Centimes | null {
	if (texte.trim() === '') return null;
	const r = lireMontant(texte);
	return r.ok ? r.valeur : null;
}

const positif = (c: Centimes) => centimes(Math.abs(c));
const texteDe = (c: Centimes) => formaterSaisie(positif(c));

/** Part d'une Opération sur une somme à solder. */
export type PartEtat = { somme: SommeASolder; montant: string };

export function nouvelleCle(): string {
	return crypto.randomUUID();
}

export class Saisie {
	choix = $state<Choix>('depense');
	date = $state('');
	compteId = $state<number | null>(null);
	montant = $state('');
	libelle = $state('');
	modePaiement = $state<ModePaiement | ''>('');
	reference = $state('');
	tiers = $state('');
	note = $state('');
	lignes = $state<LigneEtat[]>([ligneVide()]);

	// Entre Comptes.
	deId = $state<number | null>(null);
	versId = $state<number | null>(null);
	parti = $state('');
	arrive = $state('');

	// Opération compensée.
	facture = $state('');
	ventes = $state('');
	natureFactureId = $state<number | null>(null);
	actionFactureId = $state<number | null>(null);
	natureVentesId = $state<number | null>(null);
	actionVentesId = $state<number | null>(null);

	/** Autre > Remboursement : dépense retrouvée. */
	origineId = $state<number | null>(null);
	/** Rendre cette somme : Opération reçue. */
	rendDe = $state<number | null>(null);
	/** Pièces déposées pendant la saisie : elles partent avec l'Opération. */
	pieces = $state<PieceDeposee[]>([]);
	sansPiece = $state(false);
	/** Versement SumUp : tant que le brut n'est pas touché, il suit les frais. */
	brutSuitFrais = $state(false);

	/** Créances et Dettes que l'Opération solde, avec la part de chacune. */
	sommes = $state<PartEtat[]>([]);

	/** Une même saisie garde sa clé, même renvoyée : aucun double enregistrement. */
	cle = $state(nouvelleCle());

	total = $derived(lire(this.montant));

	parts = $derived(
		this.lignes.map((l): PartLigne => ({
			montant: positif(lire(l.montant) ?? centimes(0)),
			contraire: l.contraire
		}))
	);

	reste = $derived(resteARepartir(positif(this.total ?? centimes(0)), this.parts));

	ecart = $derived(
		differentiel(
			positif(lire(this.ventes) ?? centimes(0)),
			positif(lire(this.facture) ?? centimes(0))
		)
	);

	constructor(date = '', compteId: number | null = null) {
		this.date = date;
		this.compteId = compteId;
		this.parti = date;
		this.arrive = date;
		this.deId = compteId;
	}

	/** Le cas simple ne montre pas la complexité : une Ligne, au montant total. */
	surMontant() {
		const [seule] = this.lignes;
		if (this.lignes.length === 1 && seule?.auto) {
			seule.montant = this.total === null ? '' : texteDe(this.total);
		}
		// Une seule somme : elle suit le montant, un paiement partiel se saisit d'un seul geste.
		const [part] = this.sommes;
		if (this.sommes.length === 1 && part) {
			part.montant = this.total === null ? '' : texteDe(this.total);
		}
	}

	/** Solder une somme : montant, Action et rattachement viennent d'elle, rien à ressaisir. */
	reprendreSomme(s: SommeASolder) {
		this.choix = s.sens === 'creance' ? 'recette' : 'depense';
		this.tiers = s.tiers;
		this.libelle = `${s.tiers}, ${s.motif}`;
		this.montant = texteDe(s.reste);
		this.sommes = [{ somme: s, montant: texteDe(s.reste) }];
		this.surMontant();
		const [premiere] = this.lignes;
		if (premiere) {
			premiere.actionId = s.actionId;
			premiere.rattachementId = s.rattachementId;
			premiere.rattachementOuvert = s.rattachementId !== null;
		}
	}

	/** Une autre somme sur la même Opération : son reste s'ajoute, avec sa Ligne. */
	ajouterSomme(s: SommeASolder) {
		this.sommes.push({ somme: s, montant: texteDe(s.reste) });
		const avant = positif(this.total ?? centimes(0));
		for (const l of this.lignes) l.auto = false;
		this.montant = texteDe(centimes(avant + s.reste));
		const l = this.ajouterLigne(s.reste);
		l.actionId = s.actionId;
		l.rattachementId = s.rattachementId;
		l.rattachementOuvert = s.rattachementId !== null;
	}

	retirerSomme(id: number) {
		this.sommes = this.sommes.filter((p) => p.somme.id !== id);
	}

	/** Versement SumUp : le montant reçu est le net, une Ligne de brut et une Ligne de frais. */
	preparerSumup(m: ModeleSumup, natureFrais: number | null) {
		this.choix = 'recette';
		this.modePaiement = 'sumup';
		this.sansPiece = true;
		this.libelle = 'Versement SumUp';
		this.brutSuitFrais = true;
		this.lignes = [
			ligneVide({
				montant: this.total === null ? '' : texteDe(this.total),
				auto: false,
				natureId: m.natureBrutId,
				actionId: m.actionBrutId
			}),
			ligneVide({
				auto: false,
				contraire: true,
				natureId: m.natureFraisId ?? natureFrais,
				actionId: m.actionFraisId
			})
		];
	}

	/** Sans détail SumUp, seuls les frais se saisissent : le brut égale net + frais (OQ-5). */
	surFrais() {
		const [brut, frais] = this.lignes;
		if (!this.brutSuitFrais || brut === undefined || frais === undefined) return;
		brut.montant = texteDe(
			centimes(positif(this.total ?? centimes(0)) + positif(lire(frais.montant) ?? centimes(0)))
		);
	}

	ajouterLigne(montant: Centimes = centimes(0)): LigneEtat {
		const l = ligneVide({ montant: montant > 0 ? formaterSaisie(montant) : '', auto: false });
		this.lignes.push(l);
		return this.lignes.at(-1) as LigneEtat;
	}

	/** D'une Opération existante, ou dupliquée, vers le formulaire. */
	charger(op: OperationJ, exerciceCourantId: number | null) {
		this.date = op.date;
		this.libelle = op.libelle;
		this.modePaiement = op.modePaiement ?? '';
		this.reference = op.reference ?? '';
		this.tiers = op.tiers ?? '';
		this.note = op.note ?? '';
		const [cote, autre] = op.cotes;
		if (op.genre === 'interne') {
			const sortant = op.cotes.find((c) => c.montant < 0) ?? cote;
			const entrant = op.cotes.find((c) => c.montant > 0) ?? autre;
			this.choix = 'interne';
			this.deId = sortant?.compteId ?? null;
			this.versId = entrant?.compteId ?? null;
			this.montant = texteDe(entrant?.montant ?? centimes(0));
			this.parti = sortant?.date ?? op.date;
			this.arrive = entrant?.date ?? op.date;
			return;
		}
		this.compteId = cote?.compteId ?? null;
		if (op.genre === 'compensee') {
			const vente = op.lignes.find((l) => l.montant > 0);
			const facture = op.lignes.find((l) => l.montant < 0);
			this.choix = 'compensee';
			this.ventes = vente ? texteDe(vente.montant) : '';
			this.facture = facture ? texteDe(facture.montant) : '';
			this.natureVentesId = vente?.natureId ?? null;
			this.actionVentesId = vente?.actionId ?? null;
			this.natureFactureId = facture?.natureId ?? null;
			this.actionFactureId = facture?.actionId ?? null;
			return;
		}
		const depense = (cote?.montant ?? 0) < 0;
		this.choix = depense ? 'depense' : 'recette';
		this.montant = cote ? texteDe(cote.montant) : '';
		this.lignes = op.lignes.map((l) =>
			ligneVide({
				montant: texteDe(l.montant),
				auto: false,
				contraire: depense ? l.montant > 0 : l.montant < 0,
				reduction: !depense && l.estReduction,
				natureId: l.natureId,
				actionId: l.actionId,
				rattachementId:
					l.exerciceRattachementId === exerciceCourantId ? null : l.exerciceRattachementId,
				note: l.note ?? '',
				noteOuverte: l.note !== null,
				rattachementOuvert: l.exerciceRattachementId !== exerciceCourantId
			})
		);
	}
}
