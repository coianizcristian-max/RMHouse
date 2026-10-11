// Un importo scritto in lettere, come sugli assegni: 460 € → "QUATTROCENTOSESSANTA/00", 1.250,50 € → "MILLEDUECENTOCINQUANTA/50"
const UNITA = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici',
  'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const DECINE = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

function sotto100(n) {
  if (n < 20) return UNITA[n];
  const d = Math.floor(n / 10), u = n % 10;
  let t = DECINE[d];
  if (u === 1 || u === 8) t = t.slice(0, -1);          // ventuno, ventotto
  return t + (u === 3 ? 'tré' : UNITA[u]);             // ventitré
}
function sotto1000(n) {
  const c = Math.floor(n / 100), r = n % 100;
  let t = c === 0 ? '' : c === 1 ? 'cento' : `${UNITA[c]}cento`;
  const resto = sotto100(r);
  if (t && /^ott/.test(resto)) t = t.slice(0, -1);      // centottanta
  return t + resto;
}

// numero intero in lettere (fino a 999.999.999)
export function inLettere(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zero';
  const milioni = Math.floor(n / 1e6), migliaia = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  let t = '';
  if (milioni) t += milioni === 1 ? 'unmilione' : `${sotto1000(milioni)}milioni`;
  if (migliaia) t += migliaia === 1 ? 'mille' : `${sotto1000(migliaia)}mila`;
  t += sotto1000(resto);
  return t;
}

// centesimi → "QUATTROCENTOSESSANTA/00"
export function importoInLettere(cent) {
  const c = Math.round(Math.abs(Number(cent) || 0));
  return `${inLettere(Math.floor(c / 100)).toUpperCase()}/${String(c % 100).padStart(2, '0')}`;
}
