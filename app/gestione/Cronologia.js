'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Cronologia delle modifiche della pagina aperta: chi, quando, cosa è cambiato (prima → dopo).
// La vedono solo gli amministratori (anche il database la fa leggere solo a loro).

const UUID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const PAGINE = [
  [new RegExp(`^/gestione/persone/${UUID}`), (m) => ({ persona: m[1], titolo: 'di questa persona' })],
  [new RegExp(`^/gestione/appello/${UUID}`), (m) => ({ lezione: m[1], titolo: 'di questa lezione' })],
  ['/gestione/abbonamenti', { tabelle: ['tipi_abbonamento', 'voci_listino', 'gruppi_listino', 'recuperi_ammessi', 'palestre'], titolo: 'di abbonamenti e recuperi' }],
  ['/gestione/corsi', { tabelle: ['corsi', 'orari'], titolo: 'dei corsi' }],
  ['/gestione/palinsesto', { tabelle: ['orari', 'lezioni', 'corsi'], titolo: 'del palinsesto' }],
  ['/gestione/calendario', { tabelle: ['lezioni', 'chiusure'], titolo: 'del calendario' }],
  ['/gestione/staff', { tabelle: ['staff'], titolo: 'dello staff' }],
  ['/gestione/sale', { tabelle: ['sale'], titolo: 'delle sale' }],
  ['/gestione/sede', { tabelle: ['sale', 'discipline', 'livelli', 'fasce_eta', 'chiusure'], titolo: 'della sede' }],
  ['/gestione/incassi', { tabelle: ['pagamenti'], titolo: 'degli incassi' }],
  ['/gestione/ricevute', { tabelle: ['ricevute'], titolo: 'di ricevute e note di credito' }],
  ['/gestione/rate', { tabelle: ['rate'], titolo: 'delle rate' }],
  ['/gestione/certificati', { tabelle: ['certificati'], titolo: 'dei certificati' }],
  ['/gestione/commercialista', { tabelle: ['aliquote_iva', 'numerazioni', 'ricevute'], titolo: 'di IVA e documenti' }],
  ['/gestione/rinnovi', { tabelle: ['iscrizioni'], titolo: 'delle iscrizioni' }],
  ['/gestione/scadenze', { tabelle: ['iscrizioni'], titolo: 'delle iscrizioni' }],
  ['/gestione/impostazioni/ruoli', { tabelle: ['ruoli', 'staff'], titolo: 'di ruoli e accessi' }],
  ['/gestione/impostazioni', { tabelle: ['palestre'], titolo: 'delle impostazioni' }],
];

function filtroPer(path) {
  for (const [chiave, f] of PAGINE) {
    if (chiave instanceof RegExp) { const m = path.match(chiave); if (m) return f(m); }
    else if (path === chiave || path.startsWith(chiave + '/')) return f;
  }
  return { titolo: 'più recenti' };   // nessuna pagina precisa: tutto
}

