'use client';
import { useEffect, useRef, useState } from 'react';
import { codicePreferito } from '@/lib/asiCompila';

// Il bottone "Compila da RMHouse" da mettere nella barra dei preferiti del browser (una volta sola, sul computer della
// segreteria). Sul portale ASI riempie "Inserimento nuovo tesserato" con i dati copiati da RMHouse ("Copia per ASI").
// Il link javascript: lo mette qui sotto il browser (React non lo scrive da solo, per sicurezza).
export default function PreferitoAsi({ portale = '' }) {
  const link = useRef(null);
  const [copiato, setCopiato] = useState(false);
  useEffect(() => { link.current?.setAttribute('href', codicePreferito()); }, []);
  async function copia() {
    try { await navigator.clipboard.writeText(codicePreferito()); setCopiato(true); setTimeout(() => setCopiato(false), 2500); } catch { /* niente */ }
  }
  return (
    <div className="asi-preferito">
      <ol className="asi-passi">
        <li>
          <b>Una volta sola:</b> trascina questo bottone nella barra dei preferiti del browser (in alto, sotto l&apos;indirizzo;
          se non la vedi: Ctrl+Maiusc+B) →{' '}
          <a ref={link} className="btn btn-piccolo asi-bottone" onClick={(e) => { e.preventDefault(); alert('Non cliccarlo qui: trascinalo nella barra dei preferiti, poi usalo sul portale ASI.'); }}
             title="Trascinami nella barra dei preferiti">Compila da RMHouse</a>
          <span className="piccolo muto"> · se non si trascina: <button type="button" className="link-btn piccolo" onClick={copia}>{copiato ? 'codice copiato ✓' : 'copia il codice'}</button>,
            poi tasto destro sulla barra dei preferiti → Aggiungi pagina, nome &quot;Compila da RMHouse&quot;, e nell&apos;URL incolla.</span>
        </li>
        <li>Entra nel portale ASI come sempre {portale ? <a href={portale} target="_blank" rel="noreferrer">(apri ↗)</a> : null}: la password la mette il browser. Vai su Società → Tesserati.</li>
        <li>In RMHouse premi <b>Copia per ASI</b> sulla persona (qui in Tesseramento, o allo Sportello nel riquadro Tessera).</li>
        <li>Sul portale premi il preferito <b>Compila da RMHouse</b>: cerca la persona per codice fiscale e mette tipo tessera, qualifica,
          disciplina e certificato. La prima volta il browser chiede di poter leggere gli appunti: <b>Consenti</b>.
          Controlla e premi <b>INSERISCI</b>.</li>
      </ol>
      <p className="piccolo muto" style={{ margin: '6px 0 0' }}>
        La password non passa da RMHouse. Se la persona non è ancora nell&apos;anagrafica ASI il portale non la trova: per i nuovi
        usa il &quot;File per ASI&quot; (ha anche nome, residenza ed email) oppure creala prima in Persone sul portale.
      </p>
    </div>
  );
}
