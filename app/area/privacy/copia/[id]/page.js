import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { utenteCorrente } from '@/lib/utente';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { raccogliDati } from '@/lib/datiPersona';
import { euro, dataBreve } from '@/lib/formato';
import StampaArea from '../../../firme/[id]/StampaArea';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'I miei dati · Ritmo Metropolitano' };

const TIPO_DOC = { ricevuta: 'Ricevuta', fattura: 'Fattura', nota_credito: 'Nota di credito' };
const Tabella = ({ titolo, righe, colonne, vuoto = 'Niente.' }) => (
  <section className="copia-sezione">
    <h2>{titolo} <span className="muto">· {righe?.length || 0}</span></h2>
    {!righe?.length ? <p className="muto">{vuoto}</p> : (
      <div className="tabella-scorre">
        <table><thead><tr>{colonne.map(([t]) => <th key={t}>{t}</th>)}</tr></thead>
          <tbody>{righe.map((r, i) => <tr key={i}>{colonne.map(([t, f]) => <td key={t}>{f(r) ?? '—'}</td>)}</tr>)}</tbody>
        </table>
      </div>
    )}
  </section>
);

// La copia dei dati in chiaro: si legge sul telefono e si salva in PDF
export default async function CopiaDati({ params }) {
  const { id } = await params;
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/privacy');
  const db = supabaseAdmin();
  // solo le persone dell'account di chi è entrato (sé e i figli)
  const { data: mio } = await db.from('allievi').select('id, account!inner ( user_id )').eq('id', id).eq('account.user_id', user.id).maybeSingle();
  if (!mio) notFound();
  const { allievo: a, dati: d } = await raccogliDati(db, id);
  const p = d.persona; const c = d.chi_paga || {};
  const presenti = (d.presenze || []).filter((x) => x.presente).length;

  return (
    <div className="copia-dati">
      <div className="senza-stampa firma-area-barra">
        <Link prefetch={false} className="torna" href="/area/privacy">I miei dati</Link>
        <StampaArea />
      </div>
      <h1>I dati di {a.nome} {a.cognome}</h1>
      <p className="muto piccolo">Estratti il {new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' })}.
        È tutto quello che la scuola conserva. Le foto dei certificati non sono incluse.</p>

      <section className="copia-sezione">
        <h2>Anagrafica</h2>
        <dl className="copia-dl">
          <dt>Nome</dt><dd>{p.nome} {p.cognome}</dd>
          <dt>Nascita</dt><dd>{[p.luogo_nascita, p.data_nascita && dataBreve(p.data_nascita)].filter(Boolean).join(', ') || '—'}</dd>
          <dt>Codice fiscale</dt><dd>{p.codice_fiscale || '—'}</dd>
          <dt>Tessera</dt><dd>{p.tessera || '—'}</dd>
          <dt>Certificato</dt><dd>{p.certificato_scadenza ? `scade il ${dataBreve(p.certificato_scadenza)}` : '—'}</dd>
          <dt>Consensi</dt><dd>promozioni {c.consenso_marketing ? 'sì' : 'no'} · gruppo WhatsApp {p.consenso_whatsapp == null ? '—' : p.consenso_whatsapp ? 'sì' : 'no'} · foto e video {p.consenso_immagini == null ? '—' : p.consenso_immagini ? 'sì' : 'no'}</dd>
          <dt>Chi paga</dt><dd>{[`${c.nome || ''} ${c.cognome || ''}`.trim(), c.telefono, c.email].filter(Boolean).join(' · ') || '—'}</dd>
          <dt>Indirizzo</dt><dd>{[c.indirizzo, c.cap, c.citta, c.provincia].filter(Boolean).join(' ') || p.indirizzo || '—'}</dd>
          <dt>Privacy</dt><dd>{c.consenso_privacy_at ? `accettata il ${dataBreve(c.consenso_privacy_at)}` : '—'}</dd>
        </dl>
      </section>

      <Tabella titolo="Moduli firmati" righe={d.moduli_firmati} vuoto="Nessun modulo firmato."
        colonne={[['Modulo', (r) => r.titolo], ['Firmato', (r) => `${dataBreve(r.firmato_at)} da ${r.firmatario}`],
                  ['Scelte', (r) => r.risposte ? Object.entries(r.risposte).map(([k, v]) => `${k}: ${v ? 'sì' : 'no'}`).join(' · ') : '—']]} />
      <Tabella titolo="Iscrizioni" righe={d.iscrizioni}
        colonne={[['Corso', (r) => r.corsi?.nome], ['Abbonamento', (r) => r.tipi_abbonamento?.nome], ['Dal', (r) => dataBreve(r.data_inizio)], ['Al', (r) => dataBreve(r.data_fine)], ['Stato', (r) => r.stato]]} />
      <Tabella titolo="Pagamenti" righe={d.pagamenti}
        colonne={[['Data', (r) => dataBreve(r.pagato_at || r.created_at)], ['Descrizione', (r) => r.descrizione], ['Importo', (r) => euro(r.importo_cent)], ['Metodo', (r) => r.metodo], ['Stato', (r) => r.stato]]} />
      <Tabella titolo="Ricevute e fatture" righe={d.ricevute}
        colonne={[['Documento', (r) => `${TIPO_DOC[r.tipo_documento] || r.tipo_documento} ${r.numero}/${r.anno}${r.annullata ? ' (annullato)' : ''}`], ['Data', (r) => dataBreve(r.data)], ['Descrizione', (r) => r.descrizione], ['Totale', (r) => euro(r.importo_cent + r.iva_cent)]]} />
      <section className="copia-sezione">
        <h2>Presenze <span className="muto">· {d.presenze?.length || 0}</span></h2>
        <p className="muto">{presenti} presenze e {(d.presenze?.length || 0) - presenti} assenze registrate.</p>
      </section>
      <Tabella titolo="Lezioni di prova" righe={d.prove}
        colonne={[['Corso', (r) => r.corsi?.nome], ['Quando', (r) => r.lezioni?.inizio ? dataBreve(r.lezioni.inizio) : dataBreve(r.created_at)], ['Stato', (r) => r.stato]]} />
      <Tabella titolo="Certificati medici" righe={d.certificati}
        colonne={[['Caricato', (r) => dataBreve(r.caricato_at)], ['Scadenza', (r) => dataBreve(r.scadenza)], ['Stato', (r) => r.stato]]} />
      <Tabella titolo="Quote annuali" righe={d.quote_annuali}
        colonne={[['Stagione', (r) => r.stagione], ['Data', (r) => dataBreve(r.data)], ['Importo', (r) => euro(r.importo_cent)]]} />
      <Tabella titolo="Rate" righe={d.rate}
        colonne={[['Descrizione', (r) => `${r.descrizione} (${r.numero}/${r.di})`], ['Scadenza', (r) => dataBreve(r.scadenza)], ['Importo', (r) => euro(r.importo_cent)], ['Stato', (r) => r.stato]]} />
      <Tabella titolo="Abbonamenti in APP Palestre" righe={d.storico_abbonamenti}
        colonne={[['Abbonamento', (r) => r.abbonamento], ['Dal', (r) => dataBreve(r.dal)], ['Al', (r) => dataBreve(r.al)], ['Valore', (r) => r.valore_cent != null ? euro(r.valore_cent) : '—']]} />
      <Tabella titolo="Messaggi inviati" righe={d.messaggi_inviati}
        colonne={[['Data', (r) => dataBreve(r.created_at)], ['Oggetto', (r) => r.oggetto || r.evento], ['Stato', (r) => r.stato]]} />
    </div>
  );
}
