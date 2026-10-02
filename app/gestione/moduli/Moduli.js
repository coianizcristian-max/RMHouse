'use client';
import Link from 'next/link';
import Gestore from '../Gestore';

const PER_CHI = [{ v: 'tutti', l: 'Tutti' }, { v: 'minori', l: 'Solo i minorenni (firma il genitore)' }, { v: 'maggiorenni', l: 'Solo i maggiorenni' }];
const wa = (t) => `https://wa.me/39${(t || '').replace(/\D/g, '').replace(/^39/, '')}`;

export default function Moduli({ palestraId, situazione, moduli, scelto, mancano }) {
  const modulo = situazione.find((s) => s.modulo_id === scelto);
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Moduli e firme</h1>
        <p>Si firmano col dito dall'area clienti (voce "Moduli") o sul tablet della reception dalla scheda della persona.
          Se cambi il testo di un modulo, nasce una nuova versione e va firmato di nuovo.</p>
      </div>

      <div className="kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {situazione.filter((s) => s.attivo).map((s) => (
          <Link prefetch={false} key={s.modulo_id} className={`tessera${s.mancano && s.obbligatorio ? ' tessera-rossa' : ''}`} href={`/gestione/moduli?m=${s.modulo_id}`}>
            <div className="etichetta">{s.titolo}</div>
            <div className="cifra">{s.firmati}<span className="piccolo"> / {Number(s.firmati) + Number(s.mancano)}</span></div>
            <div className="sotto">{s.mancano ? `mancano ${s.mancano}` : 'tutti firmati'} · versione {s.versione}</div>
          </Link>
        ))}
      </div>

      {modulo && mancano && (
        <section className="pannello" style={{ marginBottom: 16 }}>
          <div className="pannello-testa">
            <h2>Devono firmare: {modulo.titolo}</h2>
            <Link prefetch={false} className="link-btn piccolo" href="/gestione/moduli">chiudi</Link>
          </div>
          {mancano.length === 0 ? <div className="vuoto">Tutti gli iscritti hanno firmato.</div> : (
            <ul className="mini-lista">
              {mancano.map((x) => (
                <li key={x.allievo_id}>
                  <span className="ml-riga">
                    <span className="ml-testo">
                      <Link prefetch={false} className="persona-nome" href={`/gestione/persone/${x.allievo_id}`}>{x.cognome} {x.nome}</Link>
                      <span className="piccolo muto">{x.firmata_versione ? `ha firmato la versione ${x.firmata_versione}` : 'mai firmato'}</span>
                    </span>
                    {x.telefono && <a className="link-btn piccolo" href={`${wa(x.telefono)}?text=${encodeURIComponent(`Ciao ${x.nome}! Ti chiediamo di firmare "${modulo.titolo}" dalla tua area clienti, voce Moduli. Grazie!`)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                    <Link prefetch={false} className="btn btn-piccolo" href={`/gestione/persone/${x.allievo_id}/firma?m=${modulo.modulo_id}`}>Fai firmare qui</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="pannello">
        <h2>I moduli</h2>
        <p className="piccolo muto" style={{ marginTop: -4 }}>
          I moduli «Iscrizione e tesseramento» e «Privacy, comunicazioni e immagini» riprendono il modulo d'iscrizione 2026/2027. Le scelte Acconsento / Non acconsento finiscono anche nella scheda di ogni persona.
        </p>
        <Gestore
          tabella="moduli" fissi={{ palestra_id: palestraId }} righe={moduli} etichettaNuovo="Aggiungi un modulo"
          campi={[
            { k: 'titolo', etichetta: 'Titolo', tipo: 'testo', obbligatorio: true },
            { k: 'testo', etichetta: 'Testo da firmare', tipo: 'testolungo', obbligatorio: true },
            { k: 'per_chi', etichetta: 'Chi lo firma', tipo: 'select', opzioni: PER_CHI, obbligatorio: true },
            { k: 'obbligatorio', etichetta: 'Obbligatorio (se manca, alla reception compare un avviso)', tipo: 'check' },
            { k: 'con_dati', etichetta: 'Mostra i dati dell\'iscritto sopra il testo (restano nella firma)', tipo: 'check', predefinito: false },
            { k: 'secondo_genitore', etichetta: 'Per i minorenni firmano tutti e due i genitori', tipo: 'check', predefinito: false },
            { k: 'ordine', etichetta: 'Ordine', tipo: 'numero' },
            { k: 'attivo', etichetta: 'Attivo', tipo: 'check' },
          ]}
          riassunto={(x) => ({
            titolo: x.titolo,
            dettaglio: [PER_CHI.find((p) => p.v === x.per_chi)?.l, `versione ${x.versione}`, x.obbligatorio ? 'obbligatorio' : 'facoltativo',
              x.scelte?.length ? `scelte: ${x.scelte.map((s) => s.titolo).join(', ')}` : null, x.secondo_genitore ? 'due genitori' : null].filter(Boolean).join(' · '),
            tag: x.attivo ? null : 'non attivo',
          })}
        />
      </section>
    </>
  );
}
