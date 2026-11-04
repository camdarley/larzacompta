-- Jalon 1 : reprise telle quelle de SCHEMA-DONNEES.md §3. Ne jamais modifier après publication.

CREATE TABLE association (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nom TEXT NOT NULL,
  adresse TEXT NOT NULL DEFAULT '',
  mois_debut_exercice INTEGER NOT NULL DEFAULT 9 CHECK (mois_debut_exercice BETWEEN 1 AND 12),
  mentions_facture TEXT NOT NULL DEFAULT '',
  etape_assistant INTEGER NOT NULL DEFAULT 1
);

-- annee_debut donne l'ordre, y compris pour un Exercice repère sans dates.
CREATE TABLE exercice (
  id INTEGER PRIMARY KEY,
  libelle TEXT NOT NULL UNIQUE,
  annee_debut INTEGER NOT NULL UNIQUE,
  debut TEXT,
  fin TEXT,
  statut TEXT NOT NULL CHECK (statut IN ('repere', 'ouvert', 'cloture')),
  CHECK ((statut = 'repere') OR (debut IS NOT NULL AND fin IS NOT NULL AND debut < fin))
);

CREATE TABLE groupe (
  id INTEGER PRIMARY KEY,
  libelle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordre INTEGER NOT NULL
);

-- code_systeme : ecart_caisse (« Écart de caisse »), ajustement (« Ajustement »), recette_especes (« Recette d'espèces »),
-- somme_a_rendre (« Somme à rendre », neutre). Toujours présentes, non supprimables, jamais renommées dans le code.
CREATE TABLE nature (
  id INTEGER PRIMARY KEY,
  libelle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  groupe_id INTEGER NOT NULL REFERENCES groupe(id),
  neutre INTEGER NOT NULL DEFAULT 0 CHECK (neutre IN (0, 1)),
  code_systeme TEXT UNIQUE,
  actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1))
);

CREATE TABLE action (
  id INTEGER PRIMARY KEY,
  libelle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  groupe_id INTEGER NOT NULL REFERENCES groupe(id),
  avec_caisse INTEGER NOT NULL DEFAULT 0 CHECK (avec_caisse IN (0, 1)),
  actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1))
);

CREATE TABLE compte (
  id INTEGER PRIMARY KEY,
  libelle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('banque', 'epargne', 'caisse', 'cheques_a_remettre')),
  reserve INTEGER NOT NULL DEFAULT 0 CHECK (reserve IN (0, 1)),
  ordre INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  CHECK (reserve = 0 OR type = 'caisse')
);
CREATE UNIQUE INDEX compte_unique_cheques ON compte(type) WHERE type = 'cheques_a_remettre';

-- Ancre : un Compte a une seule Balance d'ouverture, au début d'un Exercice.
-- Les soldes de départ suivants se calculent en repliant le grand journal.
CREATE TABLE balance_ouverture (
  compte_id INTEGER PRIMARY KEY REFERENCES compte(id),
  exercice_id INTEGER NOT NULL REFERENCES exercice(id),
  solde_centimes INTEGER NOT NULL
);

-- Gel des entrées de calcul à la clôture (AD-5). Jamais un état calculé.
CREATE TABLE cloture_exercice (
  exercice_id INTEGER PRIMARY KEY REFERENCES exercice(id),
  cloture_le TEXT NOT NULL,
  cloture_par INTEGER NOT NULL REFERENCES acces(id),
  parametrage_fige_json TEXT NOT NULL,
  empreinte_sha256 TEXT NOT NULL
);

CREATE TABLE liaison (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('paiement_multiple', 'somme_a_rendre')),
  libelle TEXT NOT NULL
);

