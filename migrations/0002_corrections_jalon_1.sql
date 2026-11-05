-- Verrous manquants du jalon 1, trouvés par la revue indépendante. 0001 ne se modifie pas.

-- Numéro de compte lu dans un OFX : un fichier d'un autre compte ne se fond pas dans celui-ci.
ALTER TABLE import_releve ADD COLUMN compte_source TEXT;

-- Une ancre ne se pose pas après un mouvement du Compte : elle réécrirait les soldes passés (E6, O5).
CREATE TRIGGER balance_ancre_creation BEFORE INSERT ON balance_ouverture
WHEN EXISTS (SELECT 1 FROM cote c
             JOIN operation o ON o.id = c.operation_id AND o.annulee_le IS NULL
             JOIN exercice e ON e.id = NEW.exercice_id
             WHERE c.compte_id = NEW.compte_id AND c.date < e.debut)
BEGIN SELECT RAISE(ABORT, 'ancre_invalide'); END;
CREATE TRIGGER balance_ancre_maj BEFORE UPDATE OF exercice_id ON balance_ouverture
WHEN EXISTS (SELECT 1 FROM cote c
             JOIN operation o ON o.id = c.operation_id AND o.annulee_le IS NULL
             JOIN exercice e ON e.id = NEW.exercice_id
             WHERE c.compte_id = NEW.compte_id AND c.date < e.debut)
BEGIN SELECT RAISE(ABORT, 'ancre_invalide'); END;

-- Créance : tout ce qui précède la fin d'un Exercice clôturé est figé, y compris une date
-- antérieure au premier Exercice tenu, que les verrous de 0001 ne couvraient pas.
CREATE TRIGGER creance_verrou_anterieure BEFORE INSERT ON creance_dette
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND NEW.date <= e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER creance_verrou_anterieure_maj
BEFORE UPDATE OF sens, tiers, motif, montant_centimes, date ON creance_dette
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture'
             AND (OLD.date <= e.fin OR NEW.date <= e.fin))
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
