/**
 * Rendu PDF d'un modèle déjà calculé, sans aucun calcul de montant (AD-18).
 * A4, marges 20 mm, noir sur blanc, Fraunces pour les titres, Source Sans 3 à 11 pt.
 * Le document est balisé : titres, tableaux et cellules se lisent au lecteur d'écran.
 */
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type {
	Cellule,
	ModeleDocument,
	RangeeDocument,
	SectionDocument,
	TableauDocument
} from '#lib/domaine/etats/documents.ts';
import { formaterMontant, formaterMontantSigne } from '#lib/domaine/montant.ts';

const MM = 72 / 25.4;
const MARGE = 20 * MM;
const LARGEUR_PAGE = 210 * MM;
const HAUTEUR_PAGE = 297 * MM;
const LARGEUR = LARGEUR_PAGE - 2 * MARGE;
/** Réservé en bas de page au pied : nom de l'APE, Exercice, pagination. */
const BAS = HAUTEUR_PAGE - MARGE - 18;
const CORPS = 11;
const INTERLIGNE = 15;
const RANGEE = 18;
const DECALAGE_NIVEAU = 12;
const LARGEUR_MONTANT = 82;
const NOIR = '#000000';
const GRIS = '#444444';
/** Transparent : posé sur la page, il laisse lire chaque chiffre dessous. */
const OPACITE_FILIGRANE = 0.1;

type Doc = InstanceType<typeof PDFDocument>;
type Struct = ReturnType<Doc['struct']>;

const texteCellule = (c: Cellule): string => {
	if (c === null) return '';
	if (typeof c === 'string') return c;
	return c.signe ? formaterMontantSigne(c.montant) : formaterMontant(c.montant);
};

function nouvelleSiBesoin(doc: Doc, hauteur: number) {
	if (doc.y + hauteur > BAS) {
		doc.addPage();
		doc.y = MARGE;
	}
}

function largeurs(t: TableauDocument): number[] {
	const montants = t.colonnes.filter((c) => c.montant).length;
	const textes = t.colonnes.length - montants;
	const libre = (LARGEUR - montants * LARGEUR_MONTANT) / textes;
	return t.colonnes.map((c) => (c.montant ? LARGEUR_MONTANT : libre));
}

function ecrireCellule(
	doc: Doc,
	cellule: Struct,
	texte: string,
	x: number,
	y: number,
	largeur: number,
	o: { droite: boolean; fort: boolean; decalage: number }
) {
	cellule.add(
		doc.struct('P', {}, () => {
			doc
				.font(o.fort ? 'corps-fort' : 'corps')
				.fontSize(CORPS)
				.fillColor(NOIR)
				.text(texte, x + o.decalage, y, {
					width: largeur - o.decalage,
					align: o.droite ? 'right' : 'left',
					lineBreak: true
				});
		})
	);
	cellule.end();
}

function hauteurRangee(doc: Doc, r: RangeeDocument, l: number[]): number {
	const libelle = typeof r.cellules[0] === 'string' ? r.cellules[0] : '';
	const utile = (l[0] as number) - r.niveau * DECALAGE_NIVEAU;
	doc.font(r.fort ? 'corps-fort' : 'corps').fontSize(CORPS);
	return Math.max(RANGEE, doc.heightOfString(libelle, { width: utile }) + 4);
}

function ecrireEnTetes(doc: Doc, tableau: Struct, t: TableauDocument, l: number[]) {
	const ligne = doc.struct('TR');
	tableau.add(ligne);
	const y = doc.y;
	let x = MARGE;
	t.colonnes.forEach((c, i) => {
		const cellule = doc.struct('TH', { title: c.libelle });
		ligne.add(cellule);
		ecrireCellule(doc, cellule, c.libelle, x, y, l[i] as number, {
			droite: c.montant,
			fort: true,
			decalage: 0
		});
		x += l[i] as number;
	});
	ligne.end();
	doc.y = y + RANGEE;
	filet(doc, doc.y - 3, 0.75);
}

function filet(doc: Doc, y: number, epaisseur: number) {
	doc.markContent('Artifact', { type: 'Layout' });
	doc
		.moveTo(MARGE, y)
		.lineTo(MARGE + LARGEUR, y)
		.lineWidth(epaisseur)
		.strokeColor(NOIR)
		.stroke();
	doc.endMarkedContent();
}

function ecrireRangee(
	doc: Doc,
	tableau: Struct,
	r: RangeeDocument,
	t: TableauDocument,
	l: number[]
) {
	const hauteur = hauteurRangee(doc, r, l);
	if (doc.y + hauteur > BAS) {
		doc.addPage();
		doc.y = MARGE;
		ecrireEnTetes(doc, tableau, t, l);
	}
	if (r.total) {
		filet(doc, doc.y - 1, 1);
		doc.y += 3;
	}
	const y = doc.y;
	const ligne = doc.struct('TR');
	tableau.add(ligne);
	let x = MARGE;
	r.cellules.forEach((c, i) => {
		const montant = t.colonnes[i]?.montant ?? false;
		const cellule = doc.struct('TD');
		ligne.add(cellule);
		ecrireCellule(doc, cellule, texteCellule(c), x, y, l[i] as number, {
			droite: montant,
			fort: r.fort ?? false,
			decalage: i === 0 ? r.niveau * DECALAGE_NIVEAU : 0
		});
		x += l[i] as number;
	});
	ligne.end();
	doc.y = y + hauteur;
}

