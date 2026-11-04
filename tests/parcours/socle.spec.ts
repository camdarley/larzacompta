import { expect, test } from '@playwright/test';

test('le serveur construit répond', async ({ request }) => {
	const reponse = await request.get('/');
	expect(reponse.status()).toBeLessThan(500);
});
