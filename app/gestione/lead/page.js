import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { STATI_LEAD, dataBreve, ora, euro, etaAl } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const FILTRI = [
  ['aperti', 'Da seguire', ['nuovo', 'prova_prenotata', 'prova_effettuata']],
  ['prova_prenotata', 'Prova prenotata', ['prova_prenotata']],
  ['prova_effettuata', 'Prova fatta', ['prova_effettuata']],
  ['nuovo', 'Da richiamare', ['nuovo']],
  ['perso', 'Non convertiti', ['perso']],
  ['iscritto', 'Iscritti', ['iscritto']],
];
const MOTIVI = { orari: 'Orari', prezzo: 'Prezzo', livello: 'Livello', distanza: 'Distanza', non_mi_e_piaciuto: 'Disciplina', altra_struttura: 'Altra struttura', altro: 'Altro' };

export default async function Lead({ searchParams }) {
  const { stato = 'aperti' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const filtro = FILTRI.find((f) => f[0] === stato) || FILTRI[0];

  const { data: allievi, error } = await supabase
    .from('allievi')
    .select(`id, nome, cognome, data_nascita, is_titolare, stato_lead, motivo_perso, created_at,
             account ( nome, cognome, email, telefono ),
             prove ( id, stato, prezzo_cent, created_at, corsi ( nome ), lezioni ( inizio ), pagamenti ( stato ) )`)
    .eq('palestra_id', staff.palestra_id)
    .in('stato_lead', filtro[2])
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <>
      <h1>Lead</h1>
      <div className="filtri">
        {FILTRI.map(([k, l]) => <Link key={k} href={`/gestione/lead?stato=${k}`} aria-current={k === filtro[0] ? 'true' : undefined}>{l}</Link>)}
      </div>
      {error && <div className="errore">Impossibile caricare i lead.</div>}
      {allievi?.length === 0 && <div className="vuoto">Nessun contatto in questo elenco.</div>}
      <ul className="elenco">
        {allievi?.map((a) => {
          const prova = [...(a.prove || [])].sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
          const daPagare = prova?.prezzo_cent > 0 && prova.pagamenti?.stato !== 'pagato' && prova.stato !== 'annullata';
          return (
            <li key={a.id} className="persona" style={{ alignItems: 'start' }}>
              <div>
                <Link className="persona-nome" href={`/gestione/persone/${a.id}`}>{a.cognome} {a.nome}</Link>
                {!a.is_titolare && <span className="piccolo muto"> · {etaAl(a.data_nascita)} anni</span>}
                <div className="piccolo muto">
                  {!a.is_titolare && <>Genitore: {a.account.nome} {a.account.cognome} · </>}
                  <a href={`tel:${a.account.telefono}`}>{a.account.telefono}</a>
                  {a.account.telefono && (
                    <> · <a href={`https://wa.me/${('39' + a.account.telefono).replace(/[^0-9]/g, '').replace(/^3939/, '39')}`}
                           target="_blank" rel="noopener">WhatsApp</a></>
                  )}
                  {' · '}<a href={`mailto:${a.account.email}`}>{a.account.email}</a>
                </div>
                <div className="piccolo" style={{ marginTop: 4 }}>
                  {prova
                    ? <>{prova.corsi?.nome}, {dataBreve(prova.lezioni.inizio)} alle {ora(prova.lezioni.inizio)}</>
                    : <>Nessun orario scelto · richiesta del {dataBreve(a.created_at)}</>}
                  {a.motivo_perso && <> · motivo: {MOTIVI[a.motivo_perso] || a.motivo_perso}</>}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                <span className={`tag ${a.stato_lead === 'iscritto' ? 'tag-ok' : a.stato_lead === 'perso' ? 'tag-neutro' : 'tag-tenue'}`}>{STATI_LEAD[a.stato_lead]}</span>
                {daPagare && <span className="tag tag-attenzione">{euro(prova.prezzo_cent)} da incassare</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
