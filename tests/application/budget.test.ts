import { beforeEach, describe, expect, it } from 'vitest';
import { vueBudget } from '#lib/domaine/budget/index.ts';
import { centimes as c } from '#lib/domaine/montant.ts';
import { unzipSync, strFromU8 } from 'fflate';
import { instancePrete, valeur } from './aides/instance.ts';

let i: ReturnType<typeof instancePrete>;
const budget = () => i.app.budget;
const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? null : r.erreur?.code);
const compter = (table: string) =>
	i.base.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;
const ligne = (partiel: Record<string, unknown> = {}) => ({
	exerciceId: i.courant.id,
	actionId: i.actionId as number | null,
	natureId: i.natureId,
	sens: 'depense' as const,
	montant: c(100_00) as ReturnType<typeof c> | null,
	...partiel
});
const parExercice = (id: number) => i.app.socle.depots.budget.lignes(id);

/** 2026-2027 clôturé, 2027-2028 ouvert : `suivant` a un vrai précédent. */
function anneeSuivante() {
	const ctx = i.ctx();
	valeur(i.app.exercices.ouvrirSuivant(ctx));
	valeur(i.app.exercices.cloturer(ctx, i.courant.id));
	return i.app.socle.depots.exercices.lister().find((e) => e.statut === 'ouvert')!;
}

beforeEach(() => {
	i = instancePrete();
});

describe('Enregistrer une prévision (story 10.1)', () => {
	it('écrit sans rien ajouter au Journal (AD-7)', () => {
		const avant = i.journal().length;
		valeur(budget().enregistrer(i.ctx(), ligne()));
		expect(parExercice(i.courant.id)).toEqual([
			{
				exerciceId: i.courant.id,
				actionId: i.actionId,
				natureId: i.natureId,
				sens: 'depense',
				montant: 100_00
			}
		]);
		expect(i.journal()).toHaveLength(avant);
	});

	it('remplace le montant au lieu de doubler la ligne', () => {
		valeur(budget().enregistrer(i.ctx(), ligne()));
		valeur(budget().enregistrer(i.ctx(), ligne({ montant: c(250_00) })));
		expect(parExercice(i.courant.id).map((l) => l.montant)).toEqual([250_00]);
	});

	it('remplace aussi sans Action : l’index couvre ce cas', () => {
		valeur(budget().enregistrer(i.ctx(), ligne({ actionId: null })));
		valeur(budget().enregistrer(i.ctx(), ligne({ actionId: null, montant: c(5_00) })));
		expect(parExercice(i.courant.id).map((l) => l.montant)).toEqual([5_00]);
	});

	it('garde recette et dépense séparées sur une même Nature', () => {
		valeur(budget().enregistrer(i.ctx(), ligne()));
		valeur(budget().enregistrer(i.ctx(), ligne({ sens: 'recette' })));
		expect(compter('budget_ligne')).toBe(2);
	});

	it('budget_unique refuse un doublon écrit à la main', () => {
		const inserer = `INSERT INTO budget_ligne (exercice_id, action_id, nature_id, sens, montant_centimes)
			VALUES (${i.courant.id}, NULL, ${i.natureId}, 'depense', 1)`;
		i.base.exec(inserer);
		expect(() => i.base.exec(inserer)).toThrow(/UNIQUE/);
	});

	it('retire la prévision quand le champ est vidé', () => {
		valeur(budget().enregistrer(i.ctx(), ligne()));
		valeur(budget().enregistrer(i.ctx(), ligne({ montant: null })));
		expect(compter('budget_ligne')).toBe(0);
	});

	it('retire sans toucher la ligne voisine sans Action', () => {
		valeur(budget().enregistrer(i.ctx(), ligne({ actionId: null })));
		valeur(budget().enregistrer(i.ctx(), ligne()));
		valeur(budget().enregistrer(i.ctx(), ligne({ actionId: null, montant: null })));
		expect(parExercice(i.courant.id).map((l) => l.actionId)).toEqual([i.actionId]);
	});

	it('refuse un Exercice repère, une Nature inconnue ou neutre', () => {
		expect(code(budget().enregistrer(i.ctx(), ligne({ exerciceId: i.repere.id })))).toBe(
			'element_introuvable'
		);
		expect(code(budget().enregistrer(i.ctx(), ligne({ natureId: 9999 })))).toBe(
			'element_introuvable'
		);
		const neutre = i.app.socle.depots.parametrage.natures().find((n) => n.neutre)!;
		expect(code(budget().enregistrer(i.ctx(), ligne({ natureId: neutre.id })))).toBe(
			'element_introuvable'
		);
	});

	it('refuse un Exercice clôturé', () => {
		anneeSuivante();
		expect(code(budget().enregistrer(i.ctx(), ligne()))).toBe('budget_cloture');
	});

	it('refuse à qui ne saisit pas, en lecture comme en écriture', () => {
		const lecteur = i.app.ctx({ ...i.tresorier, role: 'lecteur' });
		expect(code(budget().enregistrer(lecteur, ligne()))).toBe('acces_refuse');
		expect(code(budget().ecran(lecteur, i.courant))).toBe('acces_refuse');
		expect(code(budget().action(lecteur, i.courant, i.actionId))).toBe('acces_refuse');
		expect(code(budget().modele(lecteur, i.courant))).toBe('acces_refuse');
		expect(code(budget().repartir(lecteur, i.courant.id))).toBe('acces_refuse');
	});
});