-- date : date du fait. Égale à la date du Côté s'il n'y en a qu'un, à celle du Côté sortant pour un
-- Mouvement interne, seule date pour une Opération compensée sans différentiel.
-- Pas de colonne montant : il se déduit des Côtés et des Lignes.
CREATE TABLE operation (
  id INTEGER PRIMARY KEY,
  genre TEXT NOT NULL CHECK (genre IN ('standard', 'interne', 'compensee')),
  origine TEXT NOT NULL DEFAULT 'saisie' CHECK (origine IN (
    'saisie', 'ajustement', 'recette_especes', 'ecart_caisse',
    'cheque_recu', 'cheque_rejete', 'remise')),
  date TEXT NOT NULL,
  libelle TEXT NOT NULL,
  reference TEXT,
  mode_paiement TEXT CHECK (mode_paiement IN (
    'virement', 'prelevement', 'cheque', 'especes', 'carte', 'sumup', 'autre')),
  note TEXT,
  tiers TEXT,
  liaison_id INTEGER REFERENCES liaison(id),
  sans_piece INTEGER NOT NULL DEFAULT 0 CHECK (sans_piece IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL,
  cree_par INTEGER NOT NULL REFERENCES acces(id),
  annulee_le TEXT,
  annulee_par INTEGER REFERENCES acces(id)
);
CREATE INDEX operation_date ON operation(date);

-- Effet daté d'une Opération sur un Compte. C'est le Côté qui se pointe.
CREATE TABLE cote (
  id INTEGER PRIMARY KEY,
  operation_id INTEGER NOT NULL REFERENCES operation(id),
  compte_id INTEGER NOT NULL REFERENCES compte(id),
  date TEXT NOT NULL,
  montant_centimes INTEGER NOT NULL CHECK (montant_centimes <> 0)
);
CREATE INDEX cote_compte_date ON cote(compte_id, date);
CREATE INDEX cote_operation ON cote(operation_id);

-- Effet analytique. Signe : + recette, - dépense. est_reduction range la Ligne dans la colonne opposée
-- à son signe, sans changer le résultat (FR-8, chèque rejeté).
CREATE TABLE ligne (
  id INTEGER PRIMARY KEY,
  operation_id INTEGER NOT NULL REFERENCES operation(id),
  ordre INTEGER NOT NULL,
  montant_centimes INTEGER NOT NULL CHECK (montant_centimes <> 0),
  est_reduction INTEGER NOT NULL DEFAULT 0 CHECK (est_reduction IN (0, 1)),
  nature_id INTEGER NOT NULL REFERENCES nature(id),
  action_id INTEGER REFERENCES action(id),
  exercice_rattachement_id INTEGER NOT NULL REFERENCES exercice(id),
  note TEXT,
  UNIQUE (operation_id, ordre)
);
CREATE INDEX ligne_action ON ligne(action_id);
CREATE INDEX ligne_nature ON ligne(nature_id);

CREATE TABLE profil_csv (
  compte_id INTEGER PRIMARY KEY REFERENCES compte(id),
  reglage_json TEXT NOT NULL
);

-- source reste ouvert à une valeur future sans migration du Pointage (AD-9).
CREATE TABLE import_releve (
  id INTEGER PRIMARY KEY,
  compte_id INTEGER NOT NULL REFERENCES compte(id),
  source TEXT NOT NULL,
  nom_fichier TEXT,
  fichier_sha256 TEXT,
  date_min TEXT,
  date_max TEXT,
  nb_lues INTEGER NOT NULL,
  nb_nouvelles INTEGER NOT NULL,
  nb_connues INTEGER NOT NULL,
  importe_le TEXT NOT NULL,
  importe_par INTEGER NOT NULL REFERENCES acces(id)
);

CREATE TABLE ligne_releve (
  id INTEGER PRIMARY KEY,
  compte_id INTEGER NOT NULL REFERENCES compte(id),
  import_id INTEGER REFERENCES import_releve(id),
  date TEXT NOT NULL,
  montant_centimes INTEGER NOT NULL CHECK (montant_centimes <> 0),
  libelle TEXT NOT NULL,
  identifiant_source TEXT,
  empreinte TEXT NOT NULL,
  doublon TEXT NOT NULL DEFAULT 'non' CHECK (doublon IN ('non', 'a_confirmer', 'confirme')),
  cree_le TEXT NOT NULL
);
CREATE UNIQUE INDEX ligne_releve_identifiant ON ligne_releve(compte_id, identifiant_source)
  WHERE identifiant_source IS NOT NULL;
CREATE INDEX ligne_releve_empreinte ON ligne_releve(compte_id, empreinte);
CREATE INDEX ligne_releve_date ON ligne_releve(compte_id, date);

-- Solde réel constaté. Pour une caisse, le Comptage joue ce rôle dès le jalon 2.
CREATE TABLE constat_solde (
  id INTEGER PRIMARY KEY,
  compte_id INTEGER NOT NULL REFERENCES compte(id),
  date TEXT NOT NULL,
  solde_centimes INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('releve', 'saisie')),
  import_id INTEGER REFERENCES import_releve(id),
  cree_le TEXT NOT NULL,
  cree_par INTEGER NOT NULL REFERENCES acces(id)
);
CREATE INDEX constat_compte_date ON constat_solde(compte_id, date);

