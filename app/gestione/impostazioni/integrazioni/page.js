import { impostazioni } from '../dati';

export const dynamic = 'force-dynamic';

// Cosa è collegato e cosa no: si legge dalla configurazione del sito, i codici non si vedono mai
export default async function PaginaIntegrazioni() {
  const { palestra } = await impostazioni('base_url, email_mittente, email, google_review_url, dati_fiscali');
  const env = (k) => !!process.env[k];
  const voci = [
    ['Database e accessi (Supabase)', env('NEXT_PUBLIC_SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY'), 'Collegato.', 'Mancano le chiavi di Supabase su Vercel.'],
    ['Email (Resend)', env('RESEND_API_KEY'), `Collegato. Le email partono da ${palestra.email_mittente || '—'}.`, 'Manca RESEND_API_KEY: nessuna email automatica parte.'],
    ['Mittente con il vostro dominio', !!palestra.email_mittente && !palestra.email_mittente.includes('resend.dev'),
      'Le email partono dal vostro dominio.', 'Le email partono da onboarding@resend.dev: verifica il dominio su Resend e cambia il mittente in Struttura → Sede e contatti.'],
    ['Lavori automatici (cron)', env('CRON_SECRET'), 'Configurato: promemoria, scadenze e invii partono da soli.', 'Manca CRON_SECRET: i lavori automatici non partono.'],
    ['Notifiche sul telefono (web push)', env('NEXT_PUBLIC_VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY'), 'Collegato.', 'Mancano le chiavi VAPID.'],
    ['Indirizzo del sito nei messaggi', !!palestra.base_url && !palestra.base_url.includes('TUO-SITO'), `I link nelle email puntano a ${palestra.base_url}.`, "Manca l'indirizzo del sito: i link nelle email arrivano monchi."],
    ['Recensioni Google', !!palestra.google_review_url, "Il link va nell'email dopo la prova.", 'Manca il link alle recensioni (Impostazioni → Regole e prenotazioni).'],
    ['Dati fiscali della scuola', !!palestra.dati_fiscali, 'Stampati su ricevute e attestati.', 'Mancano: ricevute e attestati escono senza P.IVA e codice fiscale (Struttura → Sede e contatti).'],
    ['Pagamenti online (Stripe)', process.env.PAGAMENTI_ONLINE === 'true' && env('STRIPE_SECRET_KEY') && env('STRIPE_WEBHOOK_SECRET'),
      (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? 'Attivi: si incassa davvero.' : 'Attivi in modalità di prova.',
      'Pronti ma spenti: mancano le chiavi. Istruzioni in Impostazioni → Pagamenti online.'],
  ];

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Integrazioni</h1>
        <p>I servizi collegati al gestionale e cosa manca. Le chiavi si inseriscono su Vercel: qui si vede solo se ci sono.</p>
      </div>
      <ul className="elenco-stati">
        {voci.map(([nome, ok, si, no]) => (
          <li key={nome} className={ok ? 'ok' : 'manca'}>
            <span className="es-segno" aria-hidden="true">{ok ? '✓' : '!'}</span>
            <span><strong>{nome}</strong><span className="piccolo muto" style={{ display: 'block' }}>{ok ? si : no}</span></span>
          </li>
        ))}
      </ul>
    </>
  );
}
