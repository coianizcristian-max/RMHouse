'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { scaricaCsv } from '@/lib/stati';

const CATEGORIE = {
  persone: 'Persone',
  abbonamenti: 'Abbonamenti',
  corsi: 'Corsi e orari',
  pagamenti: 'Pagamenti',
  ricevute: 'Ricevute',
};
const VISTE = [
  ['da_sistemare', 'Da sistemare'],
  ['da_verificare', 'Da verificare'],
  ['fatte', 'Fatte'],
];
const PAGINA = 150;

const quando = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '');
const nomePersona = (a) => (a?.allievi ? `${a.allievi.cognome || ''} ${a.allievi.nome}`.trim() : '');
const normalizza = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// rifà il controllo finale dell'ultima importazione (crea iscrizioni e orari con gli abbinamenti nuovi)
async function ricontrollaImport(db, ultima, setLavoro) {
  if (!ultima) return;
  setLavoro('Aggiorno iscrizioni e orari e rifaccio il controllo…');
  const { error: e1 } = await db.rpc('importa_ap_chiudi', { p_imp: ultima.id });
  if (e1) throw e1;
  const { error: e2 } = await db.rpc('importa_ap_anomalie', { p_imp: ultima.id });
  if (e2) throw e2;
}

const GG = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const GG_LUNGHI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const hhmm = (t) => String(t || '').slice(0, 5);

