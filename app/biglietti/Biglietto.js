import { qrSvg } from '@/lib/qr';
import { quandoSpettacolo } from '@/lib/biglietteria';

// Grafica di serie del biglietto (si cambia in Biglietteria → Email e biglietto)
export const BIGLIETTO_BASE = {
  sfondo: '#111111', testo: '#ffffff', accento: '#e50914',
  logo_url: null, immagine_url: null, titolo: '', testo_sopra: '', testo_sotto: 'Mostra questo QR all\'ingresso. Un biglietto per persona.',
};

// Un biglietto = una schermata di telefono: logo, immagine, titolo, evento, persona, QR grande, testi.
// Usato dalla pagina dei biglietti e dall'anteprima della segreteria.
export default function Biglietto({ g = {}, evento, spettacolo, inizio, nome, allievo, extra, numero, di, codice, url, usato = false }) {
  const c = { ...BIGLIETTO_BASE, ...g };
  return (
    <article className={`bg-pass${usato ? ' usato' : ''}`} style={{ '--pass-sfondo': c.sfondo, '--pass-testo': c.testo, '--pass-accento': c.accento }}>
      {c.logo_url && <img className="bg-pass-logo" src={c.logo_url} alt="" />}
      {c.immagine_url && <img className="bg-pass-immagine" src={c.immagine_url} alt="" />}
      <div className="bg-pass-testa">
        <span className="bg-pass-evento">{c.titolo || evento}</span>
        <strong className="bg-pass-spettacolo">{spettacolo}</strong>
        <span className="bg-pass-quando">{inizio ? quandoSpettacolo(inizio) : ''}</span>
        {c.testo_sopra && <span className="bg-pass-nota">{c.testo_sopra}</span>}
      </div>
      <div className="bg-pass-qr" aria-label={`QR del biglietto ${codice}`} dangerouslySetInnerHTML={{ __html: qrSvg(url || codice || '-') }} />
      <div className="bg-pass-chi">
        <strong className="bg-pass-nome">{nome}</strong>
        {allievo && <span>per {allievo}</span>}
        {extra && <span className="bg-pass-extra">{extra}</span>}
        <span className="bg-pass-num">Biglietto {numero} di {di} · <span className="bg-pass-cod">{codice}</span></span>
        {usato && <span className="bg-pass-usato">GIÀ USATO</span>}
      </div>
      {c.testo_sotto && <p className="bg-pass-sotto">{c.testo_sotto}</p>}
    </article>
  );
}
