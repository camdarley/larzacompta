-- Jalon 2 : caisses, Comptages, Sessions, chèques (SCHEMA-DONNEES §4). Ajouts seulement (AD-22).

ALTER TABLE cote ADD COLUMN session_caisse_id INTEGER REFERENCES session_caisse(id);
-- pendant : l'argent a bougé avant le Comptage final, la Recette d'espèces en tient compte.
-- apres_comptage : sorti ou entré après ce Comptage, il ne touche que le solde.
ALTER TABLE cote ADD COLUMN session_phase TEXT
  CHECK (session_phase IN ('pendant', 'apres_comptage'));

CREATE TABLE session_caisse (
  id INTEGER PRIMARY KEY,
  compte_id INTEGER NOT NULL REFERENCES compte(id),
  action_id INTEGER REFERENCES action(id),
  ouverte_le TEXT NOT NULL,
  ouverte_par INTEGER NOT NULL REFERENCES acces(id),
  cloturee_le TEXT,
  cloturee_par INTEGER REFERENCES acces(id),
  operation_recette_id INTEGER REFERENCES operation(id)
);
CREATE UNIQUE INDEX session_une_ouverte_par_caisse ON session_caisse(compte_id)
  WHERE cloturee_le IS NULL;

CREATE TABLE comptage (
  id INTEGER PRIMARY KEY,
  compte_id INTEGER NOT NULL REFERENCES compte(id),
  session_caisse_id INTEGER REFERENCES session_caisse(id),
  type TEXT NOT NULL CHECK (type IN ('ouverture', 'fin', 'controle')),
  date TEXT NOT NULL,
  compte_le TEXT NOT NULL,
  saisi_le TEXT NOT NULL,
  saisi_par INTEGER NOT NULL REFERENCES acces(id),
  operation_ecart_id INTEGER REFERENCES operation(id),
  CHECK ((type = 'controle') = (session_caisse_id IS NULL))
);
CREATE UNIQUE INDEX comptage_unique_par_type ON comptage(session_caisse_id, type)
  WHERE session_caisse_id IS NOT NULL;
CREATE INDEX comptage_compte ON comptage(compte_id, compte_le);

CREATE TABLE comptage_coupure (
  comptage_id INTEGER NOT NULL REFERENCES comptage(id) ON DELETE CASCADE,
  coupure_centimes INTEGER NOT NULL CHECK (coupure_centimes IN (
    50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1)),
  quantite INTEGER NOT NULL CHECK (quantite >= 0),
  PRIMARY KEY (comptage_id, coupure_centimes)
);

CREATE TABLE acces_caisse (
  acces_id INTEGER NOT NULL REFERENCES acces(id),
  compte_id INTEGER NOT NULL REFERENCES compte(id),
  PRIMARY KEY (acces_id, compte_id)
);

-- numero : suite propre aux bordereaux. Compte de destination et total se lisent sur l'Opération interne.
CREATE TABLE remise (
  id INTEGER PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE,
  operation_id INTEGER NOT NULL UNIQUE REFERENCES operation(id)
);

-- Pas de colonne statut ni montant : voir AD-11.
CREATE TABLE cheque_recu (
  id INTEGER PRIMARY KEY,
  operation_id INTEGER NOT NULL UNIQUE REFERENCES operation(id),
  emetteur TEXT NOT NULL,
  banque TEXT,
  numero TEXT,
  date_cheque TEXT,
  remise_id INTEGER REFERENCES remise(id),
  operation_rejet_id INTEGER UNIQUE REFERENCES operation(id)
);
CREATE INDEX cheque_recu_remise ON cheque_recu(remise_id);

-- operation_id NULL : formule annulée sans paiement, conservée au registre.
CREATE TABLE cheque_emis (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  beneficiaire TEXT NOT NULL,
  operation_id INTEGER UNIQUE REFERENCES operation(id),
  annule_le TEXT,
  annule_par INTEGER REFERENCES acces(id),
  CHECK (operation_id IS NOT NULL OR annule_le IS NOT NULL)
);

-- Comptage : figé dans un Exercice clôturé, comme une Opération.
CREATE TRIGGER comptage_verrou_creation BEFORE INSERT ON comptage
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND NEW.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER comptage_verrou_maj BEFORE UPDATE ON comptage
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture'
             AND (OLD.date BETWEEN e.debut AND e.fin OR NEW.date BETWEEN e.debut AND e.fin))
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER comptage_verrou_suppr BEFORE DELETE ON comptage
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND OLD.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER coupure_verrou_creation BEFORE INSERT ON comptage_coupure
WHEN EXISTS (SELECT 1 FROM comptage c JOIN exercice e ON e.statut = 'cloture'
             WHERE c.id = NEW.comptage_id AND c.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER coupure_verrou_maj BEFORE UPDATE ON comptage_coupure
WHEN EXISTS (SELECT 1 FROM comptage c JOIN exercice e ON e.statut = 'cloture'
             WHERE c.id = OLD.comptage_id AND c.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER coupure_verrou_suppr BEFORE DELETE ON comptage_coupure
WHEN EXISTS (SELECT 1 FROM comptage c JOIN exercice e ON e.statut = 'cloture'
             WHERE c.id = OLD.comptage_id AND c.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

-- Le Compte des chèques reçus, à solde nul, s'il manque à une instance déjà préparée. Une instance
-- neuve le reçoit en ouvrant son premier Exercice. Rangé après tous les autres. Un Compte de l'APE peut
-- déjà porter ce nom : le suffixe évite le conflit, sans rien renommer.
INSERT INTO compte (libelle, type, ordre)
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM compte WHERE libelle = 'Chèques à remettre')
    THEN 'Chèques à remettre (système)' ELSE 'Chèques à remettre' END,
  'cheques_a_remettre',
  1000000
WHERE EXISTS (SELECT 1 FROM association)
  AND NOT EXISTS (SELECT 1 FROM compte WHERE type = 'cheques_a_remettre');
