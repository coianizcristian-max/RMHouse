import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Il cliente si crea (o rifà) la password.
//  - primo accesso: email + verifica (ultime 4 cifre del cellulare o data di nascita)
//  - con il codice della segreteria: email + codice (vale anche per rifare la password)
// Il server crea l'utente già confermato e lo collega alla scheda: nessuna email da mandare.
export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ errore: 'Controlla l\'indirizzo email.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ errore: 'La password deve avere almeno 8 caratteri.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: tentativi } = await db.rpc('conta_tentativo', { p_chiave: `attiva:${email}` });
  if ((tentativi || 0) > 6) return NextResponse.json({ errore: 'Troppi tentativi: riprova tra un\'ora o chiedi un codice alla segreteria.' }, { status: 429 });

  let accountId = null;
  if (b.codice) {
    const { data } = await db.rpc('usa_codice_accesso', { p_email: email, p_codice: String(b.codice).trim() });
    accountId = data;
    if (!accountId) return NextResponse.json({ errore: 'Codice non valido o scaduto: chiedine uno nuovo alla segreteria.' }, { status: 400 });
  } else {
    const { data } = await db.rpc('verifica_attivazione', { p_email: email, p_risposta: String(b.verifica || '') });
    accountId = data;
    if (!accountId) return NextResponse.json({ errore: 'I dati non corrispondono a quelli registrati in segreteria.' }, { status: 400 });
  }

  // utente di accesso: lo crea, oppure (con il codice) gli cambia la password
  const { data: esistente } = await db.rpc('utente_da_email', { p_email: email });
  let userId = esistente;
  if (userId) {
    if (!b.codice) return NextResponse.json({ errore: 'Hai già una password: entra, oppure chiedi un codice alla segreteria per rifarla.' }, { status: 400 });
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) return NextResponse.json({ errore: 'Password non salvata. Riprova.' }, { status: 500 });
  } else {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data?.user) return NextResponse.json({ errore: 'Accesso non creato. Riprova tra poco.' }, { status: 500 });
    userId = data.user.id;
  }
  // collega la scheda (e le altre con la stessa email ancora libere)
  await db.from('account').update({ user_id: userId }).eq('id', accountId).is('user_id', null);
  return NextResponse.json({ ok: true });
}
