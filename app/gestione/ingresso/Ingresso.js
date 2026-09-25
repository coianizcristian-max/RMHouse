'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora } from '@/lib/formato';

const TITOLO = { ok: 'Tutto in regola', attenzione: 'Può entrare, ma…', bloccato: 'Non può entrare' };

function Esito({ e }) {
  if (e.errore) return <div className="ingresso-esito bloccato"><strong>{e.errore}</strong></div>;
  return (
    <div className={`ingresso-esito ${e.esito}`}>
      <div className="ie-segno" aria-hidden="true">{e.esito === 'ok' ? '✓' : e.esito === 'attenzione' ? '!' : '✕'}</div>
      <div>
        <div className="ie-titolo">{TITOLO[e.esito]}</div>
        <Link href={`/gestione/persone/${e.allievo_id}`} className="ie-nome">{e.nome} {e.cognome}</Link>
        <div className="piccolo">
          {e.abbonamento || 'nessun abbonamento'}
          {e.ingressi_residui != null && ` · restano ${e.ingressi_residui} ingressi`}
        </div>
        <div className="piccolo">
          {e.lezione ? `${e.lezione} delle ${ora(e.lezione_inizio)}${e.presenza ? ' · presenza segnata' : ''}` : 'Nessuna sua lezione adesso: presenza non segnata'}
        </div>
        {e.avvisi?.length > 0 && <ul className="ie-avvisi">{e.avvisi.map((a) => <li key={a}>{a}</li>)}</ul>}
      </div>
    </div>
  );
}

export default function Ingresso({ palestraId, esitoIniziale, oggi }) {
  const router = useRouter();
  const [esito, setEsito] = useState(esitoIniziale);
  const [cerca, setCerca] = useState('');
  const [trovati, setTrovati] = useState([]);

  // tolgo il codice dall'indirizzo: ricaricando la pagina non si registra due volte
  useEffect(() => { if (esitoIniziale) router.replace('/gestione/ingresso', { scroll: false }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function trova(testo) {
    setCerca(testo);
    if (testo.trim().length < 2) { setTrovati([]); return; }
    const { data } = await supabaseBrowser().from('v_persone').select('id, nome, cognome')
      .eq('palestra_id', palestraId).ilike('ricerca', `%${testo.trim().toLowerCase()}%`).limit(8);
    setTrovati(data || []);
  }

  async function registra(id) {
    const { data, error } = await supabaseBrowser().rpc('registra_ingresso', { p_allievo: id });
    setEsito(error ? { errore: 'Ingresso non registrato.' } : data);
    setCerca(''); setTrovati([]);
    router.replace('/gestione/ingresso');
    router.refresh();
  }

  const conta = (k) => oggi.filter((i) => i.esito === k).length;

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Oggi</div>
        <h1>Ingressi</h1>
        <p>Inquadra il pass del cliente con la fotocamera del telefono (quella normale): si apre questa pagina con l'esito.
          Oppure cerca la persona qui sotto.</p>
      </div>

      {esito && <Esito e={esito} />}

      <div className="barra-cerca">
        <input value={cerca} onChange={(e) => trova(e.target.value)} placeholder="Cerca per nome e registra l'ingresso" aria-label="Cerca" />
      </div>
      {trovati.length > 0 && (
        <div className="pastiglie">
          {trovati.map((t) => (
            <button key={t.id} type="button" className="stato-pillola" onClick={() => registra(t.id)}>{t.cognome} {t.nome}</button>
          ))}
        </div>
      )}

      <h2 className="sezione">Oggi · {oggi.length} ingressi{conta('bloccato') ? ` · ${conta('bloccato')} fermati` : ''}</h2>
      {oggi.length === 0 && <div className="vuoto">Nessun ingresso registrato oggi.</div>}
      <ul className="mini-lista">
        {oggi.map((i) => (
          <li key={i.id}>
            <Link href={`/gestione/persone/${i.allievi?.id}`}>
              <span className={`ml-giorni esito-${i.esito}`}>{ora(i.quando)}</span>
              <span className="ml-testo">
                <strong>{i.allievi?.nome} {i.allievi?.cognome}</strong>
                <span className="piccolo muto">{[i.lezioni?.corsi?.nome, ...(i.avvisi || [])].filter(Boolean).join(' · ') || 'in regola'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