const TABELLE = {
  pagamenti: 'Incasso', ricevute: 'Documento', iscrizioni: 'Iscrizione', rate: 'Rata', allievi: 'Persona', account: 'Chi paga',
  staff: 'Staff', certificati: 'Certificato', tipi_abbonamento: 'Abbonamento', corsi: 'Corso', orari: 'Orario', lezioni: 'Lezione',
  sospensioni: 'Sospensione', voci_listino: 'Voce a listino', gruppi_listino: 'Gruppo di listino', recuperi_ammessi: 'Regola di recupero',
  aliquote_iva: 'Aliquota IVA', numerazioni: 'Numerazione', sale: 'Sala', discipline: 'Disciplina', livelli: 'Livello',
  fasce_eta: "Fascia d'età", chiusure: 'Chiusura', ruoli: 'Ruolo', assenze_avvisate: 'Disdetta', presenze: 'Presenza',
  prenotazioni: 'Prenotazione', quote_iscrizione: 'Quota annuale', crediti_recupero: 'Recupero', palestre: 'Impostazioni',
};
const CAMPI = {
  nome: 'nome', cognome: 'cognome', email: 'email', telefono: 'telefono', note: 'note', stato: 'stato', codice: 'codice',
  importo_cent: 'importo', prezzo_cent: 'prezzo', prezzo_web_cent: 'prezzo online', sconto_cent: 'sconto', metodo: 'metodo',
  data_inizio: 'inizio', data_fine: 'fine', scadenza: 'scadenza', dal: 'dal', al: 'al', data: 'data', inizio: 'inizio', fine: 'fine',
  corso_id: 'corso', tipo_abbonamento_id: 'abbonamento', sala_id: 'sala', insegnante_id: 'insegnante', gruppo_id: 'gruppo',
  aliquota_id: 'aliquota IVA', disciplina_id: 'disciplina', ruolo: 'ruolo', ruolo_id: 'ruolo su misura', attivo: 'attivo',
  archiviato: 'archiviato', famiglia: 'famiglia', modalita: 'tipo', durata_mesi: 'durata (mesi)', durata_giorni: 'durata (giorni)',
  scadenza_fine_mese: 'mese solare', lezioni_settimanali: 'lezioni a settimana', num_ingressi: 'ingressi', recuperi_max: 'recuperi massimi',
  giorni_validita_recupero: 'validità recupero', acquistabile_online: 'online', rinnovo_automatico: 'rinnovo automatico',
  presente: 'presente', annullata: 'annullata', ingressi_residui: 'ingressi rimasti', certificato_scadenza: 'certificato',
  ora_inizio: 'ora', durata_min: 'durata (min)', giorno_settimana: 'giorno', capienza: 'posti', capienza_override: 'posti',
  ore_disdetta: 'ore per disdire', recuperi_max_mese: 'recuperi al mese', recupero_da: 'chi riceve il recupero',
  scadenza_recupero: 'validità del recupero', recupero_solo_disdetta: 'recupero solo a chi disdice', percentuale: 'percentuale',
  natura: 'natura IVA', predefinita: 'predefinita', usato_in: 'usato', descrizione: 'descrizione', pagato_at: 'pagato il',
  codice_fiscale: 'codice fiscale', data_nascita: 'data di nascita', motivo: 'motivo', tipo: 'tipo', recupero_per_tutti: 'aperto a tutti',
};
// campi che puntano ad altre tabelle: si mostra il nome, non il codice
const RIFERIMENTI = {
  corso_id: 'corsi', tipo_abbonamento_id: 'tipi_abbonamento', sala_id: 'sale', insegnante_id: 'staff',
  gruppo_id: 'gruppi_listino', aliquota_id: 'aliquote_iva', disciplina_id: 'discipline', ruolo_id: 'ruoli',
};
const GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const PER_VOLTA = 40;

function quando(t) {
  const d = new Date(t);
  return `${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' })} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}`;
}

