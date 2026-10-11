'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Gestore from '../Gestore';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { testoAliquota } from '@/lib/iva';

// Aliquote e numerazioni: le decide la scuola con il commercialista
export default function Regole({ palestraId, aliquote, numerazioni, ivaPalestra = null }) {
  const router = useRouter();
  const [iva, setIva] = useState({ quota: ivaPalestra?.aliquota_quota_id || '', spazi: ivaPalestra?.aliquota_spazi_id || '' });
  const [msg, setMsg] = useState('');
  const attive = aliquote.filter((a) => a.attiva);
  // l'IVA della quota annuale e dell'affitto sale (query 166): si salva subito
  async function salvaIva(k, v) {
    setIva((x) => ({ ...x, [k]: v }));
    const { error } = await supabaseBrowser().from('palestre').update({ [k === 'quota' ? 'aliquota_quota_id' : 'aliquota_spazi_id']: v || null }).eq('id', palestraId);
    setMsg(error ? 'Non salvato: esegui la query 166.' : 'Salvato ✓'); setTimeout(() => setMsg(''), 2500);
    if (!error) router.refresh();
  }
  return (
    <>
      <section className="pannello">
        <h2>Aliquote e regimi IVA</h2>
        <p className="piccolo muto" style={{ marginTop: -4 }}>
          I prezzi sono sempre IVA compresa: sulla ricevuta l&apos;IVA si scorpora (15 € con IVA 22% = 12,30 + 2,70).
          Quale aliquota va su un incasso: quella scelta a mano sull&apos;incasso → quella del <b>corso</b> (scheda del corso o
          Modifica veloce) → quella dell&apos;<b>abbonamento</b> → quella del workshop o dell&apos;evento → le due qui sotto → la &quot;predefinita&quot;.
          La natura (N2.2, N4…) serve quando l&apos;IVA è zero: fattela confermare dal commercialista.
        </p>
        {ivaPalestra && (
          <div className="riga-2" style={{ marginBottom: 10 }}>
            <div className="campo"><label htmlFor="iva-quota">IVA della quota annuale</label>
              <select id="iva-quota" value={iva.quota} onChange={(e) => salvaIva('quota', e.target.value)}>
                <option value="">— predefinita —</option>
                {attive.map((a) => <option key={a.id} value={a.id}>{testoAliquota(a)}</option>)}
              </select></div>
            <div className="campo"><label htmlFor="iva-spazi">IVA dell&apos;affitto sale</label>
              <select id="iva-spazi" value={iva.spazi} onChange={(e) => salvaIva('spazi', e.target.value)}>
                <option value="">— predefinita —</option>
                {attive.map((a) => <option key={a.id} value={a.id}>{testoAliquota(a)}</option>)}
              </select></div>
            {msg && <span className="piccolo" role="status">{msg}</span>}
          </div>
        )}
        <Gestore
          tabella="aliquote_iva" fissi={{ palestra_id: palestraId }} righe={aliquote} etichettaNuovo="Aggiungi aliquota"
          campi={[
            { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
            { k: 'percentuale', etichetta: 'Percentuale IVA', tipo: 'numero', obbligatorio: true },
            { k: 'natura', etichetta: 'Natura (se IVA a zero)', tipo: 'testo', aiuto: 'Es. N4 esente, N2.2 non soggetta' },
            { k: 'riferimento', etichetta: 'Dicitura sul documento', tipo: 'testo' },
            { k: 'predefinita', etichetta: 'Predefinita', tipo: 'check', predefinito: false },
            { k: 'attiva', etichetta: 'Attiva', tipo: 'check' },
          ]}
          riassunto={(x) => ({
            titolo: x.nome,
            dettaglio: [`${Number(x.percentuale)}%`, x.natura, x.riferimento].filter(Boolean).join(' · '),
            tag: x.predefinita ? 'predefinita' : x.attiva ? null : 'non attiva',
          })}
        />
      </section>
      <section className="pannello">
        <h2>Numerazioni</h2>
        <p className="piccolo muto" style={{ marginTop: -4 }}>
          Ogni tipo di documento ha la sua numerazione: riparte da 1 ogni anno, senza buchi. Il codice si stampa
          accanto al numero.
        </p>
        <Gestore
          tabella="numerazioni" fissi={{ palestra_id: palestraId }} righe={numerazioni} etichettaNuovo="Aggiungi numerazione"
          campi={[
            { k: 'codice', etichetta: 'Codice', tipo: 'testo', obbligatorio: true, aiuto: 'Breve: RNF, NC…' },
            { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
            { k: 'tipo_documento', etichetta: 'Documenti', tipo: 'select', obbligatorio: true,
              opzioni: [{ v: 'ricevuta', l: 'Ricevute' }, { v: 'nota_credito', l: 'Note di credito' }] },
            { k: 'predefinita', etichetta: 'Usata per i nuovi documenti di questo tipo', tipo: 'check', predefinito: false },
            { k: 'attiva', etichetta: 'Attiva', tipo: 'check' },
          ]}
          riassunto={(x) => ({
            titolo: `${x.codice} · ${x.nome}`,
            dettaglio: x.tipo_documento === 'nota_credito' ? 'Note di credito' : 'Ricevute',
            tag: x.predefinita ? 'in uso' : x.attiva ? null : 'non attiva',
          })}
        />
      </section>
    </>
  );
}
