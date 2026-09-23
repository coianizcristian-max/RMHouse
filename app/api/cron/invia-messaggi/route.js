import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Invia i messaggi in coda il cui orario è arrivato.
// Chiamato ogni 5 minuti dal cron di Supabase (vedi supabase/migrations/003_cron.sql).
async function invia(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ errore: 'non autorizzato' }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ errore: 'RESEND_API_KEY mancante' }, { status: 500 });
  }

  const db = supabaseAdmin();
  const { data: coda, error } = await db
    .from('messaggi_coda')
    .select('id, destinatario, oggetto, corpo, tentativi, canale, palestre ( nome, email, email_mittente )')
    .eq('stato', 'in_coda')
    .eq('canale', 'email')
    .lte('programmato_per', new Date().toISOString())
    .order('programmato_per')
    .limit(40);
  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  let inviati = 0, falliti = 0;
  for (const m of coda) {
    const p = m.palestre;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: p.email_mittente || `${p.nome} <onboarding@resend.dev>`,
        to: [m.destinatario],
        reply_to: p.email || undefined,
        subject: m.oggetto || p.nome,
        text: m.corpo,
      }),
    });

    if (res.ok) {
      inviati++;
      await db.from('messaggi_coda').update({ stato: 'inviato', inviato_at: new Date().toISOString(), errore: null }).eq('id', m.id);
    } else {
      falliti++;
      const testo = (await res.text()).slice(0, 500);
      const tentativi = m.tentativi + 1;
      await db.from('messaggi_coda').update({
        tentativi,
        errore: testo,
        // fino a 3 tentativi, a 15 minuti di distanza
        stato: tentativi >= 3 ? 'errore' : 'in_coda',
        programmato_per: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).eq('id', m.id);
    }
  }
  return NextResponse.json({ inviati, falliti });
}

export const POST = invia;
export const GET = invia;
