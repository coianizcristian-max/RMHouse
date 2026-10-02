import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Primo accesso (o nuova password) di chi lavora in palestra: email + codice dato dalla segreteria + password.
// Il server crea l'utente già confermato (o gli cambia la password) e lo collega alla scheda staff.
export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const codice = String(b.codice || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ errore: 'Controlla l\'indirizzo email.' }, { status: 400 });
  if (!/^\d{6}$/.test(codice)) return NextResponse.json({ errore: 'Il codice è di 6 cifre.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ errore: 'La password deve avere almeno 8 caratteri.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: tentativi } = await db.rpc('conta_tentativo', { p_chiave: `staff:${email}` });
  if ((tentativi || 0) > 6) return NextResponse.json({ errore: 'Troppi tentativi: riprova tra un\'ora.' }, { status: 429 });

  const { data: staffId } = await db.rpc('usa_codice_staff', { p_email: email, p_codice: codice });
  if (!staffId) return NextResponse.json({ errore: 'Codice non valido o scaduto: chiedine uno nuovo alla segreteria.' }, { status: 400 });

  const { data: esistente } = await db.rpc('utente_da_email', { p_email: email });
  let userId = esistente;
  if (userId) {
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) return NextResponse.json({ errore: 'Password non salvata. Riprova.' }, { status: 500 });
  } else {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data?.user) return NextResponse.json({ errore: 'Accesso non creato. Riprova tra poco.' }, { status: 500 });
    userId = data.user.id;
  }
  const { error } = await db.from('staff').update({ user_id: userId }).eq('id', staffId);
  if (error) return NextResponse.json({ errore: 'Accesso creato ma non collegato: avvisa la segreteria.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
