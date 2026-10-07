'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const quando = (iso) => {
  const d = new Date(iso), min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return 'ora';
  if (min < 60) return `${min} min fa`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h fa`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
};

// La campanella della segreteria: nuovi clienti, certificati, richieste dall'app, pagamenti, prove…
// Il numero si aggiorna a ogni cambio di pagina (legge dal database, niente lavoro per Vercel).
export default function Campanella() {
  const path = usePathname();
  const router = useRouter();
  const [io, setIo] = useState(null);
  const [nonLette, setNonLette] = useState(0);
  const [aperta, setAperta] = useState(false);
  const [elenco, setElenco] = useState(null);

  // il numero si rilegge al massimo una volta al minuto (non a ogni pagina): una richiesta in meno al database
  // per ogni cambio di pagina, che su un database piccolo si sente
  const ultimoControllo = useRef(0);
  useEffect(() => {
    if (Date.now() - ultimoControllo.current < 60_000) return;
    ultimoControllo.current = Date.now();
    const db = supabaseBrowser();
    db.auth.getSession().then(async ({ data }) => {
      const uid = data?.session?.user?.id; if (!uid) return;
      setIo(uid);
      const { count } = await db.from('notifiche_staff').select('id', { count: 'exact', head: true })
        .not('letta_da', 'cs', `{${uid}}`).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
      setNonLette(count || 0);
    });
  }, [path]);

  async function apri() {
    setAperta(true);
    const { data } = await supabaseBrowser().from('notifiche_staff')
      .select('id, tipo, titolo, testo, url, letta_da, created_at').order('created_at', { ascending: false }).limit(40);
    setElenco(data || []);
  }
  async function leggiTutte() {
    await supabaseBrowser().rpc('segna_notifiche_lette', { p_id: null });
    setNonLette(0); setElenco((e) => (e || []).map((n) => ({ ...n, letta_da: [...n.letta_da, io] })));
  }
  async function vai(n) {
    if (!n.letta_da.includes(io)) { await supabaseBrowser().rpc('segna_notifiche_lette', { p_id: n.id }); setNonLette((x) => Math.max(0, x - 1)); }
    setAperta(false);
    if (n.url) router.push(n.url);
  }

  return (
    <>
      <button type="button" className="campanella" onClick={apri} aria-label={`Notifiche${nonLette ? `, ${nonLette} nuove` : ''}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {nonLette > 0 && <span className="campanella-numero">{nonLette > 99 ? '99+' : nonLette}</span>}
      </button>
      {aperta && createPortal(
        <div className="cronologia-sfondo" onClick={() => setAperta(false)}>
          <aside className="cronologia" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Notifiche">
            <div className="cronologia-testa">
              <div><strong>Notifiche</strong><span className="piccolo muto">le ultime arrivate per te</span></div>
              <button type="button" className="link-btn piccolo" onClick={() => setAperta(false)}>Chiudi</button>
            </div>
            <div className="cronologia-corpo">
              {elenco === null && <p className="muto">Carico…</p>}
              {elenco?.length === 0 && <p className="muto">Nessuna notifica.</p>}
              {elenco?.some((n) => !n.letta_da.includes(io)) && (
                <button type="button" className="link-btn piccolo" style={{ marginBottom: 8 }} onClick={leggiTutte}>Segna tutte come lette</button>
              )}
              <ul className="notifiche-elenco">
                {(elenco || []).map((n) => (
                  <li key={n.id} className={n.letta_da.includes(io) ? '' : 'nuova'}>
                    <button type="button" onClick={() => vai(n)}>
                      <strong>{n.titolo}</strong>
                      {n.testo && <span>{n.testo}</span>}
                      <em>{quando(n.created_at)}</em>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="piccolo muto" style={{ marginTop: 12 }}>
                <Link prefetch={false} href="/gestione/notifiche" onClick={() => setAperta(false)}>Notifiche sul telefono e quali ricevere ›</Link>
              </p>
            </div>
          </aside>
        </div>, document.body)}
    </>
  );
}
