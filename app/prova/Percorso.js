'use client';
import { useEffect, useMemo, useState } from 'react';
import { euro, ora, giornoLungo, etaAl, prezzo } from '@/lib/formato';

const PASSI = ['chi', 'cosa', 'quando', 'dati', 'fatto'];

export default function Percorso() {
  const [catalogo, setCatalogo] = useState(null);
  const [errore, setErrore] = useState('');
  const [passo, setPasso] = useState('chi');

  // scelte
  const [adulto, setAdulto] = useState(null);
  const [nascitaBimbo, setNascitaBimbo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [livelloId, setLivelloId] = useState('');
  const [disciplinaFiltro, setDisciplinaFiltro] = useState('');
  const [slot, setSlot] = useState(null);
  const [slotScelto, setSlotScelto] = useState(null);
  const [nessunOrario, setNessunOrario] = useState(false);
  const [dati, setDati] = useState({ nome: '', cognome: '', email: '', telefono: '', data_nascita: '', p_nome: '', p_cognome: '' });
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState(null);
  const [utm, setUtm] = useState(null);

  useEffect(() => {
    fetch('/api/prova/catalogo').then((r) => r.json()).then((d) => {
      if (d.errore) setErrore(d.errore); else setCatalogo(d);
    }).catch(() => setErrore('Connessione assente. Riprova.'));
    const q = new URLSearchParams(window.location.search);
    const u = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((k) => q.get(k) && (u[k] = q.get(k)));
    if (Object.keys(u).length) setUtm(u);
  }, []);

  const disciplinaDi = (id) => catalogo?.discipline.find((d) => d.id === id);
  const corsoDi = (id) => catalogo?.corsi.find((c) => c.id === id);

  // --- Filtro 1: fascia d'età ---
  const etaBimbo = nascitaBimbo ? etaAl(nascitaBimbo) : null;
  const fasceOk = useMemo(() => {
    if (!catalogo || adulto === null) return [];
    if (adulto) return catalogo.fasce.filter((f) => f.adulti).map((f) => f.id);
    if (etaBimbo == null) return [];
    return catalogo.fasce
      .filter((f) => !f.adulti && etaBimbo >= f.eta_min && (f.eta_max == null || etaBimbo <= f.eta_max))
      .map((f) => f.id);
  }, [catalogo, adulto, etaBimbo]);
  const nomeFascia = catalogo?.fasce.find((f) => f.id === fasceOk[0])?.nome;

  const corsiEta = useMemo(
    () => (catalogo ? catalogo.corsi.filter((c) => fasceOk.includes(c.fascia_eta_id)) : []),
    [catalogo, fasceOk]
  );

  // --- Filtro 2: categoria (danza, acrobatica, benessere) ---
  const categorieOk = useMemo(
    () => (catalogo ? catalogo.categorie.filter((cat) => corsiEta.some((c) => disciplinaDi(c.disciplina_id)?.categoria_id === cat.id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogo, corsiEta]
  );
  const corsiCategoria = corsiEta.filter((c) => disciplinaDi(c.disciplina_id)?.categoria_id === categoriaId);

  // --- Filtro 3: livello ---
  const livelliOk = catalogo
    ? catalogo.livelli.filter((l) => corsiCategoria.some((c) => c.livello_id === l.id || c.livello_id === null))
    : [];
  const corsiFinali = corsiCategoria.filter((c) => !livelloId || c.livello_id === livelloId || c.livello_id === null);

  // --- Orari ---
  useEffect(() => {
    if (passo !== 'quando' || !corsiFinali.length) return;
    setSlot(null);
    fetch('/api/prova/slot?corsi=' + corsiFinali.map((c) => c.id).join(','))
      .then((r) => r.json())
      .then((d) => (d.errore ? setErrore(d.errore) : setSlot(d.slot)))
      .catch(() => setErrore('Connessione assente. Riprova.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo, categoriaId, livelloId]);

  // discipline presenti negli orari trovati (es. contemporanea, classica): filtro rapido
  const disciplineSlot = useMemo(() => {
    const ids = [...new Set((slot || []).map((s) => corsoDi(s.corso_id)?.disciplina_id))].filter(Boolean);
    return ids.map((id) => disciplinaDi(id)).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, catalogo]);

  const slotVisibili = (slot || []).filter(
    (s) => !disciplinaFiltro || corsoDi(s.corso_id)?.disciplina_id === disciplinaFiltro
  );

  const perGiorno = useMemo(() => {
    const g = {};
    slotVisibili.forEach((s) => {
      const k = giornoLungo(s.inizio);
      (g[k] ||= []).push(s);
    });
    return Object.entries(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, disciplinaFiltro]);

  const vai = (p) => { setErrore(''); setPasso(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const campo = (k) => ({ value: dati[k], onChange: (e) => setDati({ ...dati, [k]: e.target.value }) });

  async function prenota(e) {
    e.preventDefault();
    if (!privacy) { setErrore('Per prenotare serve il consenso al trattamento dei dati.'); return; }
    setInvio(true); setErrore('');
    const body = {
      corso_id: slotScelto?.corso_id || corsiFinali[0]?.id,
      lezione_id: nessunOrario ? null : slotScelto?.id,
      adulto,
      consenso_privacy: privacy,
      consenso_marketing: marketing,
      fonte: utm?.utm_source || 'sito',
      utm,
      titolare: { nome: dati.nome, cognome: dati.cognome, email: dati.email, telefono: dati.telefono, data_nascita: dati.data_nascita },
      partecipante: adulto ? null : { nome: dati.p_nome, cognome: dati.p_cognome || dati.cognome, data_nascita: nascitaBimbo },
    };
    try {
      const r = await fetch('/api/prova/prenota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setErrore(d.errore); return; }
      if (d.esito === 'paga_online' && d.url) { window.location.href = d.url; return; }
      setEsito(d); vai('fatto');
    } catch {
      setErrore('Connessione assente. Riprova.');
    } finally {
      setInvio(false);
    }
  }

  if (!catalogo && !errore) return <p className="muto">Carico i corsi…</p>;
  const indice = PASSI.indexOf(passo);

  return (
    <div>
      {passo !== 'fatto' && (
        <ol className="passi" aria-label={`Passo ${indice + 1} di 4`}>
          {PASSI.slice(0, 4).map((p, i) => <li key={p} className={i <= indice ? 'fatto' : ''} />)}
        </ol>
      )}
      {errore && <div className="errore" role="alert">{errore}</div>}

      {/* 1. CHI PARTECIPA */}
      {passo === 'chi' && catalogo && (
        <section className="compare">
          <h1>Chi viene a provare?</h1>
          <div className="scelte">
            <button type="button" className="scelta" aria-pressed={adulto === true} onClick={() => setAdulto(true)}>
              Un adulto<small>Dai 17 anni</small>
            </button>
            <button type="button" className="scelta" aria-pressed={adulto === false} onClick={() => setAdulto(false)}>
              Un bambino o ragazzo<small>Fino a 16 anni</small>
            </button>
          </div>
          {adulto === false && (
            <div className="campo">
              <label htmlFor="nascita">Data di nascita</label>
              <input id="nascita" type="date" value={nascitaBimbo} max={new Date().toISOString().slice(0, 10)}
                     onChange={(e) => setNascitaBimbo(e.target.value)} />
              {etaBimbo != null && etaBimbo >= 17 && <span className="piccolo muto">Ha {etaBimbo} anni: scegli "Un adulto".</span>}
              {etaBimbo != null && etaBimbo < 17 && !fasceOk.length && (
                <span className="piccolo muto">Per {etaBimbo} anni al momento non ci sono corsi con lezione di prova.</span>
              )}
            </div>
          )}
          <button className="btn btn-primario btn-pieno" disabled={!fasceOk.length || !categorieOk.length}
                  onClick={() => { setCategoriaId(''); setLivelloId(''); vai('cosa'); }}>
            Continua
          </button>
        </section>
      )}

      {/* 2. CATEGORIA E LIVELLO */}
      {passo === 'cosa' && (
        <section className="compare">
          <h1>Cosa vuoi provare?</h1>
          <p className="muto">Vedrai solo i corsi {nomeFascia ? `della fascia ${nomeFascia}` : 'adatti'}.</p>

          <div className="scelte" style={{ gridTemplateColumns: '1fr' }}>
            {categorieOk.map((cat) => (
              <button type="button" key={cat.id} className="scelta" aria-pressed={categoriaId === cat.id}
                      style={{ minHeight: 56 }} onClick={() => { setCategoriaId(cat.id); setLivelloId(''); }}>
                {cat.nome}{cat.descrizione && <small>{cat.descrizione}</small>}
              </button>
            ))}
          </div>

          {categoriaId && livelliOk.length > 0 && (
            <fieldset style={{ border: 0, padding: 0, margin: '4px 0 16px' }}>
              <legend style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Il tuo livello</legend>
              <div className="scelte" style={{ gridTemplateColumns: '1fr' }}>
                {livelliOk.map((l) => (
                  <button type="button" key={l.id} className="scelta" aria-pressed={livelloId === l.id}
                          style={{ minHeight: 56 }} onClick={() => setLivelloId(l.id)}>
                    {l.nome}{l.descrizione && <small>{l.descrizione}</small>}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <button className="btn btn-primario btn-pieno"
                  disabled={!categoriaId || (livelliOk.length > 0 && !livelloId) || !corsiFinali.length}
                  onClick={() => { setSlotScelto(null); setNessunOrario(false); setDisciplinaFiltro(''); vai('quando'); }}>
            Vedi gli orari
          </button>
          <p style={{ marginTop: 14 }}><button className="link-btn" onClick={() => vai('chi')}>Indietro</button></p>
        </section>
      )}

      {/* 3. GIORNO E ORARIO */}
      {passo === 'quando' && (
        <section className="compare">
          <h1>Scegli giorno e orario</h1>
          {disciplineSlot.length > 1 && (
            <div className="filtri">
              <a href="#" onClick={(e) => { e.preventDefault(); setDisciplinaFiltro(''); }}
                 aria-current={!disciplinaFiltro ? 'true' : undefined}>Tutti</a>
              {disciplineSlot.map((d) => (
                <a key={d.id} href="#" onClick={(e) => { e.preventDefault(); setDisciplinaFiltro(d.id); }}
                   aria-current={disciplinaFiltro === d.id ? 'true' : undefined}>{d.nome}</a>
              ))}
            </div>
          )}
          {slot === null && <p className="muto">Cerco gli orari disponibili…</p>}
          {slot && slotVisibili.length === 0 && (
            <div className="vuoto">Nessuna lezione di prova libera nelle prossime settimane per questa scelta.</div>
          )}
          {perGiorno.map(([giorno, lista]) => (
            <div key={giorno}>
              <h3 className="giorno-titolo">{giorno}</h3>
              {lista.map((s) => {
                const c = corsoDi(s.corso_id);
                return (
                  <button type="button" key={s.id} className="slot" aria-pressed={slotScelto?.id === s.id}
                          onClick={() => { setSlotScelto(s); setNessunOrario(false); }}>
                    <span className="slot-ora">{ora(s.inizio)}</span>
                    <span className="slot-info"><strong>{s.corso_nome}</strong>{[s.sala_nome, s.insegnante_nome].filter(Boolean).join(', ')}</span>
                    <span className={'tag ' + (c?.prezzo_prova_cent ? 'tag-tenue' : 'tag-ok')}>{prezzo(c?.prezzo_prova_cent ?? 0)}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <p style={{ margin: '18px 0' }}>
            <button className="link-btn" onClick={() => { setSlotScelto(null); setNessunOrario(true); vai('dati'); }}>
              Nessun orario va bene? Lasciaci i contatti e ti richiamiamo
            </button>
          </p>
          <button className="btn btn-primario btn-pieno" disabled={!slotScelto} onClick={() => vai('dati')}>Continua</button>
          <p style={{ marginTop: 14 }}><button className="link-btn" onClick={() => vai('cosa')}>Indietro</button></p>
        </section>
      )}

      {/* 4. DATI */}
      {passo === 'dati' && (
        <form className="compare" onSubmit={prenota}>
          <h1>{nessunOrario ? 'Ti ricontattiamo noi' : 'Ultimo passo'}</h1>
          {slotScelto && (
            <p className="muto">
              {slotScelto.corso_nome}, {giornoLungo(slotScelto.inizio)} alle {ora(slotScelto.inizio)}.{' '}
              Prova: {prezzo(corsoDi(slotScelto.corso_id)?.prezzo_prova_cent ?? 0).toLowerCase()}.
            </p>
          )}
          {!adulto && (
            <>
              <h3>Chi partecipa</h3>
              <div className="riga-2">
                <div className="campo"><label htmlFor="pn">Nome</label><input id="pn" required autoComplete="off" {...campo('p_nome')} /></div>
                <div className="campo"><label htmlFor="pc">Cognome</label><input id="pc" autoComplete="off" placeholder="Se diverso dal tuo" {...campo('p_cognome')} /></div>
              </div>
              <h3>I tuoi dati (genitore)</h3>
            </>
          )}
          <div className="riga-2">
            <div className="campo"><label htmlFor="n">Nome</label><input id="n" required autoComplete="given-name" {...campo('nome')} /></div>
            <div className="campo"><label htmlFor="c">Cognome</label><input id="c" required autoComplete="family-name" {...campo('cognome')} /></div>
          </div>
          {adulto && (
            <div className="campo"><label htmlFor="dn">Data di nascita</label><input id="dn" type="date" required {...campo('data_nascita')} /></div>
          )}
          <div className="campo"><label htmlFor="e">Email</label><input id="e" type="email" required autoComplete="email" {...campo('email')} /></div>
          <div className="campo"><label htmlFor="t">Telefono</label><input id="t" type="tel" required autoComplete="tel" {...campo('telefono')} /></div>

          <label className="spunta">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span>Acconsento al trattamento dei dati per gestire la prenotazione{!adulto && ', anche come genitore del minore'}. <a href="/privacy" target="_blank">Informativa</a></span>
          </label>
          <label className="spunta">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            <span>Voglio ricevere novità e promozioni (facoltativo)</span>
          </label>
          <button className="btn btn-primario btn-pieno" disabled={invio}>
            {invio ? 'Invio…' : nessunOrario ? 'Invia la richiesta' : 'Prenota la prova'}
          </button>
          <p style={{ marginTop: 14 }}><button type="button" className="link-btn" onClick={() => vai('quando')}>Indietro</button></p>
        </form>
      )}

      {/* 5. CONFERMA */}
      {passo === 'fatto' && esito && (
        <section className="compare">
          {esito.esito === 'richiesta_registrata' ? (
            <>
              <h1>Richiesta ricevuta</h1>
              <p>Ti contatteremo a breve per trovare insieme l'orario giusto.</p>
            </>
          ) : (
            <>
              <h1>Prova prenotata</h1>
              <p>
                {slotScelto && <>{slotScelto.corso_nome}, <strong>{giornoLungo(slotScelto.inizio)} alle {ora(slotScelto.inizio)}</strong>. </>}
                Ti abbiamo mandato un'email con tutte le informazioni e il giorno prima ti ricorderemo l'appuntamento.
              </p>
              {esito.esito === 'da_pagare_in_sede' && (
                <p className="errore" style={{ background: 'var(--carta)', color: 'var(--testo)' }}>
                  La prova costa {euro(esito.importo_cent)}: la paghi in sede prima della lezione.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