CREATE TABLE pointage (
  id INTEGER PRIMARY KEY,
  compte_id INTEGER NOT NULL REFERENCES compte(id),
  cree_le TEXT NOT NULL,
  cree_par INTEGER NOT NULL REFERENCES acces(id)
);
-- UNIQUE sur cote_id et ligne_releve_id : un élément appartient à au plus un Pointage.
CREATE TABLE pointage_cote (
  pointage_id INTEGER NOT NULL REFERENCES pointage(id) ON DELETE CASCADE,
  cote_id INTEGER NOT NULL UNIQUE REFERENCES cote(id),
  PRIMARY KEY (pointage_id, cote_id)
);
CREATE TABLE pointage_ligne (
  pointage_id INTEGER NOT NULL REFERENCES pointage(id) ON DELETE CASCADE,
  ligne_releve_id INTEGER NOT NULL UNIQUE REFERENCES ligne_releve(id),
  PRIMARY KEY (pointage_id, ligne_releve_id)
);

CREATE TABLE creance_dette (
  id INTEGER PRIMARY KEY,
  sens TEXT NOT NULL CHECK (sens IN ('creance', 'dette')),
  tiers TEXT NOT NULL,
  motif TEXT NOT NULL,
  montant_centimes INTEGER NOT NULL CHECK (montant_centimes > 0),
  date TEXT NOT NULL,
  action_id INTEGER REFERENCES action(id),
  note TEXT,
  annulee_le TEXT,
  annulee_par INTEGER REFERENCES acces(id),
  cree_le TEXT NOT NULL,
  cree_par INTEGER NOT NULL REFERENCES acces(id)
);

-- Une Opération peut solder plusieurs Créances, une Créance plusieurs Opérations.
CREATE TABLE reglement (
  id INTEGER PRIMARY KEY,
  creance_dette_id INTEGER NOT NULL REFERENCES creance_dette(id),
  operation_id INTEGER NOT NULL REFERENCES operation(id),
  montant_centimes INTEGER NOT NULL CHECK (montant_centimes > 0),
  UNIQUE (creance_dette_id, operation_id)
);

-- sha256 : adresse du fichier (AD-16). Une Pièce sans rattachement attend dans Pièces.
CREATE TABLE piece (
  id INTEGER PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  nom_original TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  taille_octets INTEGER NOT NULL CHECK (taille_octets BETWEEN 1 AND 20971520),
  cree_le TEXT NOT NULL,
  cree_par INTEGER NOT NULL REFERENCES acces(id)
);
CREATE TABLE piece_operation (
  piece_id INTEGER NOT NULL REFERENCES piece(id),
  operation_id INTEGER NOT NULL REFERENCES operation(id),
  PRIMARY KEY (piece_id, operation_id)
);
CREATE INDEX piece_operation_operation ON piece_operation(operation_id);

-- Un Accès n'est jamais supprimé : le Journal y renvoie. Il se révoque.
CREATE TABLE acces (
  id INTEGER PRIMARY KEY,
  identifiant TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nom_affiche TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('tresorier', 'lecteur', 'compteur')),
  hash_mot_de_passe TEXT,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  cree_le TEXT NOT NULL,
  dernier_acces_le TEXT,
  revoque_le TEXT
);

-- Lien à usage unique : création d'Accès et réinitialisation. Seul le SHA-256 est conservé.
CREATE TABLE jeton_acces (
  hash_jeton TEXT PRIMARY KEY,
  acces_id INTEGER NOT NULL REFERENCES acces(id),
  expire_le TEXT NOT NULL,
  utilise_le TEXT
);

CREATE TABLE session_connexion (
  hash_jeton TEXT PRIMARY KEY,
  acces_id INTEGER NOT NULL REFERENCES acces(id),
  cree_le TEXT NOT NULL,
  derniere_activite_le TEXT NOT NULL,
  expire_le TEXT NOT NULL
);
CREATE INDEX session_connexion_acces ON session_connexion(acces_id);

CREATE TABLE tentative_connexion (
  cle TEXT PRIMARY KEY,
  echecs INTEGER NOT NULL,
  premiere_le TEXT NOT NULL
);

