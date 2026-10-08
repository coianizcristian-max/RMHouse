'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, etaAl } from '@/lib/formato';

// Gli iscritti a un workshop: chi è, cosa ha preso, quanto paga (e se ha pagato), certificato, presenze per momento.
// Da qui si incassa (con ricevuta ed email), si segnano le presenze, si toglie qualcuno; si copiano email e telefoni.
const METODI = [['contanti', 'Contanti'], ['pos', 'POS / carta'], ['satispay', 'Satispay'], ['bonifico', 'Bonifico'], ['assegno', 'Assegno']];
const ORIGINI = { app: 'dall\'app', pubblico: 'dal link', segreteria: 'in segreteria' };
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function IscrittiWorkshop({ workshop: w, momenti, opzioni, iscrizioni, daIncassare = null }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState('tutti');
  // dall'appello ("da pagare"): si apre già sulla persona, con l'incasso pronto
  const [cerca, setCerca] = useState(daIncassare ? `${daIncassare.allievi?.nome || ''} ${daIncassare.allievi?.cognome || ''}`.trim() : '');
  const [incasso, setIncasso] = useState(daIncassare ? { id: daIncassare.id, metodo: 'contanti', ricevuta: true,
    inviaEmail: !!daIncassare.allievi?.account?.email, email: daIncassare.allievi?.account?.email || '' } : null);    // { id, metodo, ricevuta, email }
  const [invio, setInvio] = useState('');
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [copiato, setCopiato] = useState('');
  const primoGiorno = momenti[0]?.inizio?.slice(0, 10);
  const ultimoGiorno = (momenti[momenti.length - 1]?.fine || momenti[momenti.length - 1]?.inizio || '').slice(0, 10);

  const attive = iscrizioni.filter((i) => i.stato === 'iscritto');
  const annullate = iscrizioni.filter((i) => i.stato === 'annullato');
  const opz = (id) => opzioni.find((o) => o.id === id);
  const certOk = (i) => i.allievi?.certificato_scadenza && i.allievi.certificato_scadenza >= (ultimoGiorno || primoGiorno);
  const daPagare = (i) => i.pagamenti?.stato === 'in_attesa' || i.pagamenti?.stato === 'annullato';
  const filtri = [
    ['tutti', 'Tutti', attive.length],
    ['dapagare', 'Da pagare', attive.filter(daPagare).length],
    ['esterni', 'Esterni', attive.filter((i) => i.esterno).length],
    ...(w.certificato_richiesto ? [['certificato', 'Certificato da sistemare', attive.filter((i) => !certOk(i)).length]] : []),
    ...(opzioni.length > 1 ? opzioni.map((o) => [`o:${o.id}`, o.nome, attive.filter((i) => i.opzione_id === o.id).length]) : []),
    ['annullati', 'Non partecipano', annullate.length],
  ];
  const parole = norm(cerca).split(/\s+/).filter(Boolean);
  const righe = (filtro === 'annullati' ? annullate : attive).filter((i) => {
    if (filtro === 'dapagare' && !daPagare(i)) return false;
    if (filtro === 'esterni' && !i.esterno) return false;
    if (filtro === 'certificato' && certOk(i)) return false;
    if (filtro.startsWith('o:') && i.opzione_id !== filtro.slice(2)) return false;
    const t = norm(`${i.allievi?.nome} ${i.allievi?.cognome} ${i.allievi?.account?.email || ''} ${i.allievi?.account?.telefono || ''}`);
    return parole.every((p) => t.includes(p));
  }).sort((a, b) => `${a.allievi?.cognome} ${a.allievi?.nome}`.localeCompare(`${b.allievi?.cognome} ${b.allievi?.nome}`, 'it'));

  async function esegui(id, fn, ok) {
    setInvio(id); setErrore(''); setAvviso('');
    const { data, error } = await fn(supabaseBrowser());
    setInvio('');
    if (error) {
      const m = error.message || '';
      setErrore(m.includes('gia_pagato') ? 'Risulta già pagato.' : m.includes('niente_da_incassare') ? 'Niente da incassare: è gratuito.' : `Non riuscito: ${m}`);
      return;
    }
    if (ok) setAvviso(typeof ok === 'function' ? ok(data) : ok);
    router.refresh();
  }
  const incassa = () => esegui(incasso.id, (db) => db.rpc('incassa_workshop', {
    p_iscrizione: incasso.id, p_metodo: incasso.metodo, p_ricevuta: incasso.ricevuta, p_email: incasso.ricevuta && incasso.inviaEmail ? incasso.email : null,
  }), (d) => { setIncasso(null); return d?.avviso || 'Incassato ✓'; });
  const presenza = (i, m) => esegui(`${i.id}${m}`, (db) => db.rpc('presenza_workshop', { p_iscrizione: i.id, p_momento: m, p_presente: !(i.presenze || []).includes(m) }));
  function togli(i) {
    const pagato = i.pagamenti?.stato === 'pagato';
    if (!confirm(`Togliere ${i.allievi?.nome} ${i.allievi?.cognome} dal workshop?${pagato ? `\nHa già pagato ${euro(i.pagamenti.importo_cent)}: ti resta il promemoria per l'eventuale rimborso.` : ''}`)) return;
    esegui(i.id, (db) => db.rpc('annulla_iscrizione_workshop', { p_iscrizione: i.id }), (d) => (d === 'annullata_da_rimborsare' ? 'Tolto. Trovi il promemoria del rimborso nella home.' : 'Tolto.'));
  }

  async function copia(cosa) {
    const v = attive.map((i) => (cosa === 'email' ? i.allievi?.account?.email : i.allievi?.account?.telefono)).filter(Boolean);
    const testo = [...new Set(v)].join(cosa === 'email' ? ', ' : '\n');
    try { await navigator.clipboard.writeText(testo); setCopiato(cosa); setTimeout(() => setCopiato(''), 2500); } catch { prompt('Copia:', testo); }
  }
  function scarica() {
    const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const testa = ['Cognome', 'Nome', 'Età', 'Email', 'Telefono', 'Opzione', 'Esterno', 'Importo', 'Pagato', 'Metodo', ...momenti.map((m) => `Presente ${m.titolo}`)];
    const corpo = attive.map((i) => [i.allievi?.cognome, i.allievi?.nome, etaAl(i.allievi?.data_nascita) ?? '', i.allievi?.account?.email, i.allievi?.account?.telefono,
      opz(i.opzione_id)?.nome, i.esterno ? 'sì' : 'no', ((i.prezzo_cent + i.quota_cent) / 100).toFixed(2).replace('.', ','),
      i.pagamenti?.stato === 'pagato' ? 'sì' : (i.prezzo_cent + i.quota_cent) ? 'no' : 'gratis', i.pagamenti?.stato === 'pagato' ? i.pagamenti.metodo : '',
      ...momenti.map((m) => ((i.presenze || []).includes(m.id) ? 'sì' : ''))]);
    const csv = '﻿' + [testa, ...corpo].map((r) => r.map(q).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `iscritti-${w.slug}.csv`; a.click();
  }

  return (
    <div className="wi">
      <div className="wi-barra">
        <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un iscritto" aria-label="Cerca un iscritto" />
        <div className="pastiglie wi-filtri" role="radiogroup" aria-label="Filtra">
          {filtri.map(([k, t, n]) => (
            <button key={k} type="button" role="radio" aria-checked={filtro === k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t} <span className="muto">{n}</span></button>
          ))}
        </div>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}

      {righe.length === 0 && (
        <div className="vuoto">
          {attive.length === 0 && filtro === 'tutti'
            ? <>Ancora nessun iscritto. Si iscrivono dall&apos;app, dal link pubblico o dallo <Link prefetch={false} href={`/gestione/sportello?workshop=${w.id}`}>Sportello</Link>.</>
            : 'Nessuno con questo filtro.'}
        </div>
      )}

      <ul className="wi-lista">
        {righe.map((i) => {
          const a = i.allievi || {};
          const o = opz(i.opzione_id);
          const importo = (i.prezzo_cent || 0) + (i.quota_cent || 0);
          const pagato = i.pagamenti?.stato === 'pagato';
          const mieiMomenti = momenti.filter((m) => (o?.momenti || []).includes(m.id));
          const eta = etaAl(a.data_nascita);
          return (
            <li key={i.id} className={`wi-riga${i.stato === 'annullato' ? ' annullata' : ''}`}>
              <div className="wi-chi">
                <Link prefetch={false} href={`/gestione/persone/${i.allievo_id}`} className="persona-nome">{a.cognome} {a.nome}</Link>
                {eta != null && <span className="piccolo muto"> · {eta} anni</span>}
                <div className="wi-tag">
                  <span className={`tag ${i.esterno ? 'tag-attenzione' : 'tag-neutro'}`}>{i.esterno ? 'esterno' : 'allievo'}</span>
                  {i.quota_cent > 0 && <span className="tag tag-tenue">+ quota {euro(i.quota_cent)}</span>}
                  {w.certificato_richiesto && i.stato === 'iscritto' && <span className={`tag ${certOk(i) ? 'tag-ok' : 'tag-rosso'}`}>{certOk(i) ? 'certificato ok' : 'certificato da sistemare'}</span>}
                </div>
                <div className="piccolo muto wi-contatti">
                  {a.account?.telefono && <a href={`tel:${a.account.telefono}`}>{a.account.telefono}</a>}
                  {a.account?.email && <span>{a.account.email}</span>}
                  {a.account && a.account.nome !== a.nome && <span>genitore {a.account.nome}</span>}
                </div>
              </div>
              <div className="wi-cosa">
                <strong>{o?.nome || '—'}</strong>
                <span className="piccolo muto">{ORIGINI[i.origine] || ''} · {new Date(i.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Rome' })}</span>
              </div>
              <div className="wi-soldi">
                {importo === 0 ? <span className="tag tag-neutro">gratuito</span>
                  : pagato ? <span className="tag tag-ok">{euro(importo)} pagato · {i.pagamenti.metodo}</span>
                  : i.stato === 'annullato' ? <span className="tag tag-neutro">{euro(importo)} non pagato</span>
                  : (
                    <>
                      <span className="tag tag-attenzione">{euro(importo)} da pagare</span>
                      {incasso?.id !== i.id && (
                        <button type="button" className="btn btn-piccolo btn-primario" disabled={!!invio}
                                onClick={() => setIncasso({ id: i.id, metodo: 'contanti', ricevuta: true, inviaEmail: !!a.account?.email, email: a.account?.email || '' })}>Incassa</button>
                      )}
                    </>
                  )}
                {i.stato === 'annullato' && pagato && <span className="tag tag-attenzione">rimborso?</span>}
              </div>
              {i.stato === 'iscritto' && mieiMomenti.length > 0 && (
                <div className="wi-presenze" role="group" aria-label="Presenze">
                  {mieiMomenti.map((m) => {
                    const c = (i.presenze || []).includes(m.id);
                    return (
                      <button key={m.id} type="button" className={`wi-presente${c ? ' si' : ''}`} aria-pressed={c} disabled={invio === `${i.id}${m.id}`}
                              onClick={() => presenza(i, m.id)} title={`Presente a ${m.titolo}`}>{c ? '✓ ' : ''}{m.titolo}</button>
                    );
                  })}
                </div>
              )}
              {i.stato === 'iscritto' && (
                <div className="wi-azioni">
                  <button type="button" className="link-btn piccolo pericolo" disabled={!!invio} onClick={() => togli(i)}>togli</button>
                </div>
              )}
              {incasso?.id === i.id && (
                <div className="wi-incasso">
                  <div className="sp-metodi" role="radiogroup" aria-label="Come paga">
                    {METODI.map(([k, t]) => (
                      <button key={k} type="button" role="radio" aria-checked={incasso.metodo === k} className={incasso.metodo === k ? 'attivo' : ''}
                              onClick={() => setIncasso((x) => ({ ...x, metodo: k }))}>{t}</button>
                    ))}
                  </div>
                  <label className="spunta piccolo"><input type="checkbox" checked={incasso.ricevuta} onChange={(e) => setIncasso((x) => ({ ...x, ricevuta: e.target.checked }))} /> ricevuta</label>
                  {incasso.ricevuta && (
                    <label className="spunta piccolo"><input type="checkbox" checked={incasso.inviaEmail} onChange={(e) => setIncasso((x) => ({ ...x, inviaEmail: e.target.checked }))} /> per email
                      {incasso.inviaEmail && <input className="wi-email" type="email" value={incasso.email} onChange={(e) => setIncasso((x) => ({ ...x, email: e.target.value }))} aria-label="Email per la ricevuta" />}</label>
                  )}
                  <button type="button" className="btn btn-primario btn-piccolo" disabled={!!invio} onClick={incassa}>{invio === i.id ? 'Incasso…' : `Incassa ${euro(importo)}`}</button>
                  <button type="button" className="link-btn piccolo" onClick={() => setIncasso(null)}>annulla</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {attive.length > 0 && (
        <div className="azioni wi-fondo">
          <button type="button" className="btn btn-piccolo" onClick={() => copia('email')}>{copiato === 'email' ? 'Email copiate ✓' : 'Copia le email'}</button>
          <button type="button" className="btn btn-piccolo" onClick={() => copia('tel')}>{copiato === 'tel' ? 'Telefoni copiati ✓' : 'Copia i telefoni'}</button>
          <button type="button" className="btn btn-piccolo" onClick={scarica}>Scarica l&apos;elenco (Excel)</button>
          <Link prefetch={false} className="btn btn-piccolo" href={`/gestione/sportello?workshop=${w.id}`}>+ Iscrivi dallo Sportello</Link>
        </div>
      )}
    </div>
  );
}
