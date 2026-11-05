import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import type { Exercice } from '#lib/domaine/exercices.ts';
import { composer } from '#lib/server/composition.ts';
import { ouvrirBase } from '#lib/server/infra/sqlite/connexion.ts';
import { creerFichiers } from '#lib/server/infra/fichiers/index.ts';
import { chargerDansDossier, chargerJeu } from '../jeux/charger.ts';
import { ATTENDUS_COMPLET, JEU_COMPLET } from '../jeux/exercice-fictif.ts';
import { banc } from './aides/app.ts';
import { valeur } from './aides/instance.ts';

function charge() {
	const b = banc('2026-12-31T10:00:00.000Z');
	const jeu = chargerJeu(b.app, b.ctx());
	const e = b.app.socle.depots.exercices
		.lister()
		.find((x) => x.id === jeu.exercice.courant) as Exercice;
	return { b, jeu, e };
}

describe('Exercice fictif complet (6.7, 8.9)', () => {
	it('couvre chèques, Remises, rejet, registre et SumUp, Q1 à Q6 tenus', () => {
		const { b, e } = charge();
		const tableau = valeur(b.app.etats.tableau(b.ctx(), e));
		const tache = (id: string) => tableau.taches.find((t) => t.id === id)?.compteur;
		expect(tache('cheques')).toBe(1);
		expect(tache('cheques_absents')).toBe(1);
		expect(tableau.cartes.map((x) => x.compte.type)).toContain('cheques_a_remettre');

		const recus = valeur(b.app.cheques.recus(b.ctx()));
		expect(recus.compteurs).toEqual({ en_attente: 1, remis: 4, pointe: 0, rejete: 1 });
		const remises = valeur(b.app.cheques.remises(b.ctx()));
		expect(remises.rangees.map((r) => [r.numero, r.compte])).toEqual([
			[2, 'Livret des Tilleuls'],
			[1, 'Banque des Tilleuls']
		]);
		const emis = valeur(b.app.cheques.emis(b.ctx()));
		expect(emis.compteurs).toEqual({ emis: 1, pointe: 0, annule: 1 });
		expect(emis.manquants.map((m) => m.numero)).toEqual([JEU_COMPLET.numeroChequeAbsent]);
		expect(valeur(b.app.etats.verifier(b.ctx()))).toEqual([]);
	});

	it('donne son résultat et ses soldes au centime', () => {
		const { b, e } = charge();
		const { resultat, anomalies } = valeur(b.app.etats.compteDeResultat(b.ctx(), e));
		expect(anomalies).toEqual([]);
		expect(resultat.recettes).toBe(ATTENDUS_COMPLET.recettes);
		expect(resultat.depenses).toBe(ATTENDUS_COMPLET.depenses);
		expect(resultat.resultat).toBe(ATTENDUS_COMPLET.resultat);
		expect(resultat.anterieurs.resultat).toBe(ATTENDUS_COMPLET.resultatAnterieurs);

		const { etat } = valeur(b.app.etats.tresorerie(b.ctx(), e));
		expect(etat.variation).toBe(ATTENDUS_COMPLET.variation);
		expect(etat.fin).toBe(
			ATTENDUS_COMPLET.soldeBanqueFin +
				ATTENDUS_COMPLET.soldeLivretFin +
				ATTENDUS_COMPLET.soldeCaisseFin +
				ATTENDUS_COMPLET.chequesARemettre
		);
		expect(etat.chequesARemettre).toBe(ATTENDUS_COMPLET.chequesARemettre);
		expect(etat.explication.difference).toBe(0);
	});

	it('garde le résultat de chaque Action et ce qui reste dû', () => {
		const { b, e } = charge();
		const actions = valeur(b.app.etats.actions(b.ctx(), e));
		const kermesse = actions.resultat.groupes
			.flatMap((g) => g.actions)
			.find((a) => a.libelle === 'Kermesse');
		expect(kermesse?.resultat).toBe(ATTENDUS_COMPLET.resultatKermesse);

		const suivi = valeur(b.app.creances.suivi(b.ctx(), e));
		expect(suivi.aPayer.total).toBe(ATTENDUS_COMPLET.dettesRestantes);
		expect(suivi.aRecevoir.total).toBe(ATTENDUS_COMPLET.creancesRestantes);
	});

	it('laisse au Tableau de contrôle un Écart, expliqué par une Ligne de relevé', () => {
		const { b, e } = charge();
		const tableau = valeur(b.app.etats.tableau(b.ctx(), e));
		const banque = tableau.cartes[0];
		expect(banque?.ecart).toBe(JEU_COMPLET.ecartReleve);
		expect(tableau.bilan.type).toBe('taches');
	});

	it('sort chèques, Remises et Sessions dans l’export complet', async () => {
		const { b } = charge();
		const { flux } = valeur(b.app.etats.exportComplet(b.ctx()));
		const archive = unzipSync(new Uint8Array(await new Response(flux).arrayBuffer()));
		const texte = (nom: string) => strFromU8(archive[nom]!);
		expect(texte('cheques-recus.csv')).toContain('Famille Bergamote');
		expect(texte('cheques-recus.csv')).toContain('Rejeté');
		expect(texte('remises.csv').trim().split('\r\n')).toHaveLength(3);
		expect(texte('cheques-emis.csv')).toContain(JEU_COMPLET.numeroChequeEmis);
		expect(texte('sessions.csv')).toContain('Fond de caisse');
		expect(texte('LISEZMOI.txt')).toContain('cheques-recus.csv');
	});

	it('se relit sans aucune violation', () => {
		const { b } = charge();
		const violations = valeur(b.app.etats.verifier(b.app.ctx(null)));
		expect(violations).toEqual([]);
	});

	it('couvre les cas de l’analyse', () => {
		const { b } = charge();
		const j = b.app.socle.depots.operations.journal();
		const libelles = j.operations.map((o) => o.libelle);
		expect(j.operations.some((o) => o.genre === 'interne')).toBe(true);
		expect(j.operations.some((o) => o.genre === 'compensee')).toBe(true);
		expect(j.liaisons.length).toBeGreaterThanOrEqual(2);
		expect(libelles).toContain('Facture tardive du traiteur');
		expect(libelles).toContain('Dépôt d’espèces');
		expect(libelles).toContain('Gobelets payés en espèces');
		expect(libelles).toContain('Remboursement Papeterie du Lac');
		expect(libelles).toContain('Trop-perçu rendu');
	});
});

describe('fin de sauvegarde', () => {
	it('garde les fichiers des Pièces et ceux des relevés importés', async () => {
		const { b } = charge();
		const avant = b.fichiers.size;
		expect(avant).toBe(2);
		b.horloge.instant = '2027-01-15T03:00:00.000Z';
		expect(await b.app.exploitation.sauvegarder()).toBe(true);
		expect(b.fichiers.size).toBe(avant);
	});
});

describe('chargement dans un dossier', () => {
	let dossier: string;
	afterEach(() => rmSync(dossier, { recursive: true, force: true }));

	it('écrit une instance que les contrôles acceptent, Exercice clos compris', () => {
		dossier = mkdtempSync(join(tmpdir(), 'ape-jeu-'));
		chargerDansDossier(dossier, { cloturer: true });
		const base = ouvrirBase(join(dossier, 'base.sqlite'));
		const app = composer({ base, fichiers: creerFichiers(join(dossier, 'fichiers')) });
		expect(valeur(app.etats.verifier(app.ctx(null)))).toEqual([]);
		// La Pièce et le relevé importé.
		expect(app.socle.fichiers.lister()).toHaveLength(2);
		base.close();
	});
});