-- Journal des modifications (FR-37). À ne pas confondre avec le grand journal, qui est une projection
-- des Opérations. acces_nom est copié : la phrase reste lisible seule.
CREATE TABLE journal_modification (
  id INTEGER PRIMARY KEY,
  horodatage TEXT NOT NULL,
  acces_id INTEGER REFERENCES acces(id),
  acces_nom TEXT NOT NULL,
  evenement TEXT NOT NULL,
  entite_type TEXT NOT NULL,
  entite_id INTEGER,
  resume TEXT NOT NULL,
  avant_json TEXT,
  apres_json TEXT
);
CREATE INDEX journal_horodatage ON journal_modification(horodatage);
CREATE INDEX journal_entite ON journal_modification(entite_type, entite_id);

CREATE TABLE sauvegarde_execution (
  id INTEGER PRIMARY KEY,
  debut_le TEXT NOT NULL,
  fin_le TEXT,
  statut TEXT NOT NULL CHECK (statut IN ('en_cours', 'reussie', 'echouee')),
  hors_vps INTEGER NOT NULL CHECK (hors_vps IN (0, 1)),
  instantane TEXT,
  message TEXT
);

CREATE TABLE version_disponible (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  derniere_version TEXT,
  verifie_le TEXT
);

-- Exercice : pas de retour en arrière, Clôture immuable.
CREATE TRIGGER exercice_cloture_fige BEFORE UPDATE ON exercice
WHEN OLD.statut = 'cloture'
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER exercice_cloture_sans_suppression BEFORE DELETE ON exercice
WHEN OLD.statut = 'cloture'
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER cloture_immuable_maj BEFORE UPDATE ON cloture_exercice
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER cloture_immuable_suppr BEFORE DELETE ON cloture_exercice
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

-- Opération : ni création, ni changement, ni suppression dans un Exercice clôturé.
-- sans_piece, liaison_id et version restent modifiables : ils ne changent aucun état.
-- liaison_id : un cachet payé en août se relie à ses cotisations payées après la clôture (FR-10).
CREATE TRIGGER operation_verrou_creation BEFORE INSERT ON operation
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND NEW.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

