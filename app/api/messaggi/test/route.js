import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { rendi } from '@/lib/messaggi';

export const dynamic = 'force-dynamic';

// Invia a se stessi l'anteprima di un messaggio, per vedere come arriva davvero
export async function POST(request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 });

  const { template_id } = await request.json().catch(() => ({}));
  // le regole RLS lasciano leggere solo i modelli della propria palestra
  const { data: t } = await supabase
    .from('messaggi_template')
    .select('oggetto, corpo, palestre ( nome, email, email_mittente )')
    .eq('id', template_id)
    .maybeSingle();
  if (!t) return NextResponse.json({ errore: 'Messaggio non trovato.' }, { status: 404 });
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ errore: 'Manca la chiave di Resend: aggiungila fra le variabili.' }, { status: 500 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: t.palestre.email_mittente || `${t.palestre.nome} <onboarding@resend.dev>`,
      to: [user.email],
      subject: `[prova] ${rendi(t.oggetto) || t.palestre.nome}`,
      text: rendi(t.corpo),
    }),
  });
  if (!res.ok) {
    return NextResponse.json({ errore: 'Resend ha rifiutato l\'invio: controlla dominio e chiave.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