describe('Repartir du réalisé (story 10.2)', () => {
	it('remplit le Prévu avec le réalisé de l’Exercice précédent', () => {
		valeur(
			i.app.operations.creer(
				i.ctx(),
				i.saisie('depense', 1_250_00, {
					lignes: [
						{
							montant: c(1_250_00),
							contraire: false,
							reduction: false,
							natureId: i.natureId,
							actionId: i.actionId,
							exerciceRattachementId: null,
							note: null
						}
					]
				})
			)
		);
		const suivant = anneeSuivante();
		expect(valeur(budget().ecran(i.ctx(), suivant)).depart).toBe(i.courant.libelle);
		expect(valeur(budget().repartir(i.ctx(), suivant.id))).toEqual({
			lignes: 1,
			depuis: i.courant.libelle
		});
		expect(parExercice(suivant.id)).toMatchObject([
			{ actionId: i.actionId, natureId: i.natureId, sens: 'depense', montant: 1_250_00 }
		]);
		// Modifiable ensuite, sans repasser par le réalisé.
		valeur(budget().enregistrer(i.ctx(), ligne({ exerciceId: suivant.id })));
		expect(parExercice(suivant.id).map((l) => l.montant)).toEqual([100_00]);
		expect(code(budget().repartir(i.ctx(), suivant.id))).toBe('budget_deja_prepare');
	});

	it('refuse s’il n’y a rien à reprendre', () => {
		expect(valeur(budget().ecran(i.ctx(), i.courant)).depart).toBeNull();
		expect(code(budget().repartir(i.ctx(), i.courant.id))).toBe('budget_sans_realise');
		expect(compter('budget_ligne')).toBe(0);
	});
});

