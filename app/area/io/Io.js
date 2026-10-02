'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';
import CaricaCertificato from '../../CaricaCertificato';
import InstallaApp from '../InstallaApp';
import ModificaDati from './ModificaDati';
import AggiungiFiglio from './AggiungiFiglio';
import Notifiche from '../Notifiche';

const oggi = () => new Date().toISOString().slice(0, 10);
const tra = (giorni) => new Date(Date.now() + giorni * 86400000).toISOString().slice(0, 10);
const anni = (nascita) => {
  if (!nascita) return null;
  const n = new Date(nascita), o = new Date();
  return o.getFullYear() - n.getFullYear() - (o < new Date(o.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
};

// "Io": tutto di me (e dei figli) in una pagina: scadenze, abbonamenti, stagione, documenti
export default function Io({ titolare, persone, anagrafica = [], richieste = [], notifiche = {}, moduliDaFirmare = 0 }) {
  const router = useRouter();
  const [scelta, setScelta] = useState(persone[0]?.id || null);
  const [carica, setCarica] = useState(false);
  const [storico, setStorico] = useState(false);
  const [firme, setFirme] = useState(false);
  const [modifica, setModifica] = useState(false);
  const [fatto, setFatto] = useState('');
  const p = persone.find((x) => x.id === scelta) || persone[0];

  async function esci() {
    await supabaseBrowser().auth.signOut();
    router.replace('/area/accedi'); router.refresh();
  }
  if (!p) return <div className="vuoto">Nessuna persona collegata a questo accesso.</div>;

  const abb = p.attivi[0];
  const abbStato = abb ? (abb.al < tra(15) ? 'giallo' : 'verde') : 'rosso';
  const certStato = p.certificato_ok ? (p.certificato_scadenza && p.certificato_scadenza < tra(30) ? 'giallo' : 'verde') : p.certificato_in_verifica ? 'giallo' : 'rosso';
  // quota annuale: vale 12 mesi dal pagamento
  const quotaValida = !p.quota_mancante && p.quota;
  const quotaScaduta = p.quota_mancante && p.quota;
  const quotaStato = quotaValida ? (p.quota.valida_fino < tra(30) ? 'giallo' : 'verde') : abb ? 'rosso' : 'grigio';
  const eta = anni(p.nascita);

  return (
    <div className="area-casa area-io">
      {persone.length > 1 && (
        <div className="ac-giorni io-persone" role="tablist" aria-label="Persona">
          {persone.map((x) => (
            <button key={x.id} type="button" role="tab" aria-pressed={x.id === p.id} onClick={() => { setScelta(x.id); setCarica(false); setModifica(false); setFatto(''); }}>{x.nome}</button>
          ))}
        </div>
      )}

      <section className="io-testa">
        {p.foto ? <img src={p.foto} alt="" className="io-foto" /> : <span className="io-foto io-iniziali">{(p.nome?.[0] || '') + (p.cognome?.[0] || '')}</span>}
        <span>
          <h1>{p.nome} {p.cognome}</h1>
          <span className="ac-nota">{[eta != null ? `${eta} anni` : null, titolare?.email].filter(Boolean).join(' · ')}</span>
          {anagrafica.some((a) => a.id === p.id) && !modifica && (
            <button type="button" className="link-btn piccolo io-modifica" onClick={() => { setModifica(true); setFatto(''); }}>Modifica i dati</button>
          )}
        </span>
      </section>
      {fatto && <div className="avviso-ok" role="status">{fatto}</div>}
      {modifica && (
        <ModificaDati key={p.id} d={anagrafica.find((a) => a.id === p.id)} onChiudi={(msg) => { setModifica(false); if (msg) setFatto(msg); }} />
      )}

      {/* le quattro cose da tenere in regola: verde ok, giallo a breve, rosso da fare */}
      <section className="io-scadenze">
        <Link prefetch={false} href={abb ? '#abbonamenti' : '/area/acquista'} className={`io-tessera ${abbStato}`}>
          <span>Abbonamento</span>
          <strong>{abb ? `fino al ${dataBreve(abb.al)}` : 'nessuno'}</strong>
          <em>{abb ? (abb.ingressi != null ? `${abb.ingressi} ingressi` : abb.corso) : 'Acquista ›'}</em>
        </Link>
        <button type="button" className={`io-tessera ${certStato}`} onClick={() => setCarica(!carica)}>
          <span>Certificato medico</span>
          <strong>{p.certificato_ok ? `fino al ${dataBreve(p.certificato_scadenza)}` : p.certificato_in_verifica ? 'in verifica' : 'da caricare'}</strong>
          <em>{p.certificato_ok ? 'carica il nuovo ›' : p.certificato_in_verifica ? 'lo stiamo controllando' : 'carica ›'}</em>
        </button>
        <div className={`io-tessera ${quotaStato}`}>
          <span>Quota annuale</span>
          <strong>{quotaValida ? `fino al ${dataBreve(p.quota.valida_fino)}` : quotaScaduta ? `scaduta il ${dataBreve(p.quota.valida_fino)}` : 'da pagare'}</strong>
          <em>{quotaValida ? `pagata il ${dataBreve(p.quota.data)}` : 'si paga con il prossimo abbonamento'}</em>
        </div>
        <div className={`io-tessera ${p.tessera?.numero ? 'verde' : 'grigio'}`}>
          <span>Tessera {p.tessera?.ente || 'ASI'}</span>
          <strong>{p.tessera?.numero ? `n. ${p.tessera.numero}` : 'in arrivo'}</strong>
          <em>{p.tessera?.stagione ? `stagione ${p.tessera.stagione}` : ''}</em>
        </div>
      </section>

      {carica && p.token && (
        <CaricaCertificato token={p.token} nome={p.nome} onFatto={() => { setCarica(false); router.refresh(); }} />
      )}

      {moduliDaFirmare > 0 && (
        <Link prefetch={false} href="/area/moduli" className="ac-avviso rosso">
          <span><strong>{moduliDaFirmare === 1 ? 'Un modulo da firmare' : `${moduliDaFirmare} moduli da firmare`}</strong> · si firmano col dito</span>
          <span aria-hidden="true">›</span>
        </Link>
      )}

      {richieste.filter((r) => r.allievo_id === p.id && (r.stato === 'da_confermare' || Date.now() - new Date(r.created_at) < 30 * 86400000)).length > 0 && (
        <section className="ac-sezione">
          <h2>Le tue richieste</h2>
          <ul className="io-elenco">
            {richieste.filter((r) => r.allievo_id === p.id).slice(0, 5).map((r) => (
              <li key={r.id} className="io-richiesta">
                <span>
                  <strong>{r.tipo === 'abbonamento' ? `${r.dati.abbonamento}` : `Lezione privata con ${r.dati.insegnante}`}</strong>
                  {r.risposta && <span className="piccolo">“{r.risposta}”</span>}
                </span>
                <span className={`tag ${r.stato === 'confermata' ? 'tag-ok' : r.stato === 'da_confermare' ? 'tag-attenzione' : 'tag-neutro'}`}>
                  {r.stato === 'da_confermare' ? (r.tipo === 'abbonamento' ? 'attesa bonifico' : 'in attesa') : r.stato === 'confermata' ? 'confermata' : r.stato === 'rifiutata' ? 'non accettata' : 'ritirata'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ac-sezione">
        <h2>Questa stagione</h2>
        <div className="io-numeri">
          <span><strong>{p.stagione.presenze}</strong>lezioni fatte</span>
          <span><strong>{p.stagione.cancellate}</strong>cancellate</span>
          <span><strong>{p.stagione.recuperi_fatti}</strong>recuperi</span>
          <span><strong>{p.stagione.assenze}</strong>assenze</span>
        </div>
      </section>

      <section className="ac-sezione" id="abbonamenti">
        <h2>Abbonamenti</h2>
        <ul className="ac-abbonamenti">
          {p.attivi.length === 0 && <li><span className="muto">Nessun abbonamento attivo.</span></li>}
          {p.attivi.map((a, i) => (
            <li key={i}>
              <span className="ac-abb"><strong>{a.abbonamento}</strong><span className={a.al < tra(15) ? 'ac-scade' : 'muto'}>fino al {dataBreve(a.al)}</span></span>
              <span className="piccolo muto">{a.corso}{a.stato === 'sospesa' ? ' · sospeso' : ''}{a.ingressi != null ? ` · ${a.ingressi} ingressi` : ''}</span>
            </li>
          ))}
        </ul>
        <div className="io-azioni">
          <Link prefetch={false} className="btn btn-piccolo btn-primario" href="/area/acquista">{p.attivi.length ? 'Rinnova o aggiungi' : 'Acquista un abbonamento'}</Link>
          {p.storico.length > 0 && <button type="button" className="link-btn piccolo" onClick={() => setStorico(!storico)}>{storico ? 'Nascondi lo storico' : `Storico (${p.storico.length})`}</button>}
        </div>
        {storico && (
          <ul className="io-elenco">
            {p.storico.map((s, i) => (
              <li key={i}><span>{s.abbonamento}</span><span className="muto">{s.dal ? dataBreve(s.dal) : ''} – {s.al ? dataBreve(s.al) : ''}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className="ac-sezione">
        <ul className="io-menu">
          <li><Link prefetch={false} href="/area/scuola">La scuola: contatti, orari, staff, corsi<span aria-hidden="true">›</span></Link></li>
          <li><button type="button" onClick={() => setFirme(!firme)}>Documenti firmati <span className="muto">({p.firme.length})</span><span aria-hidden="true">{firme ? '▴' : '›'}</span></button></li>
          {firme && p.firme.map((f, i) => (
            <li key={`f${i}`} className="io-firma"><span>{f.titolo}</span><span className="muto">{dataBreve(f.quando)}</span></li>
          ))}
          <li><Link prefetch={false} href="/area/pagamenti">Pagamenti e ricevute<span aria-hidden="true">›</span></Link></li>
          <li><Link prefetch={false} href="/area/eventi">Eventi e stage<span aria-hidden="true">›</span></Link></li>
          <li><Link prefetch={false} href="/area/moduli">Moduli<span aria-hidden="true">›</span></Link></li>
          <li><Link prefetch={false} href="/area/privacy">I miei dati e privacy<span aria-hidden="true">›</span></Link></li>
        </ul>
      </section>

      <AggiungiFiglio cognome={titolare?.cognome || ''} />

      <Notifiche preferenze={notifiche} />

      <InstallaApp />

      <button type="button" className="btn io-esci" onClick={esci}>Esci</button>
    </div>
  );
}
