/**
 * Relevés entièrement inventés. Ils vivent ici en TypeScript : `.gitignore` protège tout `*.ofx`,
 * et doit le rester. `ofxCp1252` encode comme la banque : CP1252, sans BOM.
 */
export type LigneOfx = { date: string; montant: string; id?: string; libelle: string };

export const LIBELLE_LONG =
	'VIREMENT DE ASSOCIATION IMAGINAIRE DES FAMILLES DU QUARTIER FICTIF POUR LA PARTICIPATION À LA SORTIE ÉDUCATIVE DE MARS FIN.';

const ligneOfx = (l: LigneOfx) => `<STMTTRN>
<TRNTYPE>${l.montant.startsWith('-') ? 'DEBIT' : 'CREDIT'}
<DTPOSTED>${l.date}
<TRNAMT>${l.montant}
${l.id === undefined ? '' : `<FITID>${l.id}\n`}<NAME>${l.libelle}
</STMTTRN>`;

export function ofxTexte(
	lignes: readonly LigneOfx[],
	solde: { montant: string; date: string } | null = { montant: '1500.00', date: '20261020' }
): string {
	return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261020120000<LANGUAGE>FRA</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>0<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>EUR
<BANKACCTFROM><BANKID>00000<BRANCHID>00000<ACCTID>00000000000<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20261020
${lignes.map(ligneOfx).join('\n')}
</BANKTRANLIST>
${solde === null ? '' : `<LEDGERBAL><BALAMT>${solde.montant}<DTASOF>${solde.date}</LEDGERBAL>`}
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;
}

export function ofxCp1252(texte: string): Uint8Array {
	return new Uint8Array(Buffer.from(texte, 'latin1'));
}

export const LIGNES_FICTIVES: LigneOfx[] = [
	{
		date: '20261005',
		montant: '-1000.00',
		id: 'A000000001',
		libelle: 'VIR SEPA AUTOCARS IMAGINAIRES FA-2026-14'
	},
	{ date: '20261008', montant: '-3.50', id: 'A000000002', libelle: 'FRAIS TENUE DE COMPTE' },
	{ date: '20261012', montant: '480.00', id: 'A000000003', libelle: 'REMISE CHÈQUES ÉCOLE FICTIVE' }
];
