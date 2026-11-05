/**
 * Écrit une instance fictive dans un dossier, avec le code de cette version.
 * `cycle.ts` le lance depuis la version précédente : c'est sa base qui monte de version.
 * Usage : node tests/cycle/preparer.ts <dossier>
 */
import { chargerDansDossier } from '../jeux/charger.ts';

const [dossier] = process.argv.slice(2);
if (!dossier) throw new Error('Usage : preparer.ts <dossier>');
chargerDansDossier(dossier, { cloturer: true });
