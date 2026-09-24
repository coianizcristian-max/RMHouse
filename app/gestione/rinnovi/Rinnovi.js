'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';

const MOTIVI = {
  gia_rinnovata: 'era già rinnovata',
  iscrizione_gia_attiva: 'ha già un abbonamento attivo su quel corso',
  non_autorizzato: 'permessi mancanti',
};

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

  async function cambiaAbbonamento(r) {
    const elenco = tipi.map((t, i) => `${i + 1}. ${t.nome} — ${euro(t.prezzo_cent)}`).join('\n');
    const scelta = prompt(`Con quale abbonamento rinnovi ${r.nome} ${r.cognome}?\n\n${elenco}\n\nScrivi il numero:`);
    const n = parseInt(scelta, 10);
    if (!Number.isFinite(n) || n < 1 || n > tipi.length) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('rinnova_iscrizione', {
      p_iscrizione: r.iscrizione_id, p_tipo_abbonamento: tipi[n - 1].id, p_sconto_cent: null, p_dal: null,
    });
    setInvio(false);
    if (error) { setErrore(`Non rinnovato: ${MOTIVI[Object.keys(MOTIVI).find((k) => error.message?.includes(k))] || 'errore'}.`); return; }
    router.refresh();
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
          <Link key={g} href={`/gestione/rinnovi?giorni=${g}`} aria-current={giorni === g ? 'true' : undefined}>
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
                <Link className="titolo" href={`/gestione/persone/${r.allievo_id}`} style={{ textDecoration: 'none' }}>
                  {r.cognome} {r.nome}
                </Link>
                {r.gia_rinnovata && <span className="tag tag-ok">già rinnovato</span>}
                {r.giorni_alla_scadenza < 0 && <span className="tag tag-rosso">scaduto da {-r.giorni_alla_scadenza} giorni</span>}
                {r.giorni_alla_scadenza >= 0 && <span className="tag tag-tenue">scade fra {r.giorni_alla_scadenza} giorni</span>}
                {!r.certificato_ok && <span className="tag tag-attenzione">certificato</span>}
                {!r.quota_ok && <span className="tag tag-attenzione">quota</span>}
              </span>

              <span className="riga">
                {r.corso} · {r.abbonamento} · {euro(prezzo)}
                {r.sconto_cent > 0 && ` (sconto ${euro(r.sconto_cent)})`}
              </span>
              <span className="riga">
                fino al {dataBreve(r.data_fine)} · rinnovo dal {dataBreve(new Date(new Date(r.data_fine).getTime() + 86400000))}
                {` · ${(r.orari || []).length} orari`}
              </span>

              {!r.gia_rinnovata && (
                <span className="azioni-riga">
                  <button className="link-btn piccolo" disabled={invio} onClick={() => rinnova([r.iscrizione_id])}>Rinnova</button>
                  <button className="link-btn piccolo" disabled={invio} onClick={() => cambiaAbbonamento(r)}>Rinnova con altro abbonamento</button>
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

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Il rinnovo crea un nuovo periodo con lo stesso abbonamento e gli stessi orari, a partire dal giorno dopo la
        scadenza. L'incasso non viene registrato da solo: lo segni in Conti → Incassi quando la persona paga.
      </p>
    </>
  );
}
