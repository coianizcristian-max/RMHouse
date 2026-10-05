'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';

const MOTIVI = {
  gia_rinnovata: 'era già rinnovata',
  orario_non_attivo: 'uno dei giorni è stato sospeso: cambia i giorni dalla scheda',
  iscrizione_gia_attiva: 'ha già un abbonamento attivo su quel corso',
  non_autorizzato: 'permessi mancanti',
  inizio_meta_mese: 'riparte a metà mese: premi "Rinnova" sulla sua riga e scrivi l\'importo',
};
const oggiISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

export default function Rinnovi({ righe, tipi, giorni }) {
  const router = useRouter();
  const [scelti, setScelti] = useState([]);
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState(null);
  const [invio, setInvio] = useState(false);

  const aperte = righe.filter((r) => !r.gia_rinnovata);
  const scaduteIeri = aperte.filter((r) => r.giorni_alla_scadenza < 0);
  const totale = aperte
    .filter((r) => scelti.includes(r.iscrizione_id))
    .reduce((s, r) => s + Math.max((r.prezzo_cent || 0) - (r.sconto_cent || 0), 0), 0);

  const spunta = (id) => setScelti((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const tutti = () => setScelti(scelti.length === aperte.length ? [] : aperte.map((r) => r.iscrizione_id));

  async function rinnova(ids) {
    if (ids.length === 0) return;
    if (!confirm(`Rinnovare ${ids.length} abbonamenti? Il nuovo periodo parte dal giorno dopo la scadenza, con gli stessi orari.`)) return;
    setInvio(true); setErrore(''); setEsito(null);
    const { data, error } = await supabaseBrowser().rpc('rinnova_blocco', { p_iscrizioni: ids });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setEsito(data); setScelti([]); router.refresh();
  }

  // Riparte a metà mese (scaduto da qualche giorno, o dopo una sospensione): l'importo fino a fine mese lo decide la segreteria
  async function chiediImporto(r, tipo) {
    const dal = oggiISO();
    const [y, m] = dal.split('-').map(Number);
    const fine = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const prezzo = tipo?.prezzo_cent ?? r.prezzo_cent ?? 0;
    const { data: rim } = await supabaseBrowser().rpc('lezioni_rimaste_mese', { p_orari: r.orari || [], p_dal: dal });
    const proposta = rim?.mese ? Math.round((prezzo * rim.rimaste) / rim.mese / 100) * 100 : prezzo;
    const testo = prompt(`${r.nome} ${r.cognome} riparte oggi, a metà mese: il rinnovo va fino al ${dataBreve(fine)}.\n`
      + `A listino ${euro(prezzo)} è il mese intero.${rim?.mese ? ` Restano ${rim.rimaste} lezioni su ${rim.mese}.` : ''}`
      + `${rim?.mese && rim.rimaste === 0 ? '\nQuesto mese non ci sono più lezioni: puoi scrivere 0, oppure rinnovarlo dal 1° dalla sua scheda.' : ''}\n\nQuanto paga (€)?`,
      (proposta / 100).toFixed(2).replace('.', ','));
    if (testo == null) return null;
    const cent = Math.round(parseFloat(testo.replace(',', '.')) * 100);
    if (!(cent >= 0)) return null;
    return Math.max(prezzo - cent, 0);
  }

  async function rinnovaUno(r, tipo = null) {
    setInvio(true); setErrore('');
    const sb = supabaseBrowser();
    const args = { p_iscrizione: r.iscrizione_id, p_tipo_abbonamento: tipo?.id || null, p_sconto_cent: null, p_dal: null };
    let { error } = await sb.rpc('rinnova_iscrizione', args);
    if (error?.message?.includes('inizio_meta_mese')) {
      const sconto = await chiediImporto(r, tipo);
      if (sconto == null) { setInvio(false); return; }
      ({ error } = await sb.rpc('rinnova_iscrizione', { ...args, p_sconto_cent: sconto }));
    }
    setInvio(false);
    if (error) { setErrore(`Non rinnovato: ${MOTIVI[Object.keys(MOTIVI).find((k) => error.message?.includes(k))] || 'errore'}.`); return; }
    setEsito({ rinnovate: 1, saltate: [] }); router.refresh();
  }

  async function cambiaAbbonamento(r) {
    const elenco = tipi.map((t, i) => `${i + 1}. ${t.nome} — ${euro(t.prezzo_cent)}`).join('\n');
    const scelta = prompt(`Con quale abbonamento rinnovi ${r.nome} ${r.cognome}?\n\n${elenco}\n\nScrivi il numero:`);
    const n = parseInt(scelta, 10);
    if (!Number.isFinite(n) || n < 1 || n > tipi.length) return;
    await rinnovaUno(r, tipi[n - 1]);
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Rinnovi</h1>
        <p>Gli abbonamenti in scadenza: spunti chi rinnova e li fai tutti insieme, senza aprire una scheda per volta.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      {esito && (
        <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>
          Rinnovati {esito.rinnovate}.
          {(esito.saltate || []).length > 0 && (
            <> Saltati: {esito.saltate.map((s) => `${s.chi} (${MOTIVI[s.motivo] || s.motivo})`).join(', ')}.</>
          )}
        </div>
      )}

      <div className="griglia" style={{ marginBottom: 14 }}>
        <div className="tessera tessera-rossa">
          <div className="etichetta">Da rinnovare</div>
          <div className="cifra">{aperte.length}</div>
          <div className="sotto">nei prossimi {giorni} giorni</div>
        </div>
        <div className="tessera">
          <div className="etichetta">Già scaduti</div>
          <div className="cifra">{scaduteIeri.length}</div>
          <div className="sotto">da recuperare subito</div>
        </div>
        <div className="tessera tessera-nera">
          <div className="etichetta">Selezionati</div>
          <div className="cifra">{scelti.length}</div>
          <div className="sotto">{euro(totale)} di incasso atteso</div>
        </div>
      </div>

      <div className="filtri">
        {[10, 20, 30, 60].map((g) => (
          <Link prefetch={false} key={g} href={`/gestione/rinnovi?giorni=${g}`} aria-current={giorni === g ? 'true' : undefined}>
            {g} giorni
          </Link>
        ))}
      </div>

      {aperte.length === 0 && <div className="vuoto">Nessun abbonamento da rinnovare in questo periodo.</div>}

      {aperte.length > 0 && (
        <div className="azioni" style={{ marginBottom: 12 }}>
          <button className="btn" onClick={tutti}>
            {scelti.length === aperte.length ? 'Togli la spunta a tutti' : 'Spunta tutti'}
          </button>
          <button className="btn btn-primario" disabled={invio || scelti.length === 0} onClick={() => rinnova(scelti)}>
            Rinnova i {scelti.length} selezionati
          </button>
        </div>
      )}

      <div className="griglia-schede">
      {righe.map((r) => {
        const prezzo = Math.max((r.prezzo_cent || 0) - (r.sconto_cent || 0), 0);
        return (
          <div key={r.iscrizione_id} className="scheda-corso" style={{ gridTemplateColumns: '6px 1fr', alignItems: 'start' }}>
            <span className="banda" style={{ background: r.colore || 'var(--rosso)' }} />
            <span className="centro" style={{ paddingRight: 14 }}>
              <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                {!r.gia_rinnovata && (
                  <label className="spunta" style={{ margin: 0 }}>
                    <input type="checkbox" checked={scelti.includes(r.iscrizione_id)}
                           onChange={() => spunta(r.iscrizione_id)} aria-label={`Rinnova ${r.nome} ${r.cognome}`} />
                    <span />
                  </label>
                )}
                <Link prefetch={false} className="titolo" href={`/gestione/persone/${r.allievo_id}`} style={{ textDecoration: 'none' }}>
                  {r.cognome} {r.nome}
                </Link>
                {r.gia_rinnovata && <span className="tag tag-ok">già rinnovato</span>}
                {r.giorni_alla_scadenza < 0 && <span className="tag tag-rosso">scaduto da {-r.giorni_alla_scadenza} giorni</span>}
                {r.giorni_alla_scadenza >= 0 && <span className="tag tag-tenue">{r.giorni_alla_scadenza === 0 ? 'scade oggi' : r.giorni_alla_scadenza === 1 ? 'scade domani' : `scade fra ${r.giorni_alla_scadenza} giorni`}</span>}
                {!r.certificato_ok && <span className="tag tag-attenzione">certificato</span>}
                {!r.quota_ok && <span className="tag tag-attenzione">quota</span>}
              </span>

              <span className="riga">
                {r.corso} · {r.abbonamento} · {euro(prezzo)}
                {r.sconto_cent > 0 && ` (sconto ${euro(r.sconto_cent)})`}
              </span>
              <span className="riga">
                fino al {dataBreve(r.data_fine)} · rinnovo dal {r.giorni_alla_scadenza < 0 ? `${dataBreve(oggiISO())}${oggiISO().endsWith('-01') ? '' : ' (riparte a metà mese)'}` : dataBreve(new Date(new Date(r.data_fine).getTime() + 86400000))}
                {` · ${(r.orari || []).length} orari`}
              </span>

              {!r.gia_rinnovata && (
                <span className="azioni-riga">
                  <button className="link-btn piccolo" disabled={invio} onClick={() => rinnovaUno(r)}>Rinnova</button>
                  <button className="link-btn piccolo" disabled={invio} onClick={() => cambiaAbbonamento(r)}>Cambia abbonamento</button>
                  {r.telefono && (
                    <a className="link-btn piccolo" target="_blank" rel="noreferrer"
                       href={`https://wa.me/39${(r.telefono || '').replace(/\D/g, '')}`}>WhatsApp</a>
                  )}
                </span>
              )}
            </span>
          </div>
        );
      })}
      </div>

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Il rinnovo crea un nuovo periodo con lo stesso abbonamento e gli stessi orari, a partire dal giorno dopo la
        scadenza. L'incasso non viene registrato da solo: lo segni in Conti → Incassi quando la persona paga.
      </p>
    </>
  );
}