describe('Lire le Budget', () => {
	it('compare le prévu au réalisé en un seul calcul', () => {
		valeur(budget().enregistrer(i.ctx(), ligne({ actionId: null, montant: c(1_000_00) })));
		valeur(i.app.operations.creer(i.ctx(), i.saisie('depense', 1_250_00)));
		const e = valeur(budget().ecran(i.ctx(), i.courant));
		const vue = vueBudget({ prevus: e.lignes, realise: e.realise, parametrage: e.parametrage });
		expect(vue.blocs[0]?.rangees[0]).toMatchObject({
			prevu: 1_000_00,
			realise: 1_250_00,
			difference: 250_00,
			pourcentage: 25,
			depassement: true
		});
	});

	it('propose chaque Action active, et jamais une Nature neutre', () => {
		const e = valeur(budget().ecran(i.ctx(), i.courant));
		expect(e.vides).toEqual([i.actionId, null]);
		const neutre = i.app.socle.depots.parametrage.natures().find((n) => n.neutre)!;
		expect(e.natures.map((n) => n.id)).not.toContain(neutre.id);
		expect(e.natures.map((n) => n.id)).toContain(i.natureId);
	});

	it('ne propose plus rien sur un Exercice clôturé', () => {
		valeur(budget().enregistrer(i.ctx(), ligne()));
		anneeSuivante();
		const clos = i.app.socle.depots.exercices.lister().find((x) => x.id === i.courant.id)!;
		const e = valeur(budget().ecran(i.ctx(), clos));
		expect(e).toMatchObject({ modifiable: false, vides: [], depart: null });
		expect(e.lignes).toHaveLength(1);
	});

	it('donne à la page d’Action son seul Budget, s’il en a un', () => {
		expect(valeur(budget().action(i.ctx(), i.courant, i.actionId))).toBeNull();
		valeur(budget().enregistrer(i.ctx(), ligne({ actionId: null })));
		expect(valeur(budget().action(i.ctx(), i.courant, i.actionId))).toBeNull();
		valeur(budget().enregistrer(i.ctx(), ligne()));
		expect(valeur(budget().action(i.ctx(), i.courant, i.actionId))?.rangees).toHaveLength(1);
	});

	it('ne reste pas hors de l’export complet', async () => {
		valeur(budget().enregistrer(i.ctx(), ligne()));
		const { flux } = valeur(i.app.etats.exportComplet(i.ctx()));
		const octets = new Uint8Array(await new Response(flux).arrayBuffer());
		const csv = strFromU8(unzipSync(octets)['budget.csv'] as Uint8Array);
		expect(csv).toContain('Kermesse;Papeterie;Dépense;100,00');
	});
});

describe('Comparer un état (story 10.3)', () => {
	it('lit l’Exercice clôturé avec son paramétrage figé, et le choix dans l’URL', () => {
		const ctx = i.ctx();
		valeur(
			i.app.operations.creer(
				ctx,
				i.saisie('depense', 40_00, {
					lignes: [
						{
							montant: c(40_00),
							contraire: false,
							reduction: false,
							natureId: i.natureId,
							actionId: i.actionId,
							exerciceRattachementId: null,
							note: null
						}
					]
				})
			)
		);
		const suivant = anneeSuivante();
		const action = i.app.socle.depots.parametrage.actions().find((a) => a.id === i.actionId)!;
		i.app.socle.depots.parametrage.modifierAction(i.actionId, {
			...action,
			libelle: 'Fête renommée'
		});
		const r = valeur(i.app.etats.compteDeResultat(ctx, suivant, i.courant.libelle));
		const noeud = r.comparaison?.noeuds.flatMap((n) => n.enfants).find((n) => n.actionId);
		expect(r.comparaison?.colonnes.map((x) => x.libelle)).toEqual([i.courant.libelle]);
		expect(noeud).toMatchObject({ absent: true, comparaisons: [-40_00], libelle: 'Kermesse' });
		expect(r.comparables).toEqual([i.courant.libelle]);
	});

	it('n’ajoute rien sans choix', () => {
		const r = valeur(i.app.etats.compteDeResultat(i.ctx(), i.courant));
		expect(r.comparaison).toBeNull();
	});

	it('porte les colonnes jusqu’au modèle exporté', () => {
		valeur(i.app.operations.creer(i.ctx(), i.saisie('depense', 40_00)));
		const suivant = anneeSuivante();
		const m = valeur(
			i.app.etats.modele(i.ctx(), 'compte-de-resultat', suivant, null, i.courant.libelle)
		);
		expect(m.sections[0]?.tableau?.colonnes.at(-1)?.libelle).toBe(i.courant.libelle);
	});
});
