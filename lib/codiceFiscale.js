// Codice fiscale delle persone fisiche: controllo, lettura e calcolo dai dati anagrafici.
// L'elenco dei comuni e degli stati esteri (codici catastali) sta in lib/belfiore.js e si carica solo quando serve.

const DISPARI = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
const MESI = 'ABCDEHLMPRST';
const OMOCODIA = 'LMNPQRSTUV';            // le cifre sostituite da lettere quando due codici coincidono
const POSIZIONI_NUMERICHE = [6, 7, 9, 10, 12, 13, 14];
const FORMATO = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

// "rss mra 80a01 h501u " → "RSSMRA80A01H501U"
export const normalizzaCF = (cf) => String(cf || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const valore = (ch) => (/[0-9]/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65);
export function carattereControllo(primi15) {
  let s = 0;
  for (let i = 0; i < 15; i++) s += i % 2 === 0 ? DISPARI[valore(primi15[i])] : valore(primi15[i]);
  return String.fromCharCode(65 + (s % 26));
}

// toglie l'omocodia: le lettere al posto delle cifre tornano cifre
export function senzaOmocodia(cf) {
  const c = normalizzaCF(cf).split('');
  if (c.length !== 16) return c.join('');
  for (const i of POSIZIONI_NUMERICHE) if (OMOCODIA.includes(c[i])) c[i] = String(OMOCODIA.indexOf(c[i]));
  c[15] = carattereControllo(c.slice(0, 15).join(''));
  return c.join('');
}

// Perché un codice non va (null se va bene)
export function problemaCF(cf) {
  const grezzo = String(cf || '').trim();
  const c = normalizzaCF(cf);
  if (!c) return 'manca';
  if (/^\d{11}$/.test(c)) return 'È una partita IVA (11 cifre), non il codice fiscale di una persona.';
  if (c.length !== 16) return `Ha ${c.length} caratteri invece di 16: ne ${c.length < 16 ? 'manca qualcuno' : 'ha qualcuno in più'}.`;
  if (!FORMATO.test(c)) {
    if (/[O]/.test(c.slice(6, 8) + c.slice(9, 11) + c.slice(12, 15))) return 'C\'è una lettera O dove andrebbe lo zero.';
    if (!MESI.includes(c[8])) return `La lettera del mese ("${c[8]}") non esiste: i mesi sono ${MESI.split('').join(' ')}.`;
    return 'Lettere e cifre non sono al posto giusto (6 lettere, 2 cifre, 1 lettera, 2 cifre, 1 lettera, 3 cifre, 1 lettera).';
  }
  if (carattereControllo(c.slice(0, 15)) !== c[15]) return 'L\'ultima lettera (di controllo) non torna: di solito vuol dire che una lettera o una cifra è sbagliata.';
  if (grezzo !== c) return null; // con spazi o minuscole, ma giusto
  return null;
}
export const cfValido = (cf) => problemaCF(cf) === null;

// Data di nascita, sesso e codice del luogo scritti nel codice fiscale
export function leggiCF(cf) {
  const c = senzaOmocodia(cf);
  if (!FORMATO.test(c)) return null;
  const aa = Number(c.slice(6, 8)), mese = MESI.indexOf(c[8]) + 1;
  let gg = Number(c.slice(9, 11));
  if (!mese || !gg) return null;
  const sesso = gg > 40 ? 'F' : 'M';
  if (gg > 40) gg -= 40;
  const anno = aa > new Date().getFullYear() % 100 ? 1900 + aa : 2000 + aa;
  return { data: `${anno}-${String(mese).padStart(2, '0')}-${String(gg).padStart(2, '0')}`, sesso, luogo: c.slice(11, 15) };
}

// ------------------------------------------------------------------ calcolo
const lettere = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
const consonanti = (t) => t.replace(/[AEIOU]/g, '');
const vocali = (t) => t.replace(/[^AEIOU]/g, '');

export function parteCognome(cognome) {
  const t = lettere(cognome);
  return (consonanti(t) + vocali(t) + 'XXX').slice(0, 3);
}
export function parteNome(nome) {
  const t = lettere(nome), c = consonanti(t);
  if (c.length >= 4) return c[0] + c[2] + c[3];
  return (c + vocali(t) + 'XXX').slice(0, 3);
}
export function parteNascita(dataISO, sesso) {
  const [a, m, g] = String(dataISO || '').split('-').map(Number);
  if (!a || !m || !g) return null;
  return String(a % 100).padStart(2, '0') + MESI[m - 1] + String(sesso === 'F' ? g + 40 : g).padStart(2, '0');
}

export function calcolaCF({ nome, cognome, data, sesso, codiceLuogo }) {
  if (!nome || !cognome || !data || !['M', 'F'].includes(sesso) || !/^[A-Z]\d{3}$/.test(codiceLuogo || '')) return null;
  const n = parteNascita(data, sesso);
  if (!n) return null;
  const primi = parteCognome(cognome) + parteNome(nome) + n + codiceLuogo;
  return primi + carattereControllo(primi);
}

// ------------------------------------------------------------------ comuni e stati esteri
let elenco = null;
export async function caricaLuoghi() {
  if (elenco) return elenco;
  const { default: testo } = await import('./belfiore');
  elenco = testo.split('\n').map((r) => {
    const [nome, prov, codice, dal, al] = r.split('|');
    return { nome, prov, codice, dal: Number(dal) || 0, al: Number(al) || 9999, chiave: chiaveLuogo(nome) };
  });
  return elenco;
}
// "San Bonifacio (VR)", "S. Bonifacio", "sanbonifacio" → stessa chiave
export const chiaveLuogo = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/\(.*?\)/g, ' ').replace(/\bS\.\s*/g, 'SAN ').replace(/[^A-Z]/g, '');

