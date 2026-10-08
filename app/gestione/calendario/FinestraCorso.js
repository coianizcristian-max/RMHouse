'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Finestra, ModificaRiga } from '../Gestore';
import CorsoForm from '../corsi/CorsoForm';
import Orari from '../corsi/[id]/Orari';
import { campiTipoAbbonamento, famiglieDi, infoTipo } from '../abbonamenti/campiTipo';

// Dal Palinsesto, senza cambiare pagina: la finestra del corso con tre schede
//  • Il corso: gli stessi dati di "Modifica corso";
//  • Orari settimanali: gli orari del corso (giorno, ora, sala, insegnante, gruppo…);
//  • Abbonamenti: quelli con cui si frequenta il corso; uno si apre sopra, con tutti i suoi dati e i corsi compresi.
// Chiudendo si torna al Palinsesto (e alla lezione aperta) com'era; dopo ogni salvataggio il Palinsesto si aggiorna da solo.
const SCHEDE = [['corso', 'Il corso'], ['orari', 'Orari settimanali'], ['abbonamenti', 'Abbonamenti']];
const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function FinestraCorso({ corsoId, nome, palestraId, schedaIniziale = 'corso', onChiudi }) {
  const [scheda, setScheda] = useState(schedaIniziale);
  const [d, setD] = useState(null);                 // dati del corso, degli orari, degli abbonamenti
  const [errore, setErrore] = useState('');
  const [modificato, setModificato] = useState(false);
  const [abbonamento, setAbbonamento] = useState(null);   // { riga } oppure { nuovo: true }
  const [cerca, setCerca] = useState('');
  const [avviso, setAvviso] = useState('');

  const carica = useCallback(async () => {
    const db = supabaseBrowser();
    const p = palestraId;
    const r = await Promise.all([
      db.from('corsi').select('*').eq('id', corsoId).maybeSingle(),
      db.from('discipline').select('id, nome, colore').eq('palestra_id', p).order('nome'),
      db.from('fasce_eta').select('id, nome').eq('palestra_id', p).order('ordine'),
      db.from('livelli').select('id, nome').eq('palestra_id', p).order('ordine'),
      db.from('sedi').select('id, nome').eq('palestra_id', p).order('ordine'),
      db.from('palestre').select('tema, scadenza_recupero').eq('id', p).maybeSingle(),
      db.from('orari').select('*').eq('corso_id', corsoId).order('giorno_settimana').order('ora_inizio'),
      db.from('sale').select('id, nome').eq('palestra_id', p).order('ordine', { nullsFirst: false }).order('nome'),
      db.from('staff').select('id, nome, cognome, ruolo, archiviato').eq('palestra_id', p).eq('attivo', true).order('nome'),
      db.from('corsi_insegnanti').select('staff_id').eq('corso_id', corsoId),
      // quanti corsi ha ogni abbonamento: 0 = vale per tutti i corsi
      db.from('tipi_abbonamento').select('*, tipi_abbonamento_corsi(count)').eq('palestra_id', p).eq('archiviato', false).order('nome'),
      db.from('tipi_abbonamento_corsi').select('tipo_abbonamento_id').eq('corso_id', corsoId),
      db.from('gruppi_listino').select('id, nome, ordine').eq('palestra_id', p).order('ordine').order('nome'),
      db.from('aliquote_iva').select('id, nome, percentuale, natura, predefinita').eq('palestra_id', p).eq('attiva', true).order('ordine'),
      db.from('corsi').select('id, nome, discipline ( nome )').eq('palestra_id', p).eq('attivo', true).order('nome'),
    ]);
    const sbagliata = r.find((x) => x.error);
    if (sbagliata || !r[0].data) { setErrore('Non riesco a leggere il corso. Chiudi e riprova.'); return; }
    const [corso, discipline, fasce, livelli, sedi, palestra, orari, sale, staff, abilitati, tipi, coperti, gruppi, aliquote, corsi] = r.map((x) => x.data);
    setD({
      corso, discipline: discipline || [], fasce: fasce || [], livelli: livelli || [], sedi: sedi || [], palestra: palestra || {},
      orari: orari || [], sale: sale || [], staff: staff || [], abilitati: (abilitati || []).map((a) => a.staff_id),
      tipi: (tipi || []).map((t) => ({ ...t, nCorsi: t.tipi_abbonamento_corsi?.[0]?.count || 0 })),
      coperti: new Set((coperti || []).map((c) => c.tipo_abbonamento_id)),
      gruppi: gruppi || [], aliquote: aliquote || [],
      corsi: (corsi || []).map((c) => ({ id: c.id, nome: c.nome, disciplina: c.discipline?.nome || 'Altri corsi' })),
    });
  }, [corsoId, palestraId]);
  useEffect(() => { carica(); }, [carica]);

  // chiudere con modifiche al corso non salvate: si chiede prima
  const chiudi = () => {
    if (modificato && !confirm('Hai cambiato i dati del corso: chiudere senza salvare?')) return;
    onChiudi();
  };

  // un abbonamento si apre con i suoi corsi compresi (solo quelli attivi: gli altri restano come sono)
  async function apriAbbonamento(t) {
    setAvviso('');
    const { data } = await supabaseBrowser().from('tipi_abbonamento_corsi').select('corso_id').eq('tipo_abbonamento_id', t.id);
    const attivi = new Set(d.corsi.map((c) => c.id));
    const { tipi_abbonamento_corsi: _conta, nCorsi: _n, ...riga } = t;
    setAbbonamento({ riga: { ...riga, corsi_compresi: (data || []).map((x) => x.corso_id).filter((id) => attivi.has(id)) } });
  }

  const corso = d?.corso;
  const nomeGruppo = (id) => d?.gruppi.find((g) => g.id === id)?.nome;
  const perGruppoENome = (a, b) => String(nomeGruppo(a.gruppo_id) || 'zz').localeCompare(String(nomeGruppo(b.gruppo_id) || 'zz'), 'it')
    || a.nome.localeCompare(b.nome, 'it', { numeric: true });
  const parole = norm(cerca).split(/\s+/).filter(Boolean);
  const trova = (t) => parole.every((p) => norm(`${t.nome} ${t.codice || ''} ${famiglieDi(t).join(' ')} ${nomeGruppo(t.gruppo_id) || ''}`).includes(p));
  const scelti = (d?.tipi || []).filter((t) => d.coperti.has(t.id) && trova(t)).sort(perGruppoENome);
  const perTutti = (d?.tipi || []).filter((t) => t.nCorsi === 0 && trova(t)).sort(perGruppoENome);
  const altri = parole.length ? (d?.tipi || []).filter((t) => !d.coperti.has(t.id) && t.nCorsi > 0 && trova(t)).sort(perGruppoENome) : [];
  const nAbb = (d?.tipi || []).filter((t) => d.coperti.has(t.id) || t.nCorsi === 0).length;

  const riga = (t) => (
    <li key={t.id}>
      <button type="button" className="fc-abb" onClick={() => apriAbbonamento(t)}>
        <span className="fc-abb-nome">{t.nome}{t.codice ? <span className="muto"> · {t.codice}</span> : ''}</span>
        <span className="piccolo muto">{[nomeGruppo(t.gruppo_id), infoTipo(t)].filter(Boolean).join(' · ')}</span>
        <span className="fc-abb-segni">
          {!t.attivo && <span className="tag tag-attenzione">non attivo</span>}
          {t.attivo && !t.acquistabile_online && <span className="tag tag-neutro">solo segreteria</span>}
          <span className="fc-abb-apri" aria-hidden="true">Modifica ›</span>
        </span>
      </button>
    </li>
  );

  return (
    <>
      <Finestra titolo={corso?.nome || nome || 'Corso'} larga chiudi={chiudi}
                sotto={corso ? [d.discipline.find((x) => x.id === corso.disciplina_id)?.nome, d.fasce.find((x) => x.id === corso.fascia_eta_id)?.nome,
                  corso.attivo === false ? 'archiviato' : null].filter(Boolean).join(' · ') : ''}>
        <div className="fc-schede" role="tablist" aria-label="Parti del corso">
          {SCHEDE.map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={scheda === k} onClick={() => setScheda(k)}>
              {t}{d && k === 'orari' && <span className="conta-mini">{d.orari.filter((o) => o.attivo).length}</span>}
              {d && k === 'abbonamenti' && <span className="conta-mini">{nAbb}</span>}
            </button>
          ))}
        </div>
        {errore && <div className="errore" role="alert">{errore}</div>}
        {!d && !errore && <p className="muto">Carico il corso…</p>}

        {d && (
          <>
            <div style={{ display: scheda === 'corso' ? undefined : 'none' }} className="fc-scheda">
              <CorsoForm palestraId={palestraId} corso={d.corso} discipline={d.discipline} fasce={d.fasce} livelli={d.livelli} sedi={d.sedi}
                         tavolozza={d.palestra?.tema?.tavolozza || []} onModificato={setModificato}
                         onSalvato={() => { setModificato(false); onChiudi(); }} onAnnulla={chiudi} />
            </div>

            <div style={{ display: scheda === 'orari' ? undefined : 'none' }} className="fc-scheda">
              <p className="piccolo muto" style={{ marginTop: 0 }}>Le lezioni dei prossimi tre mesi si creano da sole dagli orari. Un orario cambiato vale per le lezioni future.</p>
              <Orari palestraId={palestraId} corsoId={corsoId} orari={d.orari} sale={d.sale} insegnanti={d.staff} abilitati={d.abilitati} onSalvato={carica} />
            </div>

            <div style={{ display: scheda === 'abbonamenti' ? undefined : 'none' }} className="fc-scheda">
              <p className="piccolo muto" style={{ marginTop: 0 }}>
                Gli abbonamenti con cui si frequenta {corso?.nome}. Toccane uno per aprirlo: dati, prezzo, regole e corsi compresi.
              </p>
              {avviso && <div className="avviso-ok" role="status">{avviso}</div>}
              <div className="fc-barra">
                <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un abbonamento (anche tra gli altri)"
                       aria-label="Cerca un abbonamento"
                       onKeyDown={(e) => { if (e.key === 'Escape' && cerca) { e.preventDefault(); e.stopPropagation(); setCerca(''); } }} />
                <button type="button" className="btn btn-piccolo" onClick={() => { setAvviso(''); setAbbonamento({ nuovo: true }); }}>+ Nuovo abbonamento per questo corso</button>
              </div>

              <h3 className="fc-titolo">Scelti per questo corso <span className="muto">· {scelti.length}</span></h3>
              {scelti.length ? <ul className="fc-lista">{scelti.map(riga)}</ul>
                : <p className="piccolo muto">{parole.length ? 'Nessuno con questa ricerca.' : 'Nessun abbonamento scelto apposta: si frequenta con quelli validi per tutti i corsi.'}</p>}

              <h3 className="fc-titolo">Validi per tutti i corsi <span className="muto">· {perTutti.length}</span></h3>
              {perTutti.length ? <ul className="fc-lista">{perTutti.map(riga)}</ul>
                : <p className="piccolo muto">{parole.length ? 'Nessuno con questa ricerca.' : 'Nessuno.'}</p>}

              {parole.length > 0 && (
                <>
                  <h3 className="fc-titolo">Altri abbonamenti <span className="muto">· non comprendono questo corso</span></h3>
                  {altri.length ? <ul className="fc-lista">{altri.map(riga)}</ul> : <p className="piccolo muto">Nessuno.</p>}
                </>
              )}
            </div>
          </>
        )}
      </Finestra>

      {abbonamento && d && (
        <ModificaRiga
          tabella="tipi_abbonamento" fissi={{ palestra_id: palestraId }}
          riga={abbonamento.riga || null}
          iniziali={abbonamento.nuovo ? { corsi_compresi: d.corsi.some((c) => c.id === corsoId) ? [corsoId] : [] } : {}}
          titolo={abbonamento.riga ? `${abbonamento.riga.nome}${abbonamento.riga.codice ? ` · ${abbonamento.riga.codice}` : ''}` : `Nuovo abbonamento · ${corso?.nome || ''}`}
          sotto={abbonamento.riga ? [nomeGruppo(abbonamento.riga.gruppo_id), infoTipo(abbonamento.riga)].filter(Boolean).join(' · ') : ''}
          campi={campiTipoAbbonamento({
            gruppi: d.gruppi, aliquote: d.aliquote, corsi: d.corsi, scadenzaRecupero: d.palestra?.scadenza_recupero,
            famiglie: [...new Set(d.tipi.flatMap(famiglieDi))].sort((a, b) => a.localeCompare(b, 'it')),
          })}
          onChiudi={() => setAbbonamento(null)}
          onSalvato={() => { setAvviso(abbonamento.nuovo ? 'Abbonamento aggiunto ✓' : 'Abbonamento salvato ✓'); carica(); }}
        />
      )}
    </>
  );
}
