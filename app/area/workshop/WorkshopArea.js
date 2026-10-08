'use client';
import Link from 'next/link';
import { euro } from '@/lib/formato';
import { periodo, prezzoDa } from '@/lib/workshop';

// I workshop della scuola nell'app: locandina, quando, con chi, da quanto; e chi della famiglia è già iscritto
export default function WorkshopArea({ workshop }) {
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">La scuola</div>
        <h1>Workshop</h1>
        <p>Lezioni speciali con insegnanti ospiti: tocca un workshop per vedere tutto e iscriverti.</p>
      </div>
      {workshop.length === 0 && <div className="vuoto">Nessun workshop in programma per ora. Quando ce ne sarà uno lo trovi qui.</div>}
      <div className="wa-griglia">
        {workshop.map((w) => {
          const esterno = (w.persone || []).every((p) => p.esterno);
          const da = prezzoDa(w, esterno);
          const iscritti = (w.iscritti || []);
          const daPagare = iscritti.filter((i) => i.da_pagare);
          return (
            <Link prefetch={false} key={w.id} href={`/area/workshop/${w.id}`} className="wa-carta">
              {w.locandina_url ? <img src={w.locandina_url} alt="" className="wa-locandina" /> : <span className="wa-locandina vuota" aria-hidden="true">{w.titolo.slice(0, 2).toUpperCase()}</span>}
              <span className="wa-corpo">
                <strong>{w.titolo}</strong>
                <span className="piccolo muto">{[periodo(w.inizio, w.fine), w.insegnante].filter(Boolean).join(' · ')}</span>
                {iscritti.length > 0
                  ? <span className={`tag ${daPagare.length ? 'tag-attenzione' : 'tag-ok'}`}>{iscritti.map((i) => i.nome).join(', ')} {iscritti.length > 1 ? 'iscritti' : 'iscritto/a'}{daPagare.length ? ' · da pagare' : ''}</span>
                  : w.aperte ? <span className="wa-prezzo">{da != null ? (da ? `da ${euro(da)}` : 'gratuito') : ''}</span>
                  : <span className="tag tag-neutro">iscrizioni chiuse</span>}
              </span>
            </Link>
          );
        })}
      </div>
      <p style={{ marginTop: 20 }}><Link prefetch={false} href="/area">Torna alla mia area</Link></p>
    </>
  );
}
