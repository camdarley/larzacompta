/** Facture ou Avoir en PDF : un modèle déjà calculé, le rendu n'additionne rien (AD-18). */
import { formaterDateLongue, type DateCivile } from '../dates.ts';
import type { ModeleDocument, RangeeDocument } from '../etats/documents.ts';
import { formaterMontant } from '../montant.ts';
import {
	montantLigne,
	phraseOrigine,
	totalFacture,
	type Facture,
	type IdentiteFacture,
	type LigneFacture,
	type TypeFacture
} from './index.ts';

export type SourceDocumentFacture = {
	type: TypeFacture;
	/** Absent : brouillon ou aperçu, sous le filigrane « Provisoire ». */
	numero: string | null;
	provisoire: boolean;
	date: DateCivile | null;
	tiersNom: string;
	tiersAdresse: string;
	lignes: readonly LigneFacture[];
	identite: IdentiteFacture;
	exercice: string;
	origine?: Pick<Facture, 'numero' | 'dateEmission'>;
};

const lignesTexte = (texte: string) =>
	texte
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

function nomDocument(s: Pick<SourceDocumentFacture, 'type' | 'numero'>) {
	const nom = s.type === 'avoir' ? 'Avoir' : 'Facture';
	return s.numero === null ? nom : `${nom} n° ${s.numero}`;
}

export function modeleFacture(s: SourceDocumentFacture): ModeleDocument {
	const rangees: RangeeDocument[] = s.lignes.map((l) => ({
		cellules: [
			l.designation,
			String(l.quantite),
			formaterMontant(l.prixUnitaire),
			{ montant: montantLigne(l) }
		],
		niveau: 0
	}));
	const mentions = lignesTexte(s.identite.mentions);
	const nom = s.type === 'avoir' ? 'avoir' : 'facture';
	return {
		titre: nomDocument(s),
		association: s.identite.nom,
		exercice: s.exercice,
		provisoire: s.provisoire,
		nomFichier: `${nom}-${s.numero ?? 'brouillon'}`,
		sousTitre: s.date === null ? null : `Émise le ${formaterDateLongue(s.date)}`,
		parties: [
			{ titre: 'Émetteur', lignes: [s.identite.nom, ...lignesTexte(s.identite.adresse)] },
			{
				titre: s.type === 'avoir' ? 'Destinataire' : 'Facturé à',
				lignes: [s.tiersNom, ...lignesTexte(s.tiersAdresse)]
			}
		],
		sections: [
			{
				titre: '',
				phrases: s.origine ? [phraseOrigine(s.origine)] : [],
				tableau: {
					legende: `Détail de ${nomDocument(s)}`,
					colonnes: [
						{ libelle: 'Désignation', montant: false },
						{ libelle: 'Quantité', montant: true },
						{ libelle: 'Prix unitaire', montant: true },
						{ libelle: 'Montant', montant: true }
					],
					rangees: [
						...rangees,
						{
							cellules: ['Total', null, null, { montant: totalFacture([...s.lignes]) }],
							niveau: 0,
							fort: true,
							total: true
						}
					]
				}
			},
			...(mentions.length > 0 ? [{ titre: '', phrases: mentions, tableau: null }] : [])
		]
	};
}