CREATE TRIGGER operation_verrou_maj
BEFORE UPDATE OF genre, origine, date, libelle, reference, mode_paiement, note, tiers,
                 annulee_le, annulee_par ON operation
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture'
             AND (OLD.date BETWEEN e.debut AND e.fin OR NEW.date BETWEEN e.debut AND e.fin))
  OR EXISTS (SELECT 1 FROM cote c JOIN exercice e ON e.statut = 'cloture'
             WHERE c.operation_id = OLD.id AND c.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

CREATE TRIGGER operation_sans_suppression BEFORE DELETE ON operation
BEGIN SELECT RAISE(ABORT, 'operation_non_supprimable'); END;

-- Côté : chaque date compte, un Mouvement interne peut chevaucher deux Exercices.
CREATE TRIGGER cote_verrou_creation BEFORE INSERT ON cote
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND NEW.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

CREATE TRIGGER cote_verrou_maj BEFORE UPDATE ON cote
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture'
             AND (OLD.date BETWEEN e.debut AND e.fin OR NEW.date BETWEEN e.debut AND e.fin))
  OR EXISTS (SELECT 1 FROM operation o JOIN exercice e ON e.statut = 'cloture'
             WHERE o.id = OLD.operation_id AND o.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

CREATE TRIGGER cote_verrou_suppr BEFORE DELETE ON cote
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND OLD.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

-- Côté pointé : montant et Compte verrouillés, suppression interdite (FR-41).
CREATE TRIGGER cote_pointe_verrou_maj BEFORE UPDATE OF montant_centimes, compte_id ON cote
WHEN EXISTS (SELECT 1 FROM pointage_cote p WHERE p.cote_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'cote_pointe'); END;

CREATE TRIGGER cote_pointe_verrou_suppr BEFORE DELETE ON cote
WHEN EXISTS (SELECT 1 FROM pointage_cote p WHERE p.cote_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'cote_pointe'); END;

-- Opération annulée : aucun Côté pointé.
CREATE TRIGGER operation_annulation_pointee BEFORE UPDATE OF annulee_le ON operation
WHEN NEW.annulee_le IS NOT NULL
 AND EXISTS (SELECT 1 FROM cote c JOIN pointage_cote p ON p.cote_id = c.id WHERE c.operation_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'cote_pointe'); END;

-- Ligne : suit la date de son Opération et de ses Côtés.
CREATE TRIGGER ligne_verrou_creation BEFORE INSERT ON ligne
WHEN EXISTS (SELECT 1 FROM operation o JOIN exercice e ON e.statut = 'cloture'
             WHERE o.id = NEW.operation_id AND o.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

CREATE TRIGGER ligne_verrou_maj BEFORE UPDATE ON ligne
WHEN EXISTS (SELECT 1 FROM operation o JOIN exercice e ON e.statut = 'cloture'
             WHERE o.id = OLD.operation_id AND o.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

CREATE TRIGGER ligne_verrou_suppr BEFORE DELETE ON ligne
WHEN EXISTS (SELECT 1 FROM operation o JOIN exercice e ON e.statut = 'cloture'
             WHERE o.id = OLD.operation_id AND o.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

-- Annulation d'un Pointage : refusée si tout ce qu'il relie est dans un Exercice clôturé.
CREATE TRIGGER pointage_verrou_suppr BEFORE DELETE ON pointage
WHEN NOT EXISTS (
    SELECT 1 FROM pointage_cote pc JOIN cote c ON c.id = pc.cote_id
    WHERE pc.pointage_id = OLD.id
      AND NOT EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND c.date BETWEEN e.debut AND e.fin)
  ) AND NOT EXISTS (
    SELECT 1 FROM pointage_ligne pl JOIN ligne_releve l ON l.id = pl.ligne_releve_id
    WHERE pl.pointage_id = OLD.id
      AND NOT EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND l.date BETWEEN e.debut AND e.fin)
  )
BEGIN SELECT RAISE(ABORT, 'pointage_fige'); END;

-- Ancre figée dès qu'un Exercice clôturé en dépend.
CREATE TRIGGER balance_verrou_maj BEFORE UPDATE ON balance_ouverture
WHEN EXISTS (SELECT 1 FROM exercice e JOIN exercice a ON a.id = OLD.exercice_id
             WHERE e.statut = 'cloture' AND e.annee_debut >= a.annee_debut)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER balance_verrou_suppr BEFORE DELETE ON balance_ouverture
WHEN EXISTS (SELECT 1 FROM exercice e JOIN exercice a ON a.id = OLD.exercice_id
             WHERE e.statut = 'cloture' AND e.annee_debut >= a.annee_debut)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

-- Solde constaté figé dans un Exercice clôturé : les Écarts du Document d'AG ne bougent plus.
CREATE TRIGGER constat_verrou_creation BEFORE INSERT ON constat_solde
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND NEW.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER constat_verrou_maj BEFORE UPDATE ON constat_solde
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND OLD.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER constat_verrou_suppr BEFORE DELETE ON constat_solde
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND OLD.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

-- Créance : date et montant figés dans un Exercice clôturé. Elle reste soldable et annulable ensuite (F2).
CREATE TRIGGER creance_verrou_creation BEFORE INSERT ON creance_dette
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND NEW.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER creance_verrou_maj BEFORE UPDATE OF sens, tiers, motif, montant_centimes, date ON creance_dette
WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture'
             AND (OLD.date BETWEEN e.debut AND e.fin OR NEW.date BETWEEN e.debut AND e.fin))
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

-- Règlement : le reste dû d'un Exercice clôturé ne bouge plus. Solder passe par une Opération d'un Exercice ouvert.
CREATE TRIGGER reglement_verrou_creation BEFORE INSERT ON reglement
WHEN EXISTS (SELECT 1 FROM operation o JOIN exercice e ON e.statut = 'cloture'
             WHERE o.id = NEW.operation_id AND o.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER reglement_verrou_maj BEFORE UPDATE ON reglement
WHEN EXISTS (SELECT 1 FROM operation o JOIN exercice e ON e.statut = 'cloture'
             WHERE o.id IN (OLD.operation_id, NEW.operation_id) AND o.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
CREATE TRIGGER reglement_verrou_suppr BEFORE DELETE ON reglement
WHEN EXISTS (SELECT 1 FROM operation o JOIN exercice e ON e.statut = 'cloture'
             WHERE o.id = OLD.operation_id AND o.date BETWEEN e.debut AND e.fin)
BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;

-- Journal des modifications : ajout seul.
CREATE TRIGGER journal_sans_maj BEFORE UPDATE ON journal_modification
BEGIN SELECT RAISE(ABORT, 'journal_immuable'); END;
CREATE TRIGGER journal_sans_suppression BEFORE DELETE ON journal_modification
BEGIN SELECT RAISE(ABORT, 'journal_immuable'); END;
