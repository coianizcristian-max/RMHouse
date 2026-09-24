'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';

const CATEGORIE = [
  ['affitto', 'Affitto'], ['utenze', 'Utenze'], ['compensi', 'Compensi'], ['marketing', 'Marketing'],
  ['materiali', 'Materiali'], ['assicurazioni', 'Assicurazioni'], ['software', 'Software'],
  ['manutenzione', 'Manutenzione'], ['tasse', 'Tasse'], ['altro', 'Altro'],
];

// suggerisce la categoria guardando il nome del fornitore
const indovinaCategoria = (nome = '') => {
  const n = nome.toLowerCase();
  if (/energia|enel|gas|acqua|luce|hera|a2a/.test(n)) return 'utenze';
  if (/immobil|affitt|locazion/.test(n)) return 'affitto';
  if (/assicur|unipol|generali|allianz/.test(n)) return 'assicurazioni';
  if (/software|cloud|vercel|supabase|google|microsoft|adobe/.test(n)) return 'software';
  if (/pulizi|manuten|idraul|elettric/.test(n)) return 'manutenzione';
  return 'altro';
};

export default function Fatture({ righe, quadratura, dal, al, tipo, stato }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  async function carica(e) {
    const files = e.target.files;
    if (!files?.length) return;
    setInvio(true); setErrore(''); setAvviso('');
    const form = new FormData();
    [...files].forEach((f) => form.append('file', f));
    form.append('tipo', tipo);
    const r = await fetch('/api/fatture/importa', { method: 'POST', body: form });
    const d = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) { setErrore(d.errore || 'Importazione non riuscita.'); return; }
    setAvviso(`Importate ${d.importate} fatture${d.saltate ? `, ${d.saltate} già presenti` : ''}.` +
              ((d.problemi || []).length ? ` Problemi: ${d.problemi.join('; ')}` : ''));
    router.refresh();
  }

  async function registra(f) {
    const proposta = indovinaCategoria(f.controparte);
    const elenco = CATEGORIE.map(([, l], i) => `${i + 1}. ${l}`).join('\n');
    const scelta = prompt(
      `In che categoria va "${f.controparte}"?\n\n${elenco}\n\nProposta: ${CATEGORIE.find(([v]) => v === proposta)[1]}`,
      String(CATEGORIE.findIndex(([v]) => v === proposta) + 1),
    );
    const n = parseInt(scelta, 10);
    if (!Number.isFinite(n) || n < 1 || n > CATEGORIE.length) return;
    const pagata = confirm('È già stata pagata? OK = sì, Annulla = ancora da pagare.');

    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('registra_fattura_spesa', {
      p_fattura: f.id, p_categoria: CATEGORIE[n - 1][0], p_sala: null, p_corso: null, p_pagata: pagata,
    });
    setInvio(false);
    if (error) { setErrore('Registrazione non riuscita.'); return; }
    setAvviso('Registrata: la trovi in Costi e fornitori, e nel flusso di cassa quando risulta pagata.');
    router.refresh();
  }

  async function ignora(f) {
    const nota = prompt('Perché la ignori? (già registrata altrove, non di competenza…)');
    if (nota === null) return;
    await supabaseBrowser().rpc('ignora_fattura', { p_fattura: f.id, p_nota: nota || null });
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Fatture</h1>
        <p>Le fatture che passano dallo SDI: quelle dei fornitori diventano spese, e le spese si abbinano ai movimenti del conto.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <div className="griglia" style={{ marginBottom: 14 }}>
        <div className="tessera tessera-rossa">
          <div className="etichetta">Acquisti nel periodo</div>
          <div className="cifra">{euro(quadratura.passive_totale_cent || 0)}</div>
          <div className="sotto">{quadratura.passive_da_registrare ?? 0} ancora da registrare</div>
        </div>
        <div className="tessera">
          <div className="etichetta">IVA sugli acquisti</div>
          <div className="cifra">{euro(quadratura.iva_acquisti_cent || 0)}</div>
          <div className="sotto">IVA sulle vendite {euro(quadratura.iva_vendite_cent || 0)}</div>
        </div>
        <div className="tessera tessera-nera">
          <div className="etichetta">Da pagare</div>
          <div className="cifra">{euro(quadratura.spese_non_pagate_cent || 0)}</div>
          <div className="sotto">{quadratura.spese_senza_movimento ?? 0} pagate senza movimento in banca</div>
        </div>
      </div>

      <div className="scheda" style={{ marginBottom: 16 }}>
        <strong style={{ color: 'var(--nero)' }}>Carica le fatture</strong>
        <p className="piccolo muto" style={{ marginTop: 4 }}>
          Scarica gli XML dal cassetto fiscale o dal programma del commercialista e trascinali qui: puoi
          selezionarne anche cinquanta insieme. I file già caricati vengono riconosciuti e saltati.
          Funzionano sia i .xml sia i .p7m firmati.
        </p>
        <div className="campo">
          <label htmlFor="fi">File XML ({tipo === 'passiva' ? 'fatture ricevute' : 'fatture emesse'})</label>
          <input id="fi" type="file" accept=".xml,.p7m" multiple disabled={invio} onChange={carica} />
        </div>
      </div>

      <div className="filtri">
        <Link href={`/gestione/fatture?tipo=passiva&dal=${dal}&al=${al}`} aria-current={tipo === 'passiva' ? 'true' : undefined}>Ricevute</Link>
        <Link href={`/gestione/fatture?tipo=attiva&dal=${dal}&al=${al}`} aria-current={tipo === 'attiva' ? 'true' : undefined}>Emesse</Link>
        <Link href={`/gestione/fatture?tipo=${tipo}&stato=da_registrare&dal=${dal}&al=${al}`} aria-current={stato === 'da_registrare' ? 'true' : undefined}>Da registrare</Link>
        <Link href="/gestione/banca">Vai alla banca</Link>
      </div>

      {righe.length === 0 && <div className="vuoto">Nessuna fattura in questo elenco.</div>}

      <ul className="elenco">
        {righe.map((f) => (
          <li key={f.id} className="persona">
            <span>
              <strong style={{ color: 'var(--nero)' }}>{f.controparte}</strong>
              <span className="piccolo muto" style={{ display: 'block' }}>
                n. {f.numero} del {dataBreve(f.data)}
                {f.piva && ` · P.IVA ${f.piva}`}
                {f.scadenza && ` · scade il ${dataBreve(f.scadenza)}`}
                {f.note && ` · ${f.note}`}
              </span>
              {f.stato === 'da_registrare' && f.tipo === 'passiva' && (
                <span className="azioni-riga">
                  <button className="link-btn piccolo" disabled={invio} onClick={() => registra(f)}>Registra come spesa</button>
                  <button className="link-btn piccolo pericolo" disabled={invio} onClick={() => ignora(f)}>Ignora</button>
                </span>
              )}
            </span>
            <span style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
              <strong>{euro(f.totale_cent)}</strong>
              <span className="piccolo muto">di cui IVA {euro(f.iva_cent)}</span>
              {f.stato === 'registrata' && <span className="tag tag-attenzione">da pagare</span>}
              {f.stato === 'pagata' && <span className="tag tag-ok">pagata</span>}
              {f.stato === 'ignorata' && <span className="tag tag-neutro">ignorata</span>}
            </span>
          </li>
        ))}
      </ul>

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        La catena è: fattura del fornitore → riga di spesa → movimento sul conto. Quando in Banca abbini un'uscita a
        una spesa, la spesa risulta pagata e la fattura si chiude da sola. Le fatture emesse servono qui solo come
        registro di controllo: continuano a passare dal commercialista.
      </p>
    </>
  );
}
