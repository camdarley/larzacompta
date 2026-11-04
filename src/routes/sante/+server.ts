import { json } from '@sveltejs/kit';

/** Contrôle Docker (AD-21). Ne dit rien de plus que « vivant ». */
export function GET() {
	return json({ ok: true });
}
