import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Invia i messaggi in coda il cui orario è arrivato.
// Chiamato ogni 5 minuti dal cron di Supabase (vedi supabase/migrations/003_cron.sql).
async function invia(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ errore: 'non autorizzato' }, { status: 401 });
  }
  const db = supabaseAdmin();
  // senza Resend le email restano in coda, ma le notifiche sul telefono partono lo stesso
  const email = process.env.RESEND_API_KEY ? await inviaEmail(db) : { saltato: 'RESEND_API_KEY mancante' };
  if (email.errore) return NextResponse.json({ errore: email.errore }, { status: 500 });
  const push = await inviaPush(db);
  return NextResponse.json({ ...email, push });
}

// Limiti di Resend (piano gratuito: 100 email al giorno, 3.000 al mese, 2 al secondo).
// Si possono cambiare su Vercel con RESEND_LIMITE_GIORNO / RESEND_LIMITE_MESE (es. dopo un cambio di piano).
// Arrivati al limite le email NON si perdono: restano in coda e ripartono il giorno dopo (o il mese dopo).
const LIMITE_GIORNO = Number(process.env.RESEND_LIMITE_GIORNO) || 100;
const LIMITE_MESE = Number(process.env.RESEND_LIMITE_MESE) || 3000;
const PAUSA_MS = 600;   // al massimo 2 email al secondo
const dormi = (ms) => new Promise((r) => setTimeout(r, ms));

// mezzanotte italiana di oggi / del primo del mese, in ISO
function inizioItalia(mese = false) {
  const ora = new Date();
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ora);
  const giorno = mese ? `${d.slice(0, 8)}01` : d;
  // differenza Roma-UTC in quel momento (1 o 2 ore)
  const roma = new Date(ora.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const diff = Math.round((roma - new Date(ora.toLocaleString('en-US', { timeZone: 'UTC' }))) / 3600000);
  return new Date(`${giorno}T00:00:00Z`).getTime() - diff * 3600000;
}
const domaniMattina = () => new Date(inizioItalia() + (24 + 7) * 3600000).toISOString();          // domani alle 7
const meseProssimo = () => {   // il 1° del mese prossimo verso le 7
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' }).format(new Date());
  const [a, m] = d.split('-').map(Number);
  return new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 6)).toISOString();
};

// le email già scadute in coda ripartono più tardi, senza contare tentativi (così il sito non viene chiamato a vuoto)
async function rimanda(db, quando, motivo) {
  await db.from('messaggi_coda').update({ programmato_per: quando, errore: motivo })
    .eq('stato', 'in_coda').eq('canale', 'email').lte('programmato_per', new Date().toISOString());
}

