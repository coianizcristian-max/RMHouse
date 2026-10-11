// Compilazione del portale ASI ("Inserimento nuovo tesserato") con i dati di RMHouse, senza dare la password a nessuno:
// 1. in RMHouse "Copia per ASI" mette negli appunti del computer una riga "RMHOUSE-ASI:{…}" con i dati della persona;
// 2. sul portale (dove si è entrati come sempre, con la password salvata nel browser) il preferito "Compila da RMHouse"
//    legge gli appunti e riempie: persona (cercata per codice fiscale), tipo tessera, qualifica, disciplina, certificato.
// INSERISCI lo preme la segreteria dopo aver controllato. Campi del portale letti dalla pagina salvata l'11/10/2026:
// form#form_tess, #surname0 + lookup_tess() (suggerimenti in #autoSuggestionsList0 dopo 2 secondi), #tessid0,
// select #tipotessera / #qualifica / #disciplina (select2), #certificato + #data_cert (gg/mm/aaaa), #insertTesserati.
import { valoriPersona } from '@/lib/tessereEnte';

export const PREFISSO_ASI = 'RMHOUSE-ASI:';

const data = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// r = una riga di tesseramento_ente (query 157/159)
export function testoPerAsi(r, ente) {
  const v = valoriPersona(r, ente);
  const d = { cf: String(r.codice_fiscale || '').toUpperCase(), nome: `${r.cognome || ''} ${r.nome || ''}`.trim(),
    tipo: v.tipo, qualifica: v.qualifica, disciplina: v.disciplina, certificato: data(r.certificato) };
  return `${PREFISSO_ASI}${JSON.stringify(d)}`;
}

// il codice del preferito (bookmarklet): niente commenti // dentro, diventa una riga sola
const CODICE = `(async () => {
  const P = 'RMHOUSE-ASI:';
  const avviso = (t, ok) => {
    let b = document.getElementById('rmh-avviso');
    if (!b) { b = document.createElement('div'); b.id = 'rmh-avviso'; document.body.appendChild(b); b.onclick = () => b.remove(); }
    b.style.cssText = 'position:fixed;z-index:99999;top:12px;right:12px;max-width:440px;padding:12px 16px;border-radius:10px;font:15px/1.45 Arial,sans-serif;white-space:pre-line;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.25);color:#111;background:' + (ok ? '#e8f6ec;border:2px solid #1a7f37' : '#fff4e0;border:2px solid #c77700');
    b.textContent = t;
  };
  const f = document.getElementById('form_tess');
  if (!f) { alert('RMHouse: apri prima sul portale ASI la pagina Societa -> Tesserati, dove c\\'e "Inserimento nuovo tesserato".'); return; }
  let t = '';
  try { t = await navigator.clipboard.readText(); } catch (e) {}
  if (!t || t.indexOf(P) !== 0) t = prompt('RMHouse: incolla qui (Ctrl+V) i dati copiati con "Copia per ASI"') || '';
  t = t.trim();
  if (t.indexOf(P) !== 0) { alert('RMHouse: non trovo i dati. In RMHouse premi prima "Copia per ASI" sulla persona.'); return; }
  let d;
  try { d = JSON.parse(t.slice(P.length)); } catch (e) { alert('RMHouse: i dati copiati non sono validi, ricopiali.'); return; }
  const $ = window.jQuery;
  const cambia = (el) => { try { if ($) $(el).trigger('change'); else el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} };
  const scegli = (id, testo) => {
    const s = document.getElementById(id);
    if (!s || !testo) return false;
    const x = String(testo).trim().toLowerCase();
    const o = Array.from(s.options).find((o) => o.text.trim().toLowerCase() === x);
    if (!o) return false;
    s.value = o.value; cambia(s); return true;
  };
  const pannello = f.closest('.ui-accordion-content');
  if (pannello && getComputedStyle(pannello).display === 'none') {
    const h = document.getElementById(pannello.getAttribute('aria-labelledby'));
    if (h) h.click();
  }
  const mancati = [];
  if (!scegli('tipotessera', d.tipo)) mancati.push('tipo tessera' + (d.tipo ? ' (' + d.tipo + ')' : ''));
  if (!scegli('qualifica', d.qualifica)) mancati.push('qualifica' + (d.qualifica ? ' (' + d.qualifica + ')' : ''));
  if (!scegli('disciplina', d.disciplina)) mancati.push('disciplina' + (d.disciplina ? ' (' + d.disciplina + ')' : ''));
  const c = document.getElementById('certificato');
  const dc = document.getElementById('data_cert');
  if (d.certificato && c) { if (!c.checked) { c.checked = true; cambia(c); } if (dc) dc.value = d.certificato; }
  const campo = document.getElementById('surname0');
  const id = document.getElementById('tessid0');
  const lista = document.getElementById('autoSuggestionsList0');
  if (!d.cf) {
    avviso('RMHouse: ' + d.nome + ' non ha il codice fiscale in RMHouse: cerca la persona a mano.' + (mancati.length ? '\\nDa scegliere a mano: ' + mancati.join(', ') : ''), false);
    return;
  }
  campo.value = d.cf; if (id) id.value = ''; if (lista) lista.innerHTML = '';
  if (typeof window.lookup_tess === 'function') window.lookup_tess(d.cf, 'surname0', 0, '');
  avviso('RMHouse: cerco ' + d.nome + ' (' + d.cf + ') nell\\'anagrafica ASI...', true);
  let voci = [];
  for (let i = 0; i < 40 && !voci.length; i++) {
    await new Promise((ok) => setTimeout(ok, 300));
    voci = lista ? Array.from(lista.querySelectorAll('li')) : [];
    if (!voci.length && lista) voci = Array.from(lista.querySelectorAll('[onclick]'));
  }
  let trovato = false;
  if (voci.length === 1) {
    voci[0].click();
    await new Promise((ok) => setTimeout(ok, 400));
    trovato = !!(id && id.value);
  }
  const righe = [];
  if (trovato) righe.push('Trovata/o: ' + campo.value);
  else if (voci.length > 1) righe.push('Il portale ha trovato ' + voci.length + ' persone: tocca quella giusta nell\\'elenco.');
  else righe.push(d.nome + ' non e\\' ancora nell\\'anagrafica ASI: creala/o prima (Persone) oppure caricala/o con il "File per ASI" di RMHouse.');
  if (mancati.length) righe.push('Da scegliere a mano: ' + mancati.join(', '));
  if (d.certificato) righe.push('Certificato fino al ' + d.certificato);
  righe.push('Controlla e premi INSERISCI.');
  avviso(righe.join('\\n'), trovato && !mancati.length);
  const bt = document.getElementById('insertTesserati');
  if (bt) bt.scrollIntoView({ block: 'center' });
})();`;

// l'indirizzo del preferito: "javascript:" + il codice (gli spazi a inizio riga non servono)
export function codicePreferito() {
  const una = CODICE.split('\n').map((x) => x.trim()).join(' ');
  return `javascript:${encodeURIComponent(una)}`;
}
export const codiceSorgente = CODICE;
