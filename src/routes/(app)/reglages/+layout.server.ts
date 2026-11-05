import { peut } from '#lib/domaine/droits.ts';
import { application } from '#lib/server/composition.ts';

export function load({ locals }) {
	const { acces } = locals;
	if (acces === null || !peut(acces.role, 'parametrer')) return { versionObsolete: false };
	const app = application();
	const version = app.exploitation.version(app.ctx(acces));
	return { versionObsolete: version.ok && version.valeur.obsolete };
}