function mostra(k, v, nomi) {
  if (v == null || v === '') return '—';
  if (RIFERIMENTI[k]) return nomi[v] || 'un altro';
  if (k.endsWith('_cent') && typeof v === 'number') return `${(v / 100).toFixed(2).replace('.', ',')} €`;
  if (typeof v === 'boolean') return v ? 'sì' : 'no';
  if (k === 'giorno_settimana' && typeof v === 'number') return GIORNI[v] || v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return quando(v);
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  if (/^[0-9a-f-]{36}$/.test(t)) return 'collegato';
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

export default function Cronologia() {
  const path = usePathname();
  const filtro = useMemo(() => filtroPer(path), [path]);
  const [aperta, setAperta] = useState(false);
  const [righe, setRighe] = useState([]);
  const [nomi, setNomi] = useState({});
  const [altre, setAltre] = useState(false);
  const [carico, setCarico] = useState(false);
  const [errore, setErrore] = useState('');
  const [chi, setChi] = useState('');

  useEffect(() => { setAperta(false); setRighe([]); }, [path]);
  useEffect(() => {
    if (!aperta) return;
    const esc = (e) => e.key === 'Escape' && setAperta(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aperta]);

  async function carica(da = 0) {
    setCarico(true); setErrore('');
    const db = supabaseBrowser();
    let q = db.from('registro_azioni').select('*').order('quando', { ascending: false }).range(da, da + PER_VOLTA - 1);
    if (filtro.persona) q = q.eq('persona_id', filtro.persona);
    if (filtro.lezione) q = q.eq('lezione_id', filtro.lezione);
    if (filtro.tabelle) q = q.in('tabella', filtro.tabelle);
    const { data, error } = await q;
    setCarico(false);
    if (error) { setErrore('Cronologia non disponibile.'); return; }
    const tutte = da === 0 ? data : [...righe, ...data];
    setRighe(tutte); setAltre(data.length === PER_VOLTA);

    // i nomi dei collegamenti (corso, abbonamento, sala…) nelle modifiche
    const daCercare = {};
    data.forEach((r) => Object.entries(r.modifiche || {}).forEach(([k, coppia]) => {
      if (RIFERIMENTI[k]) (coppia || []).forEach((v) => { if (v && !nomi[v]) (daCercare[RIFERIMENTI[k]] ||= new Set()).add(v); });
    }));
    const trovati = {};
    await Promise.all(Object.entries(daCercare).map(async ([tab, ids]) => {
      const { data: x } = await db.from(tab).select(tab === 'staff' ? 'id, nome, cognome' : 'id, nome').in('id', [...ids]);
      (x || []).forEach((r) => { trovati[r.id] = [r.nome, r.cognome].filter(Boolean).join(' '); });
    }));
    if (Object.keys(trovati).length) setNomi((n) => ({ ...n, ...trovati }));
  }

  function apri() { setAperta(true); setChi(''); carica(0); }

  const persone = [...new Set(righe.map((r) => r.chi || 'automatico'))].sort();
  const visibili = chi ? righe.filter((r) => (r.chi || 'automatico') === chi) : righe;

  return (
    <>
      <button type="button" className="cronologia-pulsante" onClick={apri} aria-haspopup="dialog" title="Chi ha modificato cosa">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />
        </svg>
        <span>Cronologia</span>
      </button>

      {/* fuori dalla barra: la barra in alto "trattiene" i pannelli fissi sul telefono */}
      {aperta && createPortal(
        <div className="cronologia-sfondo" onClick={() => setAperta(false)}>
          <aside className="cronologia" role="dialog" aria-modal="true" aria-label="Cronologia delle modifiche" onClick={(e) => e.stopPropagation()}>
            <header className="cronologia-testa">
              <div>
                <strong>Cronologia</strong>
                <span className="piccolo muto">Modifiche {filtro.titolo}</span>
              </div>
              <button type="button" className="link-btn" onClick={() => setAperta(false)}>Chiudi</button>
            </header>

            {persone.length > 1 && (
              <select className="cronologia-chi" value={chi} onChange={(e) => setChi(e.target.value)} aria-label="Chi">
                <option value="">Chiunque</option>
                {persone.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            <div className="cronologia-corpo">
              {errore && <div className="errore">{errore}</div>}
              {!carico && !errore && visibili.length === 0 && <div className="vuoto">Nessuna modifica registrata qui.</div>}
              <ol className="cronologia-elenco">
                {visibili.map((r) => (
                  <li key={r.id} className={`cron-${r.operazione}`}>
                    <div className="cron-riga1">
                      <span className="cron-quando">{quando(r.quando)}</span>
                      <span className="cron-chi">{r.chi || 'automatico'}</span>
                    </div>
                    <div className="cron-cosa">
                      <span className={`tag ${r.operazione === 'cancellazione' ? 'tag-rosso' : r.operazione === 'inserimento' ? 'tag-ok' : 'tag-neutro'}`}>
                        {r.operazione === 'inserimento' ? 'aggiunto' : r.operazione === 'cancellazione' ? 'eliminato' : 'modificato'}
                      </span>{' '}
                      <span className="muto">{TABELLE[r.tabella] || r.tabella}</span> · {r.descrizione}
                    </div>
                    {r.modifiche && (
                      <ul className="cron-modifiche">
                        {Object.entries(r.modifiche).map(([k, coppia]) => {
                          const [prima, dopo] = Array.isArray(coppia) ? coppia : [null, coppia];
                          return (
                            <li key={k}>
                              <span className="muto">{CAMPI[k] || k.replaceAll('_', ' ')}:</span>{' '}
                              <del>{mostra(k, prima, nomi)}</del> → <strong>{mostra(k, dopo, nomi)}</strong>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
              {carico && <p className="piccolo muto">Carico…</p>}
              {altre && !carico && (
                <button type="button" className="btn btn-piccolo" onClick={() => carica(righe.length)}>Mostra le precedenti</button>
              )}
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
