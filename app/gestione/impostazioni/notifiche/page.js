import Link from 'next/link';
import { impostazioni } from '../dati';
import { dataBreve } from '@/lib/formato';
import Riepilogo from './Riepilogo';

export const dynamic = 'force-dynamic';

export default async function PaginaNotifiche() {
  const { supabase, staff, palestra } = await impostazioni('id, riepilogo');
  const [{ data: s }, { data: persone }] = await Promise.all([
    supabase.rpc('stato_notifiche', { p_palestra: staff.palestra_id }),
    supabase.from('staff').select('id, nome, cognome, ruolo, email, user_id').eq('palestra_id', staff.palestra_id)
      .eq('attivo', true).order('nome'),
  ]);

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Email e notifiche</h1>
        <p>Il riepilogo del lunedì, lo stato degli invii e chi dello staff riceve cosa.</p>
      </div>

      <div className="kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="tessera"><div className="etichetta">Email inviate</div><div className="cifra">{s?.inviate_14 ?? 0}</div><div className="sotto">ultimi 14 giorni</div></div>
        <div className="tessera"><div className="etichetta">In coda</div><div className="cifra">{s?.in_coda ?? 0}</div><div className="sotto">partono ogni 5 minuti</div></div>
        <div className={`tessera${s?.errori_14 ? ' tessera-rossa' : ''}`}><div className="etichetta">Non partite</div><div className="cifra">{s?.errori_14 ?? 0}</div><div className="sotto">ultimi 14 giorni</div></div>
        <div className="tessera"><div className="etichetta">Clienti con email</div><div className="cifra">{s?.clienti_con_email ?? 0}</div></div>
        <div className="tessera"><div className="etichetta">Notifiche sul telefono</div><div className="cifra">{s?.clienti_con_notifiche ?? 0}</div>
          <div className="sotto">clienti che le hanno attivate</div></div>
      </div>

      <div className="scheda-due">
        <div>
          <Riepilogo palestra={palestra} />
          {s?.ultimi_errori?.length > 0 && (
            <section className="pannello">
              <h2>Ultime email non partite</h2>
              <ul className="mini-lista">
                {s.ultimi_errori.map((e, i) => (
                  <li key={i}><span className="ml-riga"><span className="ml-testo">
                    <strong>{e.oggetto || '(senza oggetto)'}</strong>
                    <span className="piccolo muto">{dataBreve(e.quando)} · {e.a} · {e.errore}</span>
                  </span></span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside>
          <section className="pannello">
            <h2>Staff</h2>
            <p className="piccolo muto" style={{ marginTop: -4 }}>
              Chi ha un'email riceve il calendario e i messaggi; chi ha l'accesso entra nel gestionale.
            </p>
            <ul className="mini-lista">
              {(persone || []).map((p) => (
                <li key={p.id}><span className="ml-riga">
                  <span className="ml-testo">
                    <strong>{p.nome} {p.cognome || ''}</strong>
                    <span className="piccolo muto">{p.email || 'nessuna email'} · {p.ruolo}</span>
                  </span>
                  {p.user_id ? <span className="tag tag-ok">accesso</span>
                    : p.email ? <span className="tag tag-neutro">solo email</span> : <span className="tag tag-attenzione">senza email</span>}
                </span></li>
              ))}
            </ul>
            <p className="piccolo"><Link href="/gestione/staff">Aggiungi le email in Struttura → Staff</Link></p>
          </section>
          <section className="pannello">
            <h2>Messaggi automatici ai clienti</h2>
            <p className="piccolo muto">Conferma della prova, promemoria, scadenze, compleanni: testi e attivazione.</p>
            <Link className="btn btn-piccolo" href="/gestione/messaggi">Apri i messaggi automatici</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
