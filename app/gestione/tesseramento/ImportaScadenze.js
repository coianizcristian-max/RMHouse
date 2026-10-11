'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { leggiScadenze, testoDelFile } from '@/lib/tessereScadenze';
import { dataBreve } from '@/lib/formato';

// Le scadenze delle tessere già fatte, dal vostro file (es. l'Excel delle iscrizioni, colonna TESSERA "A 1413763 08/10/2026").
// Il file si legge qui nel browser: a RMHouse arrivano solo tipo, numero e scadenza. Si abbinano per numero di tessera.
export default function ImportaScadenze({ palestraId }) {
  const router = useRouter();
  const [testo, setTesto] = useState('');
  const [nomeFile, setNomeFile] = useState('');
  const [trovate, setTrovate] = useState(null);
  const [esito, setEsito] = useState(null);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [vedi, setVedi] = useState(false);

  async function scegliFile(ev) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    setErrore(''); setEsito(null); setTesto(''); setNomeFile(f.name);
    try {
      const r = leggiScadenze(await testoDelFile(f));
      setTrovate(r);
      if (!r.length) setErrore('Nel file non trovo tessere scritte come "A 1413763 08/10/2026" (tipo, numero, scadenza).');
    } catch {
      setTrovate(null);
      setErrore('Non riesco a leggere il file: salvalo come .xlsx o .csv, oppure copia la colonna e incollala qui sotto.');
    }
  }

  function incolla(v) {
    setTesto(v); setNomeFile(''); setEsito(null); setErrore('');
    setTrovate(v.trim() ? leggiScadenze(v) : null);
  }

  async function importa() {
    setInvio(true); setErrore('');
    const { data, error } = await supabaseBrowser().rpc('importa_scadenze_tessere', { p_palestra: palestraId, p_righe: trovate });
    setInvio(false);
    if (error) { setErrore(error.message?.includes('importa_scadenze') ? 'Manca la query 161 in Supabase.' : 'Importazione non riuscita.'); return; }
    setEsito(data); setTrovate(null); setTesto(''); setNomeFile('');
    router.refresh();
  }

  const es = trovate?.[0];
  return (
    <div className="ts-importa">
      <p className="piccolo" style={{ margin: '0 0 8px' }}>
        Le tessere valgono un anno: con la scadenza RMHouse sa chi è ancora tesserato, chi scade e chi va rifatto.
        Scegli il vostro file (Excel o CSV) oppure incolla la colonna delle tessere. Il file resta sul tuo computer.
      </p>
      <div className="ts-importa-scelte">
        <label className="btn btn-piccolo">
          Scegli il file…
          <input type="file" accept=".xlsx,.csv,.txt,.tsv" onChange={scegliFile} hidden />
        </label>
        <textarea rows={2} value={testo} onChange={(e) => incolla(e.target.value)} aria-label="Incolla le tessere"
                  placeholder={'oppure incolla qui, es.\nA 1413763 08/10/2026'} />
      </div>
      {errore && <div className="errore" role="alert" style={{ marginTop: 8 }}>{errore}</div>}
      {trovate?.length > 0 && (
        <div className="azioni-riga" style={{ marginTop: 8 }}>
          <span className="piccolo">
            {nomeFile && <>{nomeFile}: </>}<b>{trovate.length} tessere</b> trovate (es. {es.tipo} {es.numero}, scade il {dataBreve(es.scadenza)})
          </span>
          <button type="button" className="btn btn-piccolo btn-primario" disabled={invio} onClick={importa}>
            {invio ? 'Importo…' : `Importa ${trovate.length} scadenze`}
          </button>
        </div>
      )}
      {esito && (
        <div className="avviso-ok" role="status" style={{ marginTop: 8 }}>
          <b>{esito.abbinate} tessere abbinate</b> alle persone di RMHouse ✓
          {esito.non_trovate?.length > 0 && (
            <>
              {' '}· {esito.non_trovate.length} numeri non trovati (persone non in RMHouse, o con un altro numero nella scheda){' '}
              <button type="button" className="link-btn piccolo" onClick={() => setVedi(!vedi)}>{vedi ? 'nascondi' : 'vedi quali'}</button>
              {vedi && <div className="piccolo ts-non-trovate">{esito.non_trovate.join(' · ')}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
