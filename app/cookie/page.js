import Testata from '../Testata';
import PiePagina from '../PiePagina';
import { datiScuola } from '@/lib/scuola';

export const revalidate = 3600;
export const metadata = { title: 'Cookie policy · Ritmo Metropolitano' };

// Il sito usa solo cookie tecnici: secondo le Linee guida del Garante (10 giugno 2021)
// non serve il banner di consenso, ma va data questa informativa.
export default async function Cookie() {
  const s = await datiScuola();
  return (
    <>
      <Testata />
      <main className="pagina legale">
        <h1>Cookie policy</h1>
        <p className="muto">Ultimo aggiornamento: ottobre 2026.</p>

        <h2>In breve</h2>
        <p>
          Questo sito <strong>non usa cookie di profilazione, di pubblicità né di statistica</strong> e non ne fa usare a terzi.
          Usa solo cookie e memorie <strong>tecniche</strong>, indispensabili per farlo funzionare: per questo non ti chiediamo
          il consenso con un banner (Linee guida del Garante privacy del 10 giugno 2021).
        </p>

        <h2>Cosa usiamo</h2>
        <div className="tabella-scorre">
          <table className="tabella">
            <thead><tr><th>Nome</th><th>A cosa serve</th><th>Durata</th></tr></thead>
            <tbody>
              <tr><td>sb-…-auth-token</td><td>Tiene aperto l'accesso all'area clienti o al gestionale dopo che sei entrato.</td><td>Fino all'uscita o alla scadenza della sessione</td></tr>
              <tr><td>Memoria del browser (localStorage)</td><td>Ricorda piccole scelte di visualizzazione, per esempio la vista dell'elenco.</td><td>Finché non la cancelli</td></tr>
              <tr><td>Service worker / cache dell'app</td><td>Fa aprire l'app più in fretta e permette le notifiche, solo se le hai attivate tu.</td><td>Finché non la cancelli</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Font e immagini sono ospitati sul nostro sito: aprendo le pagine non vengono contattati servizi esterni come Google Fonts.
          I pagamenti online avvengono sulla pagina di Stripe, che applica la propria cookie policy.
        </p>

        <h2>Come gestirli</h2>
        <p>
          Puoi cancellare cookie e memorie dalle impostazioni del browser in qualsiasi momento: in quel caso dovrai solo
          rifare l'accesso. Per tutto il resto vedi l'<a href="/privacy">informativa privacy</a>
          {s.email ? <> o scrivi a <strong>{s.email}</strong></> : null}.
        </p>
      </main>
      <PiePagina nome={s.nome} datiFiscali={s.dati_fiscali} />
    </>
  );
}
