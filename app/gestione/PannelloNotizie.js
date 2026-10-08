'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Il pannello a destra della home (schermi larghi): cosa è successo negli ultimi giorni e cosa aspetta la segreteria.
// Prenotazioni e disdette dall'app, prove, certificati da verificare, richieste da confermare (query 141)
// più le notifiche dello staff (nuovi clienti, pagamenti online, lezioni assegnate…). Si aggiorna da solo ogni minuto.
const TIPI = {
  prenotazione: { nome: 'Prenotazione', colore: '#2563eb' },
  disdetta: { nome: 'Disdetta', colore: '#c2410c' },
  prova: { nome: 'Prova', colore: '#9333ea' },
  certificato: { nome: 'Certificato', colore: '#ca8a04' },
  richiesta: { nome: 'Richiesta', colore: '#db2777' },
  cliente: { nome: 'Nuovo cliente', colore: '#16a34a' },
  pagamento: { nome: 'Pagamento', colore: '#0891b2' },
  lezione: { nome: 'Lezioni', colore: '#4f46e5' },
  orario: { nome: 'Orari', colore: '#a16207' },
  compito: { nome: 'Promemoria', colore: '#a16207' },
  appello: { nome: 'Appello', colore: '#0f766e' },
  affitto: { nome: 'Affitto sala', colore: '#be185d' },
  compensi: { nome: 'Compensi', colore: '#475569' },
  workshop: { nome: 'Workshop', colore: '#e11d48' },
};
// questi arrivano già dalle notizie (con lo stato "da fare"): dalle notifiche si saltano per non vederli due volte
const GIA_IN_NOTIZIE = ['certificato', 'prova', 'prova_invio', 'richiesta'];
const coloreDi = (t) => TIPI[t]?.colore || '#6b7280';
const CHIAVE_VISTE = 'rm-notizie-viste';
const orario = (iso) => {
  const d = new Date(iso), oggi = new Date();
  const stessoGiorno = d.toDateString() === oggi.toDateString();
  const ieri = new Date(oggi.getTime() - 864e5).toDateString() === d.toDateString();
  const h = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  return stessoGiorno ? h : ieri ? `ieri ${h}` : `${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' })} ${h}`;
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function PannelloNotizie({ palestraId }) {
  const router = useRouter();
  const [voci, setVoci] = useState(null);
  const [io, setIo] = useState(null);
  const [vista, setVista] = useState('tutte');   // tutte | dafare | nuove
  const [cerca, setCerca] = useState('');
  const [tipo, setTipo] = useState('');
  const [visteDal, setVisteDal] = useState(null);   // fino a quando le ho già viste (per "nuove")

  const carica = useCallback(async () => {
    const db = supabaseBrowser();
    const { data: s } = await db.auth.getSession();
    const uid = s?.session?.user?.id || null; setIo(uid);
    const [{ data: notizie }, { data: notifiche }] = await Promise.all([
      db.rpc('notizie_segreteria', { p_palestra: palestraId, p_giorni: 7 }),
      db.from('notifiche_staff').select('id, tipo, titolo, testo, url, letta_da, created_at')
        .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(60),
    ]);
    const tutte = [
      ...(notizie || []).map((n) => ({ ...n, id: n.chiave })),
      ...(notifiche || []).filter((n) => !GIA_IN_NOTIZIE.includes(n.tipo)).map((n) => ({ id: `n${n.id}`, notifica: n.id, tipo: n.tipo, quando: n.created_at, titolo: n.titolo, testo: n.testo,
        url: n.url, da_fare: false, letta: uid ? (n.letta_da || []).includes(uid) : true })),
    ].sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
    setVoci(tutte);
  }, [palestraId]);

  useEffect(() => {
    // il pannello c'è solo sugli schermi larghi: altrove non si legge niente (resta la campanella)
    const largo = () => window.matchMedia('(min-width: 1500px)').matches;
    try { setVisteDal(localStorage.getItem(CHIAVE_VISTE) || ''); } catch { setVisteDal(''); }
    if (largo()) carica();
    const t = setInterval(() => { if (document.visibilityState === 'visible' && largo()) carica(); }, 60000);
    return () => clearInterval(t);
  }, [carica]);

  const nuova = (v) => (v.notifica ? !v.letta : visteDal !== null && String(v.quando) > (visteDal || ''));
  const q = norm(cerca.trim());
  const filtrate = useMemo(() => (voci || []).filter((v) => (vista === 'tutte' || (vista === 'dafare' && v.da_fare) || (vista === 'nuove' && nuova(v)))
    && (!tipo || v.tipo === tipo) && (!q || norm(`${v.titolo} ${v.testo}`).includes(q))), [voci, vista, tipo, q, visteDal]); // eslint-disable-line react-hooks/exhaustive-deps
  const nDaFare = (voci || []).filter((v) => v.da_fare).length;
  const nNuove = (voci || []).filter(nuova).length;
  const tipiPresenti = [...new Set((voci || []).map((v) => v.tipo))];

  function segnaViste() {
    const ora = new Date().toISOString();
    try { localStorage.setItem(CHIAVE_VISTE, ora); } catch { /* niente */ }
    setVisteDal(ora);
    supabaseBrowser().rpc('segna_notifiche_lette', { p_id: null }).then(() => carica());
  }
  async function apri(v) {
    if (v.notifica && !v.letta) await supabaseBrowser().rpc('segna_notifiche_lette', { p_id: v.notifica });
    if (v.url) router.push(v.url);
  }

  return (
    <aside className="pn" aria-label="Notizie della segreteria">
      <div className="pn-testa">
        <strong>Notizie</strong>
        <span className="piccolo muto">ultimi 7 giorni</span>
        {nNuove > 0 && <button type="button" className="link-btn piccolo" onClick={segnaViste}>segna viste</button>}
      </div>
      <div className="pn-schede" role="tablist">
        {[['tutte', 'Tutte', voci?.length || 0], ['dafare', 'Da fare', nDaFare], ['nuove', 'Nuove', nNuove]].map(([k, t, n]) => (
          <button key={k} type="button" role="tab" aria-selected={vista === k} onClick={() => setVista(k)}>
            {t} {n > 0 && <span className={k === 'dafare' ? 'pn-n rosso' : 'pn-n'}>{n}</span>}
          </button>
        ))}
      </div>
      <div className="pn-filtri">
        <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nome o corso" aria-label="Cerca nelle notizie" />
        {tipiPresenti.length > 1 && (
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
            <option value="">Tutto</option>
            {tipiPresenti.map((t) => <option key={t} value={t}>{TIPI[t]?.nome || t}</option>)}
          </select>
        )}
      </div>
      <ul className="pn-lista">
        {voci === null && <li className="pn-vuoto">Carico…</li>}
        {voci !== null && filtrate.length === 0 && (
          <li className="pn-vuoto">{vista === 'dafare' ? 'Niente in attesa: tutto a posto.' : vista === 'nuove' ? 'Nessuna novità.' : 'Niente negli ultimi 7 giorni.'}</li>
        )}
        {filtrate.slice(0, 80).map((v) => (
          <li key={v.id}>
            <button type="button" className={`pn-voce${nuova(v) ? ' nuova' : ''}${v.da_fare ? ' dafare' : ''}`} style={{ '--t': coloreDi(v.tipo) }} onClick={() => apri(v)}>
              <span className="pn-riga1">
                <span className="pn-tipo">{TIPI[v.tipo]?.nome || 'Avviso'}</span>
                <em>{orario(v.quando)}</em>
              </span>
              <strong>{v.titolo}</strong>
              {v.testo && <span className="pn-testo">{v.testo}</span>}
              {v.da_fare && <span className="pn-azione">{v.tipo === 'certificato' ? 'Verifica →' : v.tipo === 'richiesta' ? 'Conferma →' : 'Apri →'}</span>}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