async function inviaEmail(db) {
  const contaDal = async (dal) => (await db.from('messaggi_coda').select('id', { count: 'exact', head: true })
    .eq('canale', 'email').eq('stato', 'inviato').gte('inviato_at', new Date(dal).toISOString())).count || 0;
  const [oggi, mese] = await Promise.all([contaDal(inizioItalia()), contaDal(inizioItalia(true))]);
  if (mese >= LIMITE_MESE) { await rimanda(db, meseProssimo(), `limite mensile di ${LIMITE_MESE} email raggiunto: riparte il mese prossimo`); return { inviati: 0, rimandate: 'mese' }; }
  if (oggi >= LIMITE_GIORNO) { await rimanda(db, domaniMattina(), `limite di ${LIMITE_GIORNO} email al giorno raggiunto: riparte domani`); return { inviati: 0, rimandate: 'giorno' }; }
  const quante = Math.min(40, LIMITE_GIORNO - oggi, LIMITE_MESE - mese);

  const { data: coda, error } = await db
    .from('messaggi_coda')
    .select('id, destinatario, oggetto, corpo, html, tentativi, canale, palestre ( nome, email, email_mittente )')
    .eq('stato', 'in_coda')
    .eq('canale', 'email')
    .lte('programmato_per', new Date().toISOString())
    .order('programmato_per')
    .limit(quante);
  if (error) return { errore: error.message };

  let inviati = 0, falliti = 0;
  for (const m of coda) {
    if (inviati + falliti > 0) await dormi(PAUSA_MS);
    const p = m.palestre;
    const manda = () => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: p.email_mittente || `${p.nome} <onboarding@resend.dev>`,
        to: [m.destinatario],
        reply_to: p.email || undefined,
        subject: m.oggetto || p.nome,
        text: m.corpo,
        ...(m.html ? { html: m.html } : {}),   // email con immagini (es. biglietti: logo e locandina)
      }),
    });
    let res = await manda();
    if (res.status === 429) {
      const testo = (await res.text()).slice(0, 300);
      // quota del giorno o del mese finita: tutto il resto aspetta, nessun tentativo consumato
      if (/daily|giorn/i.test(testo)) { await rimanda(db, domaniMattina(), `Resend: quota giornaliera finita (${testo})`); break; }
      if (/month|mens/i.test(testo)) { await rimanda(db, meseProssimo(), `Resend: quota mensile finita (${testo})`); break; }
      // troppo veloci: un attimo e si riprova una volta; se ancora no, si riprende al giro dopo
      await dormi(1500);
      res = await manda();
      if (res.status === 429) { await rimanda(db, new Date(Date.now() + 10 * 60_000).toISOString(), 'Resend: troppe richieste, si riprova tra 10 minuti'); break; }
    }

    if (res.ok) {
      inviati++;
      await db.from('messaggi_coda').update({ stato: 'inviato', inviato_at: new Date().toISOString(), errore: null }).eq('id', m.id);
    } else {
      falliti++;
      const testo = (await res.text()).slice(0, 500);
      // errori del server di Resend (5xx): non è colpa dell'email, non si consuma il tentativo
      const temporaneo = res.status >= 500;
      const tentativi = m.tentativi + (temporaneo ? 0 : 1);
      await db.from('messaggi_coda').update({
        tentativi,
        errore: testo,
        // fino a 3 tentativi, a 15 minuti di distanza
        stato: tentativi >= 3 ? 'errore' : 'in_coda',
        programmato_per: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).eq('id', m.id);
    }
  }
  return { inviati, falliti, oggi: oggi + inviati, limite_giorno: LIMITE_GIORNO };
}

// Notifiche sul telefono: stesso meccanismo della coda, altro canale.
// Servono le chiavi VAPID (si generano una volta con: npx web-push generate-vapid-keys).
async function inviaPush(db) {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return { saltato: 'chiavi VAPID mancanti' };
  }
  webpush.setVapidDetails(
    process.env.VAPID_SOGGETTO || 'mailto:info@ritmometropolitano.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const { data: coda } = await db
    .from('messaggi_coda')
    .select('id, destinatario, corpo, tentativi')
    .eq('stato', 'in_coda')
    .eq('canale', 'push')
    .lte('programmato_per', new Date().toISOString())
    .order('programmato_per')
    .limit(60);

  let inviate = 0, spente = 0;
  for (const m of coda || []) {
    // il recapito del telefono sta in push_iscrizioni, cercato per endpoint
    const { data: iscr } = await db.from('push_iscrizioni')
      .select('endpoint, p256dh, auth').eq('endpoint', m.destinatario).eq('attiva', true).maybeSingle();

    if (!iscr) {
      await db.from('messaggi_coda').update({ stato: 'errore', errore: 'telefono non più registrato' }).eq('id', m.id);
      continue;
    }

    try {
      await webpush.sendNotification(
        { endpoint: iscr.endpoint, keys: { p256dh: iscr.p256dh, auth: iscr.auth } },
        m.corpo,
      );
      inviate++;
      await db.from('messaggi_coda').update({ stato: 'inviato', inviato_at: new Date().toISOString(), errore: null }).eq('id', m.id);
      await db.rpc('push_riuscita', { p_endpoint: iscr.endpoint });
    } catch (e) {
      const scaduto = e?.statusCode === 404 || e?.statusCode === 410;
      if (scaduto) { spente++; await db.rpc('cancella_push', { p_endpoint: iscr.endpoint }); }
      else await db.rpc('push_fallita', { p_endpoint: iscr.endpoint });

      const tentativi = m.tentativi + 1;
      await db.from('messaggi_coda').update({
        tentativi,
        errore: String(e?.message || e).slice(0, 300),
        stato: scaduto || tentativi >= 3 ? 'errore' : 'in_coda',
        programmato_per: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).eq('id', m.id);
    }
  }
  return { inviate, spente };
}

export const POST = invia;
export const GET = invia;