function ecrireTableau(doc: Doc, racine: Struct, t: TableauDocument) {
	const l = largeurs(t);
	// Au moins les en-têtes et deux rangées ensemble : un tableau ne commence pas en bas de page.
	nouvelleSiBesoin(doc, RANGEE * 3);
	const tableau = doc.struct('Table', { title: t.legende });
	racine.add(tableau);
	ecrireEnTetes(doc, tableau, t, l);
	for (const r of t.rangees) ecrireRangee(doc, tableau, r, t, l);
	tableau.end();
}

function ecrireSection(doc: Doc, racine: Struct, s: SectionDocument) {
	nouvelleSiBesoin(doc, 90);
	doc.y += 14;
	racine.add(
		doc.struct('H2', {}, () => {
			doc
				.font('titre')
				.fontSize(15)
				.fillColor(NOIR)
				.text(s.titre, MARGE, doc.y, { width: LARGEUR });
		})
	);
	doc.y += 4;
	for (const p of s.phrases) {
		racine.add(
			doc.struct('P', {}, () => {
				doc
					.font('corps')
					.fontSize(CORPS)
					.fillColor(GRIS)
					.text(p, MARGE, doc.y, { width: LARGEUR, lineGap: INTERLIGNE - CORPS - 2 });
			})
		);
	}
	doc.y += 6;
	if (s.tableau) ecrireTableau(doc, racine, s.tableau);
}

/** Filigrane et pied : hors de la structure, ils ne se lisent pas entre deux cellules. */
function habiller(doc: Doc, m: ModeleDocument) {
	const pages = doc.bufferedPageRange();
	for (let i = 0; i < pages.count; i += 1) {
		doc.switchToPage(pages.start + i);
		if (m.provisoire) {
			doc.markContent('Artifact', { type: 'Pagination' });
			doc
				.save()
				.rotate(-45, { origin: [LARGEUR_PAGE / 2, HAUTEUR_PAGE / 2] })
				.font('titre')
				.fontSize(84)
				.fillColor(NOIR, OPACITE_FILIGRANE)
				.text('Provisoire', 0, HAUTEUR_PAGE / 2 - 50, {
					width: LARGEUR_PAGE,
					align: 'center',
					lineBreak: false
				})
				.restore();
			doc.endMarkedContent();
		}
		doc.markContent('Artifact', { type: 'Pagination' });
		const y = HAUTEUR_PAGE - MARGE - 10;
		doc.font('corps').fontSize(9.5).fillColor(GRIS);
		doc.text(`${m.association}, Exercice ${m.exercice}`, MARGE, y, {
			width: LARGEUR - 90,
			lineBreak: false
		});
		doc.text(`Page ${i + 1} sur ${pages.count}`, MARGE + LARGEUR - 90, y, {
			width: 90,
			align: 'right',
			lineBreak: false
		});
		doc.endMarkedContent();
	}
}

export function genererPdf(m: ModeleDocument, polices: string): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'A4',
			margins: { top: MARGE, bottom: 0, left: MARGE, right: MARGE },
			tagged: true,
			lang: 'fr-FR',
			displayTitle: true,
			pdfVersion: '1.7',
			bufferPages: true,
			font: join(polices, 'SourceSans3-Regular.ttf'),
			info: { Title: `${m.titre}, ${m.exercice}`, Author: m.association }
		} as PDFKit.PDFDocumentOptions);
		const morceaux: Buffer[] = [];
		doc.on('data', (b: Buffer) => morceaux.push(b));
		doc.on('end', () => resolve(new Uint8Array(Buffer.concat(morceaux))));
		doc.on('error', reject);

		doc.registerFont('corps', join(polices, 'SourceSans3-Regular.ttf'));
		doc.registerFont('corps-fort', join(polices, 'SourceSans3-Semibold.ttf'));
		doc.registerFont('titre', join(polices, 'Fraunces-SemiBold.ttf'));

		const racine = doc.struct('Document');
		doc.addStructure(racine);
		racine.add(
			doc.struct('H1', {}, () => {
				doc
					.font('titre')
					.fontSize(24)
					.fillColor(NOIR)
					.text(m.titre, MARGE, MARGE, { width: LARGEUR });
			})
		);
		racine.add(
			doc.struct('P', {}, () => {
				doc
					.font('corps')
					.fontSize(CORPS)
					.fillColor(GRIS)
					.text(`${m.association}, Exercice ${m.exercice}`, MARGE, doc.y + 2, { width: LARGEUR });
			})
		);
		doc.y += 6;
		for (const s of m.sections) ecrireSection(doc, racine, s);
		racine.end();
		habiller(doc, m);
		doc.end();
	});
}