// Il codice catastale del luogo di nascita (comune italiano o stato estero), tenendo conto dell'anno di nascita.
// Ritorna { codice, nome, prov } oppure { errore }.
// nomi comuni degli stati esteri → nome ufficiale nell'elenco
const ALIAS = {
  USA: "Stati Uniti d'America", STATIUNITI: "Stati Uniti d'America", AMERICA: "Stati Uniti d'America", STATIUNITIDAMERICA: "Stati Uniti d'America",
  MOLDAVIA: 'Moldova', RUSSIA: 'Federazione russa', INGHILTERRA: 'Regno Unito', GRANBRETAGNA: 'Regno Unito', UK: 'Regno Unito',
  SCOZIA: 'Regno Unito', GALLES: 'Regno Unito', MACEDONIA: 'Macedonia del Nord', BOSNIA: 'Bosnia-Erzegovina', CECA: 'Repubblica ceca',
  REPCECA: 'Repubblica ceca', COREA: 'Corea del Sud', OLANDA: 'Paesi Bassi', CILE: 'Cile', CUBA: 'Cuba', SANTODOMINGO: 'Repubblica Dominicana',
};

export function trovaLuogo(luogo, dataISO, luoghi) {
  let testo = String(luogo || '').trim();
  if (!testo) return { errore: 'manca' };
  // la provincia scritta in fondo senza parentesi: "Camposampiero PD", "San Bonifacio - VR"
  const fine = testo.match(/^(.*?)[\s,\-]+([A-Za-z]{2})$/);
  if (fine && luoghi.some((l) => l.prov === fine[2].toUpperCase())) testo = `${fine[1]} (${fine[2].toUpperCase()})`;
  if (/^[A-Z]\d{3}$/i.test(testo)) {
    const x = luoghi.find((l) => l.codice === testo.toUpperCase());
    return x ? { codice: x.codice, nome: x.nome, prov: x.prov } : { errore: `Il codice ${testo.toUpperCase()} non esiste.` };
  }
  const prov = (testo.match(/\(([A-Za-z]{2})\)/) || [])[1]?.toUpperCase();
  const k = chiaveLuogo(testo);
  let cand = luoghi.filter((l) => l.chiave === k);
  if (!cand.length && ALIAS[k]) cand = luoghi.filter((l) => l.chiave === chiaveLuogo(ALIAS[k]));
  // comune che ha cambiato nome allungandolo (es. "Negrar" → "Negrar di Valpolicella", stesso codice)
  if (!cand.length && k.length >= 4) {
    const lunghi = luoghi.filter((l) => l.chiave.startsWith(k) && !l.prov.startsWith('Z:') && (!prov || l.prov === prov));
    if (new Set(lunghi.map((l) => l.codice)).size === 1) cand = lunghi;
  }
  if (!cand.length) return { errore: `Non trovo "${testo}" tra i comuni italiani e gli stati esteri. Scrivi il comune come sul documento (es. Bassano del Grappa); per chi è nato all'estero scrivi lo stato, non la città (es. Turchia, non Istanbul).` };
  if (prov) { const p = cand.filter((l) => l.prov === prov); if (p.length) cand = p; }
  const anno = Number(String(dataISO || '').slice(0, 4)) || new Date().getFullYear();
  const attivi = cand.filter((l) => l.dal <= anno && anno <= l.al);
  if (attivi.length) cand = attivi;
  const codici = [...new Set(cand.map((l) => l.codice))];
  if (codici.length > 1) {
    return { errore: `"${testo}" corrisponde a più luoghi (${cand.map((l) => `${l.nome} ${l.prov.startsWith('Z:') ? '' : l.prov}`.trim()).join(', ')}): aggiungi la provincia tra parentesi, es. "${cand[0].nome} (${cand[0].prov})".` };
  }
  const x = cand.find((l) => l.codice === codici[0]);
  return { codice: x.codice, nome: x.nome, prov: x.prov };
}

// Confronto tra il codice scritto e quello che viene dai dati: che parti non tornano
export function differenze(cf, calcolato) {
  const a = senzaOmocodia(cf), b = calcolato;
  if (!b || a.length !== 16) return [];
  const parti = [];
  if (a.slice(0, 3) !== b.slice(0, 3)) parti.push('cognome');
  if (a.slice(3, 6) !== b.slice(3, 6)) parti.push('nome');
  if (a.slice(6, 8) !== b.slice(6, 8) || a[8] !== b[8] || (Number(a.slice(9, 11)) % 40) !== (Number(b.slice(9, 11)) % 40)) parti.push('data di nascita');
  if ((Number(a.slice(9, 11)) > 40) !== (Number(b.slice(9, 11)) > 40)) parti.push('sesso');
  if (a.slice(11, 15) !== b.slice(11, 15)) parti.push('luogo di nascita');
  return parti;
}
