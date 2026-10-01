'use client';
import { useState } from 'react';
import Link from 'next/link';
import { dataBreve, ora } from '@/lib/formato';

const soloNumero = (t) => String(t || '').replace(/[^\d+]/g, '');
const wa = (t) => { const n = soloNumero(t).replace(/^\+/, ''); return `https://wa.me/${n.startsWith('39') ? n : `39${n}`}`; };
const sito = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : `https://${u}`);
const social = (u, base) => (!u ? null : /^https?:\/\//.test(u) ? u : `${base}${u.replace(/^@/, '')}`);

// "La scuola": contatti con un tocco, orari, sedi, social, regolamento, safeguarding, staff, corsi, eventi, avvisi
export default function Scuola({ s }) {
  const info = s.info || {};
  const [apri, setApri] = useState('');
  const contatti = (info.contatti || []).filter((c) => c.telefono || c.etichetta);
  if (contatti.length === 0 && s.telefono) contatti.push({ etichetta: 'Segreteria', telefono: s.telefono });
  const sede = s.sedi[0] || {};
  const instagram = social(info.instagram || sede.instagram, 'https://instagram.com/');
  const facebook = social(info.facebook || sede.facebook, 'https://facebook.com/');
  const youtube = social(info.youtube, 'https://youtube.com/@');
  const sezione = (k, titolo, n, contenuto) => (
    <section className="ac-sezione">
      <button type="button" className="sc-apri" aria-expanded={apri === k} onClick={() => setApri(apri === k ? '' : k)}>
        <span>{titolo}{n != null && <span className="muto"> · {n}</span>}</span><span aria-hidden="true">{apri === k ? '▴' : '▾'}</span>
      </button>
      {apri === k && contenuto}
    </section>
  );

  return (
    <div className="area-casa area-scuola">
      <div className="ac-testa">
        <h1>{s.nome}</h1>
        {info.orari_apertura && <p className="ac-nota" style={{ margin: '2px 0 0' }}>Aperti: {info.orari_apertura}</p>}
      </div>

      <section className="sc-contatti">
        {contatti.map((c, i) => (
          <div key={i} className="sc-contatto">
            <span className="sc-chi"><strong>{c.etichetta || 'Segreteria'}</strong>{c.orari && <span>{c.orari}</span>}</span>
            <span className="sc-tasti">
              {c.telefono && <a className="btn btn-piccolo" href={`tel:${soloNumero(c.telefono)}`}>Chiama</a>}
              {c.telefono && <a className="btn btn-piccolo btn-primario sc-wa" href={wa(c.telefono)} target="_blank" rel="noreferrer">WhatsApp</a>}
            </span>
          </div>
        ))}
        <div className="sc-icone">
          {s.email && <a href={`mailto:${s.email}`}>Email</a>}
          {sito(sede.sito || s.sito) && <a href={sito(sede.sito || s.sito)} target="_blank" rel="noreferrer">Sito</a>}
          {instagram && <a href={instagram} target="_blank" rel="noreferrer">Instagram</a>}
          {facebook && <a href={facebook} target="_blank" rel="noreferrer">Facebook</a>}
          {youtube && <a href={youtube} target="_blank" rel="noreferrer">YouTube</a>}
          {s.recensione && <a href={s.recensione} target="_blank" rel="noreferrer">Lascia una recensione ★</a>}
        </div>
      </section>

      <section className="ac-sezione">
        <h2>Le sedi</h2>
        <ul className="ac-abbonamenti">
          {s.sedi.map((x) => (
            <li key={x.id}>
              <span className="ac-abb"><strong>{x.nome}</strong>
                {x.indirizzo && <a className="piccolo" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.indirizzo)}`} target="_blank" rel="noreferrer">Mappa ›</a>}
              </span>
              {x.indirizzo && <span className="piccolo muto">{x.indirizzo}</span>}
            </li>
          ))}
        </ul>
      </section>

      <Link prefetch={false} href="/area/personal" className="ac-recupero" style={{ background: 'var(--carta)' }}>
        <span><strong>Lezione privata</strong><span className="piccolo">con l'insegnante che vuoi</span></span>
        <span aria-hidden="true">›</span>
      </Link>
      <Link prefetch={false} href="/spazi" className="ac-recupero" style={{ background: 'var(--carta)' }}>
        <span><strong>Prenota una sala</strong><span className="piccolo">per allenarti da solo o con il tuo gruppo</span></span>
        <span aria-hidden="true">›</span>
      </Link>

      {s.avvisi.length > 0 && sezione('avvisi', 'Avvisi e novità', s.avvisi.length, (
        <div className="sc-lista">
          {s.avvisi.map((a, i) => (
            <article key={i} className="sc-avviso">
              {a.immagine && <img src={a.immagine} alt="" loading="lazy" />}
              <strong>{a.titolo}</strong>
              {a.testo && <p>{a.testo}</p>}
            </article>
          ))}
        </div>
      ))}

      {s.eventi.length > 0 && sezione('eventi', 'Eventi e stage', s.eventi.length, (
        <div className="sc-lista">
          {s.eventi.map((e, i) => (
            <Link prefetch={false} key={i} href="/area/eventi" className="sc-evento">
              {e.locandina && <img src={e.locandina} alt="" loading="lazy" />}
              <span><strong>{e.titolo}</strong><span className="piccolo muto">{dataBreve(e.inizio)} · {ora(e.inizio)}{e.luogo ? ` · ${e.luogo}` : ''}</span></span>
            </Link>
          ))}
        </div>
      ))}

      {sezione('corsi', 'I corsi', s.corsi.length, (
        <div className="sc-griglia">
          {s.corsi.map((c) => (
            <div key={c.id} className="sc-carta" style={{ '--colore': c.colore || 'var(--rosso)' }}>
              {c.foto ? <img src={c.foto} alt="" loading="lazy" /> : <span className="sc-segnaposto" />}
              <strong>{c.nome}</strong>
              {c.disciplina && <span className="piccolo muto">{c.disciplina}</span>}
            </div>
          ))}
        </div>
      ))}

      {sezione('staff', 'Lo staff', s.staff.length, (
        <div className="sc-griglia">
          {s.staff.map((x, i) => (
            <div key={i} className="sc-carta sc-persona">
              {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="sc-segnaposto" />}
              <strong>{x.nome}</strong>
              {x.specialita && <span className="piccolo muto">{x.specialita}</span>}
            </div>
          ))}
        </div>
      ))}

      {s.regolamento && sezione('regolamento', s.regolamento.titolo || 'Regolamento', null, (
        <div className="sc-testo">{s.regolamento.testo}</div>
      ))}

      {info.safeguarding?.nome && sezione('safeguarding', 'Responsabile safeguarding', null, (
        <div className="sc-contatto">
          <span className="sc-chi"><strong>{info.safeguarding.nome}</strong><span>Per segnalare con riservatezza qualsiasi situazione di disagio o abuso.</span></span>
          <span className="sc-tasti">
            {info.safeguarding.telefono && <a className="btn btn-piccolo" href={`tel:${soloNumero(info.safeguarding.telefono)}`}>Chiama</a>}
            {info.safeguarding.email && <a className="btn btn-piccolo" href={`mailto:${info.safeguarding.email}`}>Email</a>}
          </span>
        </div>
      ))}

      <p className="ac-nota" style={{ textAlign: 'center' }}><Link prefetch={false} href="/privacy">Privacy</Link> · <Link prefetch={false} href="/cookie">Cookie</Link></p>
    </div>
  );
}
