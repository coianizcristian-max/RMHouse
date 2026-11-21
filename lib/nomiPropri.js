// Per capire se in un elenco i nomi sono scritti «Nome Cognome» o «Cognome Nome»: nomi di battesimo frequenti.
// Non serve che ci siano tutti: basta la maggioranza delle righe per indovinare l'ordine (si può sempre cambiare a mano).
const NOMI = `alessandra alessia alice anna arianna aurora beatrice benedetta bianca camilla carlotta caterina cecilia chiara
cristina claudia daniela denise diana elena eleonora elisa elisabetta emma erica erika federica francesca gaia giada giorgia
giulia ginevra greta ilaria irene isabella jessica laura lavinia letizia linda lisa lucia ludovica luisa maddalena margherita
maria marta martina matilde melissa michela miriam monica nadia nicole noemi paola rachele rebecca roberta rosa sara serena
silvia simona sofia sophie stefania teresa valentina valeria vanessa veronica viola vittoria zoe agnese adele ambra angela
annalisa antonella asia barbara carla carolina debora elisabeth emily eva fabiola gemma gioia giovanna grazia ester elsa
nina noa olivia petra priscilla ottavia mia luna livia lara iris ines frida flavia fiamma emilia diletta delia celeste
clara clarissa cloe chloe arya asia azzurra aisha amelia anita bianca dalia elodie gloria lia mya nausicaa penelope
alessandro andrea antonio carlo cristian daniele davide edoardo emanuele enrico fabio federico filippo francesco gabriele
giacomo gianluca giorgio giovanni giuseppe lorenzo luca luigi manuel marco mario matteo mattia michele nicola nicolò niccolò
paolo pietro riccardo roberto samuele simone stefano tommaso valerio vincenzo alberto alessio angelo christian claudio
diego elia enea ettore gioele leonardo massimo maurizio mirko omar raffaele sergio thomas umberto walter achille
alex brando damiano denis dylan emil ivan jacopo kevin leo liam noah ryan sebastian`.split(/\s+/);
export const NOMI_PROPRI = new Set(NOMI);

const PARTICELLE = new Set(['de', 'di', 'da', 'del', 'della', 'dei', 'degli', 'dal', 'dalla', 'dalle', 'lo', 'la', 'le', 'li', 'van', 'von', 'mc', 'mac', "d'", 'dell\'', 'san', 'santa', 'st']);

// «Cognome Nome» o «Nome Cognome» → { nome, cognome, dubbio } (dubbio: 3+ parole da controllare)
export function separaNome(testo, ordine = 'nome_cognome') {
  const p = String(testo || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (p.length <= 1) return { nome: p[0] || '', cognome: '', dubbio: p.length === 1 };
  if (ordine === 'cognome_nome') {
    let k = 1;
    while (k < p.length - 1 && PARTICELLE.has(p[k - 1].toLowerCase())) k++;   // «De Luca Anna», «Della Valle Maria»
    return { cognome: p.slice(0, k).join(' '), nome: p.slice(k).join(' '), dubbio: p.length - k > 1 };
  }
  let k = p.length - 1;
  while (k > 1 && PARTICELLE.has(p[k - 1].toLowerCase())) k--;                // «Anna De Luca»
  return { nome: p.slice(0, k).join(' '), cognome: p.slice(k).join(' '), dubbio: k > 1 };
}

// indovina l'ordine guardando se i nomi di battesimo stanno più spesso all'inizio o alla fine
export function indovinaOrdine(nominativi) {
  let inizio = 0, fine = 0;
  for (const t of nominativi) {
    const p = String(t || '').trim().toLowerCase().split(/\s+/);
    if (p.length < 2) continue;
    if (NOMI_PROPRI.has(p[0])) inizio++;
    if (NOMI_PROPRI.has(p[p.length - 1])) fine++;
  }
  return fine > inizio ? 'cognome_nome' : 'nome_cognome';
}

// «AEREA KIDS 2 MAR 16:45-VEN 16:30» → «AEREA KIDS 2» (toglie giorni e orari)
export function accorciaGruppo(g) {
  const t = String(g || '').trim();
  const m = t.search(/\s(LUN|MAR|MER|GIO|VEN|SAB|DOM)(\b|\s|\d)|\s\d{1,2}[:.]\d{2}/i);
  const c = (m > 0 ? t.slice(0, m) : t).replace(/[\s\-–·,]+$/, '').trim();
  return c || t;
}
