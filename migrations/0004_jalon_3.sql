-- Jalon 3 : Factures émises, Budget, et le trigger de rétablissement de Créance attendu depuis la
-- revue du jalon 2 (mineur P10, DECISIONS.md). Une migration commitée ne se modifie jamais.

ALTER TABLE creance_dette ADD COLUMN facture_id INTEGER REFERENCES facture(id);

CREATE TABLE compteur_facture (
  annee INTEGER PRIMARY KEY,
  dernier INTEGER NOT NULL CHECK (dernier >= 0),
  derniere_date TEXT NOT NULL
);

-- numero NULL : brouillon. identite_figee_json copie émetteur et mentions à la validation.
-- fichier_sha256 : PDF conservé à la validation, servi tel quel ensuite.
CREATE TABLE facture (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('facture', 'avoir')),
  numero TEXT UNIQUE,
  avoir_de_id INTEGER UNIQUE REFERENCES facture(id),
  tiers_nom TEXT NOT NULL,
  tiers_adresse TEXT NOT NULL DEFAULT '',
  date_emission TEXT,
  action_id INTEGER REFERENCES action(id),
  identite_figee_json TEXT,
  fichier_sha256 TEXT,
  valide_le TEXT,
  valide_par INTEGER REFERENCES acces(id),
  cree_le TEXT NOT NULL,
  CHECK ((type = 'avoir') = (avoir_de_id IS NOT NULL)),
  CHECK ((numero IS NULL) = (valide_le IS NULL))
);

CREATE TABLE facture_ligne (
  id INTEGER PRIMARY KEY,
  facture_id INTEGER NOT NULL REFERENCES facture(id),
  ordre INTEGER NOT NULL,
  designation TEXT NOT NULL,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  prix_unitaire_centimes INTEGER NOT NULL,
  UNIQUE (facture_id, ordre)
);

CREATE TRIGGER facture_validee_fige BEFORE UPDATE ON facture
WHEN OLD.valide_le IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'facture_validee'); END;
CREATE TRIGGER facture_validee_sans_suppression BEFORE DELETE ON facture
WHEN OLD.valide_le IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'facture_validee'); END;
CREATE TRIGGER facture_ligne_fige_creation BEFORE INSERT ON facture_ligne
WHEN EXISTS (SELECT 1 FROM facture f WHERE f.id = NEW.facture_id AND f.valide_le IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'facture_validee'); END;
CREATE TRIGGER facture_ligne_fige_maj BEFORE UPDATE ON facture_ligne
WHEN EXISTS (SELECT 1 FROM facture f WHERE f.id = OLD.facture_id AND f.valide_le IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'facture_validee'); END;
CREATE TRIGGER facture_ligne_fige_suppr BEFORE DELETE ON facture_ligne
WHEN EXISTS (SELECT 1 FROM facture f WHERE f.id = OLD.facture_id AND f.valide_le IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'facture_validee'); END;

-- action_id 0 interdit par la clé étrangère : l'index couvre les deux cas sans Action.
CREATE TABLE budget_ligne (
  id INTEGER PRIMARY KEY,
  exercice_id INTEGER NOT NULL REFERENCES exercice(id),
  action_id INTEGER REFERENCES action(id),
  nature_id INTEGER NOT NULL REFERENCES nature(id),
  sens TEXT NOT NULL CHECK (sens IN ('recette', 'depense')),
  montant_centimes INTEGER NOT NULL CHECK (montant_centimes >= 0)
);
CREATE UNIQUE INDEX budget_unique ON budget_ligne(exercice_id, COALESCE(action_id, 0), nature_id, sens);

-- FR-3 : une annulation vue par une clôture fait partie de l'état clos. Double `deciderRetablissement`.
CREATE TRIGGER creance_retablir_verrou BEFORE UPDATE OF annulee_le ON creance_dette
WHEN OLD.annulee_le IS NOT NULL AND NEW.annulee_le IS NULL AND EXISTS (
  SELECT 1 FROM exercice e JOIN cloture_exercice k ON k.exercice_id = e.id
  WHERE OLD.date <= e.fin AND substr(OLD.annulee_le, 1, 10) <= e.fin AND OLD.annulee_le <= k.cloture_le
)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
