'use client';
import { useEffect, useState } from 'react';
import {
  normalizzaCF, problemaCF, leggiCF, calcolaCF, caricaLuoghi, trovaLuogo, senzaOmocodia,
  parteCognome, parteNome, parteNascita,
} from '@/lib/codiceFiscale';

const it = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Sotto il campo "Codice fiscale" della scheda: controlla il codice, lo confronta con i dati e,
// se ci sono nome, cognome, data, sesso e luogo di nascita, lo calcola. Non cambia niente da solo:
// propone, e la segreteria sceglie ("Usa").
export default function ControlloCF({ nome, cognome, data, sesso, luogo, cf, onCambia }) {
  const [luoghi, setLuoghi] = useState(null);
  useEffect(() => { let vivo = true; caricaLuoghi().then((l) => vivo && setLuoghi(l)).catch(() => {}); return () => { vivo = false; }; }, []);

  const c = normalizzaCF(cf);
  const problema = c ? problemaCF(c) : null;
  const valido = c && !problema;
  const mancano = [!nome?.trim() && 'nome', !cognome?.trim() && 'cognome', !data && 'data di nascita',
    !['M', 'F'].includes(sesso) && 'sesso', !luogo?.trim() && 'luogo di nascita'].filter(Boolean);
  const posto = luoghi && luogo?.trim() ? trovaLuogo(luogo, data, luoghi) : null;
  const calcolato = luoghi && !mancano.length && posto?.codice
    ? calcolaCF({ nome, cognome, data, sesso, codiceLuogo: posto.codice }) : null;
  const letto = valido ? leggiCF(c) : null;
  const luogoDelCodice = letto && luoghi ? luoghi.find((l) => l.codice === letto.luogo) : null;

  const Usa = ({ patch, children }) => (
    <button type="button" className="link-btn piccolo" onClick={() => onCambia(patch)}>{children}</button>
  );
  const righe = [];

  if (!c) {
    if (calcolato) righe.push(<span key="c">Dai dati: <b className="cf-codice">{calcolato}</b> <Usa patch={{ cf_allievo: calcolato }}>Usa questo</Usa></span>);
  } else if (problema) {
    righe.push(<span key="p" className="cf-male">Non valido: {problema}</span>);
    if (calcolato) righe.push(<span key="c">Dai dati sarebbe: <b className="cf-codice">{calcolato}</b> <Usa patch={{ cf_allievo: calcolato }}>Usa questo</Usa></span>);
  } else {
    // valido: si confronta con la scheda, parte per parte (anche senza il luogo)
    const s = senzaOmocodia(c);
    const nomi = nome && cognome ? parteCognome(cognome) + parteNome(nome) : null;
    const nomiInvertiti = nome && cognome ? parteCognome(nome) + parteNome(cognome) : null;
    const nascita = data && sesso ? parteNascita(data, sesso) : null;
    const avvisi = [];
    if (nomi && s.slice(0, 6) !== nomi) {
      if (s.slice(0, 6) === nomiInvertiti) {
        avvisi.push(<span key="i">Nome e cognome sembrano invertiti sulla scheda. <Usa patch={{ nome: cognome, cognome: nome }}>Scambiali</Usa></span>);
      } else {
        avvisi.push(<span key="n">Le lettere di nome e cognome non tornano: forse è il codice di un'altra persona (es. del genitore) o il nome è scritto diverso dal documento.</span>);
      }
    }
    if (letto && sesso && letto.sesso !== sesso) {
      avvisi.push(<span key="s">Il codice dice sesso {letto.sesso}, la scheda {sesso}. <Usa patch={{ sesso: letto.sesso }}>Metti {letto.sesso}</Usa></span>);
    }
    if (letto && data && letto.data !== data) {
      avvisi.push(<span key="d">Il codice dice nato/a il {it(letto.data)}, la scheda il {it(data)}. <Usa patch={{ data_nascita: letto.data }}>Metti {it(letto.data)}</Usa></span>);
    }
    if (letto && (!data || !sesso)) {
      avvisi.push(<span key="f">Dal codice: nato/a il {it(letto.data)}, sesso {letto.sesso}. <Usa patch={{ data_nascita: data || letto.data, sesso: sesso || letto.sesso }}>Compila</Usa></span>);
    }
    if (luogoDelCodice && !luogo?.trim()) {
      avvisi.push(<span key="l">Dal codice: nato/a a {luogoDelCodice.nome}. <Usa patch={{ luogo_nascita: luogoDelCodice.nome }}>Compila</Usa></span>);
    } else if (posto?.codice && letto && posto.codice !== letto.luogo) {
      avvisi.push(<span key="l">Il codice dice nato/a a {luogoDelCodice?.nome || letto.luogo}, la scheda a {luogo}. <Usa patch={{ luogo_nascita: luogoDelCodice?.nome || luogo }}>Metti {luogoDelCodice?.nome}</Usa></span>);
    }
    if (!avvisi.length && nascita && nomi) {
      righe.push(<span key="ok" className="cf-bene">✓ Corrisponde ai dati della scheda{posto?.codice ? '' : ' (luogo non controllato)'}</span>);
    }
    righe.push(...avvisi);
    if (avvisi.length && calcolato && s !== calcolato) {
      righe.push(<span key="c" className="muto">Se invece è sbagliato il codice, dai dati sarebbe <b className="cf-codice">{calcolato}</b> <Usa patch={{ cf_allievo: calcolato }}>Usa questo</Usa></span>);
    }
  }
  if (!calcolato && !valido) {
    if (mancano.length) righe.push(<span key="m" className="muto">Per calcolarlo servono anche: {mancano.join(', ')}.</span>);
    else if (posto?.errore && posto.errore !== 'manca') righe.push(<span key="e" className="muto">{posto.errore}</span>);
    else if (!luoghi) righe.push(<span key="w" className="muto">Carico l'elenco dei comuni…</span>);
  }

  if (!righe.length) return null;
  return <div className="cf-controllo piccolo" role="status">{righe}</div>;
}
