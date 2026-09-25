import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { euro, oggiISO, dataBreve } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const METODI = { contanti: 'Contanti', pos: 'POS', bonifico: 'Bonifico', online: 'Online', stripe: 'Online', assegno: 'Assegno', altro: 'Altro' };

// Riepilogo dei conti: quanto è entrato, cosa manca da incassare, cosa manca da mettere in regola
export default async function RiepilogoConti() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const oggi = oggiISO();
  const inizioMese = oggi.slice(0, 8) + '01';
  const inizioAnno = oggi.slice(0, 5) + '01-01';

  const [{ data: giorno }, { data: mese }, { data: anno }, { data: mancanti }, { data: attesa }, { data: rateScadute },
         { data: prossime }, { data: ultimi }, { data: fatture }] = await Promise.all([
    supabase.rpc('incassi_periodo', { p_palestra: p, p_dal: oggi, p_al: oggi }),
    supabase.rpc('incassi_periodo', { p_palestra: p, p_dal: inizioMese, p_al: oggi }),
    supabase.rpc('incassi_periodo', { p_palestra: p, p_dal: inizioAnno, p_al: oggi }),
    supabase.rpc('ricevute_mancanti', { p_palestra: p, p_dal: inizioAnno, p_al: oggi }),
    supabase.from('pagamenti').select('importo_cent').eq('palestra_id', p).eq('stato', 'in_attesa'),
    supabase.from('v_rate').select('importo_cent').eq('palestra_id', p).eq('scaduta', true),
    supabase.from('v_rate').select('id, allievo_id, allievo_nome, allievo_cognome, descrizione, numero, di, scadenza, giorni, importo_cent')
      .eq('palestra_id', p).eq('stato', 'da_pagare').gte('giorni', 0).lte('giorni', 14).order('scadenza').limit(6),
    supabase.from('v_incassi').select('id, descrizione, importo_cent, metodo, pagato_at, titolare_nome, titolare_cognome')
      .eq('palestra_id', p).eq('stato', 'pagato').order('pagato_at', { ascending: false }).limit(8),
    supabase.from('fatture').select('id').eq('palestra_id', p).eq('tipo', 'passiva').eq('stato', 'da_registrare'),
  ]);

  const somma = (x) => (x || []).reduce((s, r) => s + r.importo_cent, 0);
  const daIncassare = somma(attesa) + somma(rateScadute);
  const metodi = Object.entries(mese?.per_metodo || {}).sort((a, b) => b[1] - a[1]);

  const problemi = [
    ['Incassi dell\'anno senza ricevuta', mancanti?.length || 0, '/gestione/ricevute', 'urgente'],
    ['Rate scadute', rateScadute?.length || 0, '/gestione/rate?vista=scadute', 'urgente'],
    ['Pagamenti in attesa', attesa?.length || 0, '/gestione/incassi?stato=attesa', 'attenzione'],
    ['Fatture fornitori da registrare', fatture?.length || 0, '/gestione/fatture', 'attenzione'],
  ].filter(([, n]) => n > 0);

  return (
    <>
      <div className="cruscotto-testa">
        <div>
          <div className="occhiello">Conti</div>
          <h1>Riepilogo dei conti</h1>
        </div>
        <div className="azioni">
          <Link className="btn btn-primario" href="/gestione/incassi">Registra un incasso</Link>
          <Link className="btn" href="/gestione/rate">Rate</Link>
          <Link className="btn" href="/gestione/commercialista">Per il commercialista</Link>
        </div>
      </div>

      <div className="kpi">
        <div className="tessera tessera-rossa"><div className="etichetta">Incassato oggi</div><div className="cifra">{euro(giorno?.incassato_cent || 0)}</div></div>
        <Link className="tessera" href="/gestione/incassi"><div className="etichetta">Nel mese</div><div className="cifra">{euro(mese?.incassato_cent || 0)}</div></Link>
        <Link className="tessera" href="/gestione/statistiche"><div className="etichetta">Da inizio anno</div><div className="cifra">{euro(anno?.incassato_cent || 0)}</div></Link>
        <Link className={`tessera${daIncassare ? ' tessera-nera' : ''}`} href="/gestione/rate?vista=scadute">
          <div className="etichetta">Da incassare</div><div className="cifra">{euro(daIncassare)}</div>
          <div className="sotto">in attesa e rate scadute</div></Link>
        <Link className="tessera" href="/gestione/ricevute"><div className="etichetta">Senza ricevuta</div><div className="cifra">{mancanti?.length || 0}</div>
          <div className="sotto">incassi da inizio anno</div></Link>
        <Link className="tessera" href="/gestione/fatture"><div className="etichetta">Fatture da registrare</div><div className="cifra">{fatture?.length || 0}</div></Link>
      </div>

      <div className="cruscotto-3">
        <section className="pannello">
          <h2>Da mettere in regola</h2>
          {problemi.length === 0 ? <div className="vuoto">Tutto in ordine.</div> : (
            <div className="da-fare compatta">
              {problemi.map(([t, n, href, tono]) => (
                <Link key={t} href={href} className={tono}><span>{t}</span><span className="conta">{n}</span></Link>
              ))}
            </div>
          )}
          {metodi.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Il mese per metodo</h3>
              <ul className="mini-lista">
                {metodi.map(([k, v]) => (
                  <li key={k}><span className="ml-riga"><span className="ml-testo"><strong>{METODI[k] || k}</strong></span><span>{euro(v)}</span></span></li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="pannello">
          <h2>Ultimi incassi</h2>
          {(ultimi || []).length === 0 && <div className="vuoto">Nessun incasso registrato in RMHouse.</div>}
          <ul className="mini-lista">
            {(ultimi || []).map((u) => (
              <li key={u.id}>
                <span className="ml-riga">
                  <span className="ml-testo">
                    <strong>{u.descrizione}</strong>
                    <span className="piccolo muto">{[u.titolare_nome, u.titolare_cognome].filter(Boolean).join(' ') || '—'} · {dataBreve(u.pagato_at)} · {METODI[u.metodo] || u.metodo}</span>
                  </span>
                  <strong>{euro(u.importo_cent)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="pannello">
          <h2>Rate dei prossimi 14 giorni</h2>
          {(prossime || []).length === 0 && <div className="vuoto">Nessuna rata in arrivo.</div>}
          <ul className="mini-lista">
            {(prossime || []).map((r) => (
              <li key={r.id}>
                <Link href={r.allievo_id ? `/gestione/persone/${r.allievo_id}` : '/gestione/rate'}>
                  <span className="ml-giorni">{r.giorni === 0 ? 'oggi' : `tra ${r.giorni}g`}</span>
                  <span className="ml-testo">
                    <strong>{r.allievo_cognome} {r.allievo_nome}</strong>
                    <span className="piccolo muto">{r.descrizione} · {r.numero}/{r.di}</span>
                  </span>
                  <span className="piccolo">{euro(r.importo_cent)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
