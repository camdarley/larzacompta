-- Pièce d'une Créance ou d'une Dette : la facture reçue justifie la somme dès sa naissance.
-- Elle se joint aussi à chaque Opération qui solde la somme (DECISIONS.md, Pièces des sommes).
-- Une migration commitée ne se modifie jamais.

CREATE TABLE piece_creance_dette (
  piece_id INTEGER NOT NULL REFERENCES piece(id),
  creance_dette_id INTEGER NOT NULL REFERENCES creance_dette(id),
  PRIMARY KEY (piece_id, creance_dette_id)
);
CREATE INDEX piece_creance_dette_somme ON piece_creance_dette(creance_dette_id);
