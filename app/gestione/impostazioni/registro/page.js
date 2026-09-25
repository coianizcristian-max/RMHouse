import Link from 'next/link';
import { impostazioni } from '../dati';
import { dataBreve, ora } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const GRUPPI = {
  incassi: ['Incassi', ['pagamenti']],
  documenti: ['Ricevute', ['ricevute']],
  iscrizioni: ['Iscrizioni', ['iscrizioni']],
  rate: ['Rate', ['rate']],
  persone: ['Persone', ['allievi', 'account']],
  certificati: ['Certificati', ['certificati']],
  struttura: ['Corsi e abbonamenti', ['corsi', 'orari', 'tipi_abbonamento']],
  staff: ['Staff', ['staff']],
};
const TABELLE = { pagamenti: 'Incasso', ricevute: 'Documento', iscrizioni: 'Iscrizione', rate: 'Rata', allievi: 'Persona',
  account: 'Chi paga', certificati: 'Certificato', corsi: 'Corso', orari: 'Orario', tipi_abbonamento: 'Abbonamento', staff: 'Staff' };
const CAMPI = { stato: 'stato', importo_cent: 'importo', data_fine: 'fine', data_inizio: 'inizio', metodo: 'metodo', annullata: 'annullata',
  nome: 'nome', cognome: 'cognome', email: 'email', telefono: 'telefono', note: 'note', scadenza: 'scadenza', corso_id: 'corso',
  tipo_abbonamento_id: 'abbonamento', prezzo_cent: 'prezzo', insegnante_id: 'insegnante', sala_id: 'sala', ora_inizio: 'ora',
  giorno_settimana: 'giorno', certificato_scadenza: 'certificato', pagamento_id: 'pagamento', sconto_cent: 'sconto' };
const PER_PAGINA = 100;

const valore = (k, v) => {
  if (v == null) return '—';
  if (k.endsWith('_cent') && typeof v === 'number') return `${(v / 100).toFixed(2).replace('.', ',')} €`;
  if (typeof v === 'boolean') return v ? 'sì' : 'no';
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  if (/^[0-9a-f-]{36}$/.test(t)) return '…';
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
};

// Registro: chi ha fatto cosa, e quando
export default async function Registro({ searchParams }) {
  const { gruppo = '', chi = '', giorni = '30', pagina = '1' } = await searchParams;
  const { supabase, staff } = await impostazioni('id');
  const n = Math.max(1, parseInt(pagina, 10) || 1);
  const g = ['1', '7', '30', '365'].includes(giorni) ? parseInt(giorni, 10) : 30;

  let q = supabase.from('registro_azioni').select('*', { count: 'exact' }).eq('palestra_id', staff.palestra_id)
    .gte('quando', new Date(Date.now() - g * 86400000).toISOString());
  if (GRUPPI[gruppo]) q = q.in('tabella', GRUPPI[gruppo][1]);
  if (chi) q = q.eq('chi', chi);
  const [{ data: righe, count }, { data: nomi }] = await Promise.all([
    q.order('quando', { ascending: false }).range((n - 1) * PER_PAGINA, n * PER_PAGINA - 1),
    supabase.from('registro_azioni').select('chi').eq('palestra_id', staff.palestra_id).not('chi', 'is', null)
      .order('quando', { ascending: false }).limit(1000),
  ]);
  const persone = [...new Set((nomi || []).map((x) => x.chi))].sort();
  const link = (c) => {
    const u = new URLSearchParams(Object.entries({ gruppo, chi, giorni, ...c }).filter(([, v]) => v));
    return `/gestione/impostazioni/registro?${u}`;
  };

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Registro delle azioni</h1>
        <p>Chi ha incassato, emesso, annullato, iscritto, modificato o cancellato cosa. Non si modifica e non si cancella.</p>
      </div>

      <div className="pastiglie">
        {[['1', 'Oggi'], ['7', '7 giorni'], ['30', '30 giorni'], ['365', 'Un anno']].map(([k, t]) => (
          <Link key={k} className="stato-pillola" aria-current={String(g) === k ? 'true' : undefined} href={link({ giorni: k, pagina: '' })}>{t}</Link>
        ))}
      </div>
      <div className="pastiglie">
        <Link className="stato-pillola" aria-current={!gruppo ? 'true' : undefined} href={link({ gruppo: '', pagina: '' })}>Tutto</Link>
        {Object.entries(GRUPPI).map(([k, [t]]) => (
          <Link key={k} className="stato-pillola" aria-current={gruppo === k ? 'true' : undefined} href={link({ gruppo: k, pagina: '' })}>{t}</Link>
        ))}
      </div>
      {persone.length > 0 && (
        <div className="pastiglie">
          <Link className="stato-pillola eti" aria-current={!chi ? 'true' : undefined} href={link({ chi: '', pagina: '' })}>Chiunque</Link>
          {persone.map((p) => (
            <Link key={p} className="stato-pillola eti" aria-current={chi === p ? 'true' : undefined} href={link({ chi: p, pagina: '' })}>{p}</Link>
          ))}
        </div>
      )}

      {(righe || []).length === 0 ? <div className="vuoto">Nessuna azione con questi filtri.</div> : (
        <div className="tabella-scorre">
          <table className="tabella-persone">
            <thead><tr><th>Quando</th><th>Chi</th><th>Cosa</th><th className="col-desktop">Cambiato</th></tr></thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <td className="piccolo" style={{ whiteSpace: 'nowrap' }}>{dataBreve(r.quando)}<div className="muto">{ora(r.quando)}</div></td>
                  <td className="piccolo">{r.chi || '—'}</td>
                  <td>
                    <span className={`tag ${r.operazione === 'cancellazione' ? 'tag-rosso' : r.operazione === 'inserimento' ? 'tag-ok' : 'tag-neutro'}`}>
                      {r.operazione}
                    </span>{' '}
                    <span className="piccolo muto">{TABELLE[r.tabella] || r.tabella}</span>
                    <div className="piccolo">{r.descrizione}</div>
                  </td>
                  <td className="col-desktop piccolo">
                    {r.modifiche && Object.entries(r.modifiche).slice(0, 4).map(([k, [prima, dopo]]) => (
                      <div key={k}><span className="muto">{CAMPI[k] || k}:</span> {valore(k, prima)} → <strong>{valore(k, dopo)}</strong></div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {count > PER_PAGINA && (
        <div className="azioni" style={{ marginTop: 14, alignItems: 'center' }}>
          {n > 1 && <Link className="btn btn-piccolo" href={link({ pagina: String(n - 1) })}>‹ Più recenti</Link>}
          <span className="piccolo muto">{(n - 1) * PER_PAGINA + 1}–{Math.min(n * PER_PAGINA, count)} di {count}</span>
          {n * PER_PAGINA < count && <Link className="btn btn-piccolo" href={link({ pagina: String(n + 1) })}>Meno recenti ›</Link>}
        </div>
      )}
    </>
  );
}