// Il riquadro per abbinare gli orari di APP Palestre a un orario di RMHouse (i corsi di RMHouse non si toccano)
function AbbinaOrari({ palestraId, slot, orari, ultima, onFatto }) {
  const daFare = slot.filter((x) => !x.orario_id);
  const scelti = slot.filter((x) => x.scelto);
  const chiave = (x) => `${x.corso_norm}|${x.giorno}|${x.ora}`;
  const [scelte, setScelte] = useState(() => Object.fromEntries(daFare.map((x) => [chiave(x), x.suggerito_id || ''])));
  const [lavoro, setLavoro] = useState('');
  const [errore, setErrore] = useState('');
  // gli orari di RMHouse raggruppati per corso
  const perCorso = useMemo(() => {
    const m = new Map();
    for (const o of orari) {
      const k = o.corsi?.nome || 'Corso';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(o);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [orari]);
  const nomeOrario = (id) => {
    const o = orari.find((x) => x.id === id);
    return o ? `${o.corsi?.nome} · ${GG[o.giorno_settimana]} ${hhmm(o.ora_inizio)}${o.sale?.nome ? ` · ${o.sale.nome}` : ''}` : '';
  };

  async function abbina(x, orario) {
    setErrore('');
    const db = supabaseBrowser();
    try {
      setLavoro('Abbino…');
      const { error } = await db.rpc('abbina_orario_import', {
        p_palestra: palestraId, p_corso_norm: x.corso_norm, p_giorno: x.giorno, p_ora: x.ora, p_orario: orario,
      });
      if (error) throw error;
      await ricontrollaImport(db, ultima, setLavoro);
      onFatto(orario ? `${x.corso} ${GG[x.giorno]} ${hhmm(x.ora)} abbinato: orari aggiunti, elenco aggiornato.` : 'Abbinamento tolto.');
    } catch (e) {
      console.error(e);
      setErrore('Non riuscito: riprova.');
    }
    setLavoro('');
  }

  if (!daFare.length && !scelti.length) return null;
  return (
    <section className="scheda abbina" id="orari" aria-labelledby="orari-titolo">
      <h2 id="orari-titolo" style={{ marginTop: 0 }}>Orari da abbinare</h2>
      {daFare.length > 0 ? (
        <p className="piccolo muto">
          In APP Palestre queste persone sono prenotate a orari che in RMHouse non hanno un corso con lo stesso nome, giorno e ora.
          Scegli a quale orario di RMHouse corrispondono (dove c'è, è già proposto quello più vicino): gli orari si aggiungono alle iscrizioni.
          Corsi e orari di RMHouse non vengono modificati.
        </p>
      ) : <p className="piccolo muto">Tutti gli orari prenotati in APP Palestre sono abbinati.</p>}
      {errore && <div className="errore" role="alert">{errore}</div>}
      {daFare.length > 0 && (
        <ul className="abbina-elenco">
          {daFare.map((x) => (
            <li key={chiave(x)}>
              <div className="abbina-nome">
                <strong>{x.corso} · {GG_LUNGHI[x.giorno]} {hhmm(x.ora)}</strong>
                <span className="piccolo muto">
                  {x.persone} {x.persone === 1 ? 'persona prenotata' : 'persone prenotate'}
                  {x.suggerito_id && scelte[chiave(x)] === x.suggerito_id ? ' · proposto in base a giorno e ora: controlla' : ''}
                </span>
              </div>
              <div className="abbina-scelta">
                <select aria-label={`Orario di RMHouse per ${x.corso} ${GG_LUNGHI[x.giorno]} ${hhmm(x.ora)}`} value={scelte[chiave(x)] || ''}
                        onChange={(e) => setScelte((s) => ({ ...s, [chiave(x)]: e.target.value }))}>
                  <option value="">Scegli l'orario…</option>
                  {perCorso.map(([corso, lista]) => (
                    <optgroup key={corso} label={corso}>
                      {lista.map((o) => (
                        <option key={o.id} value={o.id}>{corso} · {GG[o.giorno_settimana]} {hhmm(o.ora_inizio)}{o.sale?.nome ? ` · ${o.sale.nome}` : ''}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button className="btn btn-primario" disabled={!scelte[chiave(x)] || !!lavoro} onClick={() => abbina(x, scelte[chiave(x)])}>
                  Abbina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lavoro && <p className="piccolo" role="status">{lavoro}</p>}
      {scelti.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="piccolo">Orari già abbinati ({scelti.length})</summary>
          <ul className="abbina-fatti">
            {scelti.map((x) => (
              <li key={chiave(x)} className="piccolo">
                <span>{x.corso} {GG[x.giorno]} {hhmm(x.ora)} → <strong>{nomeOrario(x.orario_id) || x.corso_rmhouse}</strong></span>
                <button className="link-btn piccolo" disabled={!!lavoro} onClick={() => abbina(x, null)}>togli</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// Il riquadro per abbinare gli abbonamenti di APP Palestre che in RMHouse hanno un altro nome
function Abbina({ palestraId, daAbbinare, tipi, alias, ultima, onFatto }) {
  const [scelte, setScelte] = useState({});
  const [lavoro, setLavoro] = useState('');
  const [errore, setErrore] = useState('');
  const scelti = alias.filter((a) => a.origine === 'scelto');


  async function abbina(nome, tipo) {
    setErrore('');
    const db = supabaseBrowser();
    try {
      setLavoro('Abbino…');
      const { error } = await db.rpc('abbina_abbonamento_import', { p_palestra: palestraId, p_nome: nome, p_tipo: tipo });
      if (error) throw error;
      await ricontrollaImport(db, ultima, setLavoro);
      onFatto(tipo ? `"${nome}" abbinato: iscrizioni create, elenco aggiornato.` : `Abbinamento di "${nome}" tolto.`);
    } catch (e) {
      console.error(e);
      setErrore('Non riuscito: riprova.');
    }
    setLavoro('');
  }

  if (!daAbbinare.length && !scelti.length) return null;
  return (
    <section className="scheda abbina" id="abbina" aria-labelledby="abbina-titolo">
      <h2 id="abbina-titolo" style={{ marginTop: 0 }}>Abbonamenti da abbinare</h2>
      {daAbbinare.length > 0 ? (
        <p className="piccolo muto">
          Questi abbonamenti di APP Palestre sono in corso ma in RMHouse non c'è un abbonamento con lo stesso nome, quindi le iscrizioni
          non sono state create. Scegli a quale abbonamento di RMHouse corrispondono: le iscrizioni si creano subito.
          Gli abbonamenti di RMHouse non vengono modificati.
        </p>
      ) : <p className="piccolo muto">Tutti gli abbonamenti in corso sono abbinati.</p>}
      {errore && <div className="errore" role="alert">{errore}</div>}
      {daAbbinare.length > 0 && (
        <ul className="abbina-elenco">
          {daAbbinare.map((r) => (
            <li key={r.nome}>
              <div className="abbina-nome">
                <strong>{r.nome}</strong>
                <span className="piccolo muto">
                  {r.persone} {r.persone === 1 ? 'persona' : 'persone'} in corso{r.prima ? ` · prima era: ${r.prima}` : ''}
                </span>
              </div>
              <div className="abbina-scelta">
                <select aria-label={`Abbonamento di RMHouse per ${r.nome}`} value={scelte[r.nome] || ''}
                        onChange={(e) => setScelte((s) => ({ ...s, [r.nome]: e.target.value }))}>
                  <option value="">Scegli l'abbonamento…</option>
                  {tipi.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                <button className="btn btn-primario" disabled={!scelte[r.nome] || !!lavoro} onClick={() => abbina(r.nome, scelte[r.nome])}>
                  Abbina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lavoro && <p className="piccolo" role="status">{lavoro}</p>}
      {scelti.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="piccolo">Abbinamenti già scelti ({scelti.length})</summary>
          <ul className="abbina-fatti">
            {scelti.map((a) => (
              <li key={a.nome} className="piccolo">
                <span>{a.nome} → <strong>{a.tipi_abbonamento?.nome}</strong></span>
                <button className="link-btn piccolo" disabled={!!lavoro} onClick={() => abbina(a.nome, null)}>togli</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default function DaSistemare({ palestraId, anomalie, ultima, daAbbinare, tipi, alias, slot = [], orari = [] }) {
  const router = useRouter();
  const [vista, setVista] = useState('da_sistemare');
  const [categoria, setCategoria] = useState('');
  const [cerca, setCerca] = useState('');
  const [scelte, setScelte] = useState(new Set());
  const [nota, setNota] = useState('');
  const [quante, setQuante] = useState(PAGINA);
  const [avviso, setAvviso] = useState('');
  const mostra = (t) => { setAvviso(t); setTimeout(() => setAvviso(''), 4000); };

  const inVista = (a, v) => (v === 'fatte' ? a.risolta : !a.risolta && a.gravita === v);
  const conteggi = Object.fromEntries(VISTE.map(([v]) => [v, anomalie.filter((a) => inVista(a, v)).length]));

  const righe = useMemo(() => {
    const q = normalizza(cerca).split(/\s+/).filter(Boolean);
    return anomalie.filter((a) => inVista(a, vista) && (!categoria || a.categoria === categoria)
      && q.every((p) => normalizza(`${a.titolo} ${a.dettaglio} ${nomePersona(a)} ${a.allievi?.nome || ''} ${a.allievi?.cognome || ''}`).includes(p)));
  }, [anomalie, vista, categoria, cerca]);
  const perCategoria = Object.keys(CATEGORIE).map((c) => [c, righe.slice(0, quante).filter((a) => a.categoria === c)]).filter(([, l]) => l.length);
  const contaCat = (c) => anomalie.filter((a) => inVista(a, vista) && a.categoria === c).length;

  async function segna(ids, risolta) {
    const db = supabaseBrowser();
    const { error } = await db.rpc('segna_anomalie', { p_ids: ids, p_risolta: risolta, p_nota: risolta ? nota || null : null });
    if (error) { mostra('Non riuscito: riprova.'); return; }
    setScelte(new Set()); setNota('');
    mostra(risolta ? (ids.length === 1 ? 'Segnata come fatta' : `${ids.length} segnate come fatte`) : 'Riaperta');
    router.refresh();
  }

  function esporta() {
    const elenco = scelte.size ? righe.filter((a) => scelte.has(a.id)) : righe;
    scaricaCsv('da-sistemare.csv', ['Tipo', 'Gravità', 'Persona', 'Cosa', 'Cosa fare', 'Stato', 'Nota'],
      elenco.map((a) => [CATEGORIE[a.categoria], a.gravita === 'da_sistemare' ? 'Da sistemare' : 'Da verificare', nomePersona(a),
        a.titolo, a.dettaglio, a.risolta ? `fatta ${quando(a.risolta_at)}` : 'aperta', a.nota || '']));
  }

  const cambia = (id) => { const s = new Set(scelte); s.has(id) ? s.delete(id) : s.add(id); setScelte(s); };
  const tutteScelte = righe.length > 0 && righe.slice(0, quante).every((a) => scelte.has(a.id));
  const r = ultima?.riepilogo || {};

  return (
    <>
      {ultima ? (
        <p className="piccolo muto" style={{ marginTop: -6 }}>
          Ultimo import il {quando(ultima.iniziata_at)}
          {ultima.ricalcolata_at && ` · controllo rifatto il ${quando(ultima.ricalcolata_at)}`}
          {r.iscrizioni_nuove != null && ` · ${r.iscrizioni_nuove + (r.iscrizioni_aggiornate || 0)} iscrizioni in corso, ${r.con_orari || 0} con orari`}
          {' · '}<Link prefetch={false} href="/gestione/importa">rifai l'import</Link>
        </p>
      ) : (
        <div className="vuoto">Nessun import fatto finora. <Link prefetch={false} href="/gestione/importa">Importa da APP Palestre</Link></div>
      )}

      <Abbina palestraId={palestraId} daAbbinare={daAbbinare} tipi={tipi} alias={alias} ultima={ultima}
              onFatto={(t) => { mostra(t); router.refresh(); }} />
      <AbbinaOrari key={slot.map((x) => `${x.corso_norm}${x.giorno}${x.ora}${x.orario_id}`).join()} palestraId={palestraId}
                   slot={slot} orari={orari} ultima={ultima} onFatto={(t) => { mostra(t); router.refresh(); }} />

      {anomalie.length > 0 && (
        <>
          <div className="segmenti" role="group" aria-label="Quali vedere">
            {VISTE.map(([v, l]) => (
              <button key={v} aria-pressed={vista === v} onClick={() => { setVista(v); setScelte(new Set()); setQuante(PAGINA); }}>
                {l} <span>{conteggi[v]}</span>
              </button>
            ))}
          </div>
          <p className="piccolo muto" style={{ marginTop: -4 }}>
            {vista === 'da_sistemare' && 'Cose sbagliate o che mancano su persone iscritte ora: vanno corrette.'}
            {vista === 'da_verificare' && 'Cose strane ma che possono essere giuste (o su persone non iscritte ora): controlla e segna come fatte.'}
            {vista === 'fatte' && 'Quelle segnate come fatte e quelle che all\'ultimo controllo non sono più uscite.'}
          </p>

          <div className="filtri-persone">
            <input type="search" placeholder="Cerca per nome o parola (es. Rossi, codice fiscale, Heels)" value={cerca}
                   onChange={(e) => { setCerca(e.target.value); setQuante(PAGINA); }} aria-label="Cerca" />
            <select value={categoria} className={categoria ? 'scelto' : ''} aria-label="Tipo"
                    onChange={(e) => { setCategoria(e.target.value); setQuante(PAGINA); }}>
              <option value="">Tutti i tipi</option>
              {Object.entries(CATEGORIE).map(([k, l]) => <option key={k} value={k}>{l} ({contaCat(k)})</option>)}
            </select>
          </div>

          <div className="elenco-testa">
            {righe.length > 0 && (
              <label className="spunta" style={{ margin: 0 }}>
                <input type="checkbox" checked={tutteScelte}
                       onChange={() => setScelte(tutteScelte ? new Set() : new Set(righe.slice(0, quante).map((a) => a.id)))} />
                <span>{tutteScelte ? 'Deseleziona tutto' : 'Seleziona tutto'}</span>
              </label>
            )}
            <span className="piccolo muto">{righe.length} {righe.length === 1 ? 'voce' : 'voci'}</span>
            {righe.length > 0 && <button className="link-btn piccolo" onClick={esporta}>Scarica l'elenco (CSV)</button>}
          </div>

          {righe.length === 0 && (
            <div className="vuoto">{vista === 'fatte' ? 'Ancora niente di fatto.' : 'Niente qui. Ottimo.'}</div>
          )}

          {perCategoria.map(([c, lista]) => (
            <section key={c} className="ds-gruppo">
              <h2>{CATEGORIE[c]} <span className="muto">{righe.filter((a) => a.categoria === c).length}</span></h2>
              <ul className="ds-elenco">
                {lista.map((a) => (
                  <li key={a.id} className={`${a.gravita === 'da_sistemare' && !a.risolta ? 'urgente' : ''}${scelte.has(a.id) ? ' selezionata' : ''}`}>
                    <input type="checkbox" aria-label={`Seleziona: ${a.titolo}`} checked={scelte.has(a.id)} onChange={() => cambia(a.id)} />
                    <div className="ds-corpo">
                      <div className="ds-titolo">
                        {a.allievo_id && a.allievi && (
                          <Link prefetch={false} className="persona-nome" href={`/gestione/persone/${a.allievo_id}`}>{nomePersona(a)}</Link>
                        )}
                        <strong>{a.titolo}</strong>
                      </div>
                      {a.dettaglio && <p className="piccolo">{a.dettaglio}</p>}
                      {a.risolta && (
                        <p className="piccolo muto">
                          {a.chiusa_sola ? 'Non è più uscita al controllo del ' : 'Fatta il '}{quando(a.risolta_at)}
                          {a.nota && !a.chiusa_sola && `: ${a.nota}`}
                        </p>
                      )}
                    </div>
                    <div className="ds-azioni">
                      {a.link && a.link !== `/gestione/persone/${a.allievo_id}` && (
                        <Link prefetch={false} className="link-btn piccolo" href={a.link}>Apri</Link>
                      )}
                      {a.link && a.link === `/gestione/persone/${a.allievo_id}` && (
                        <Link prefetch={false} className="link-btn piccolo" href={a.link}>Apri la scheda</Link>
                      )}
                      <button className="link-btn piccolo" onClick={() => segna([a.id], !a.risolta)}>{a.risolta ? 'Riapri' : 'Fatto'}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {righe.length > quante && (
            <div className="azioni" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setQuante((q) => q + PAGINA)}>Mostra altre ({righe.length - quante})</button>
            </div>
          )}
        </>
      )}

      {scelte.size > 0 && (
        <div className="barra-selezione" role="region" aria-label="Azioni sulle voci selezionate">
          <strong>{scelte.size} selezionate</strong>
          {vista !== 'fatte' && (
            <input className="nota-breve" placeholder="Nota (facoltativa): es. verificato con la famiglia" value={nota}
                   onChange={(e) => setNota(e.target.value)} />
          )}
          <div className="azioni">
            {vista === 'fatte'
              ? <button className="btn btn-primario" onClick={() => segna([...scelte], false)}>Riapri</button>
              : <button className="btn btn-primario" onClick={() => segna([...scelte], true)}>Segna fatte</button>}
            <button className="btn" onClick={esporta}>Scarica</button>
            <button className="link-btn" onClick={() => setScelte(new Set())}>Annulla</button>
          </div>
        </div>
      )}
      {avviso && <div className="avviso-volante" role="status">{avviso}</div>}
    </>
  );
}
