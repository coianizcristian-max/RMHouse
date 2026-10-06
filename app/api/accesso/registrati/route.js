import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { palestraPubblica } from '@/lib/palestra';

export const dynamic = 'force-dynamic';

const MESSAGGI = {
  email_non_valida: 'Controlla l\'indirizzo email.',
  nome_cognome: 'Scrivi nome e cognome.',
  email_gia_registrata: 'Questa email è già registrata: entra con "Accedi".',
  data_nascita: 'Controlla la tua data di nascita (dall\'app si registrano i maggiori di 14 anni; per i più piccoli si registra il genitore).',
  data_nascita_figlio: 'Controlla la data di nascita di tuo figlio/a.',
  nessuno_frequenta: 'Indica chi viene a lezione: tu, un figlio o entrambi.',
};

// Un nuovo cliente si registra da solo dall'app: crea l'accesso (email + password, già confermato)
// e la sua scheda (più quelle dei figli). Se l'email c'è già lo manda ad "Accedi".
export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ errore: MESSAGGI.email_non_valida }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ errore: 'La password deve avere almeno 8 caratteri.' }, { status: 400 });
  if (!b.privacy) return NextResponse.json({ errore: 'Per registrarti serve il consenso al trattamento dei dati (privacy).' }, { status: 400 });

  const db = supabaseAdmin();
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'ip';
  const { data: tentativi } = await db.rpc('conta_tentativo', { p_chiave: `registra:${ip}` });
  if ((tentativi || 0) > 8) return NextResponse.json({ errore: 'Troppi tentativi: riprova tra un\'ora o chiama la segreteria.' }, { status: 429 });

  // già cliente (anche senza password): niente doppioni, va ad Accedi / Primo accesso
  const { data: stato } = await db.rpc('stato_accesso', { p_email: email });
  if (stato?.stato && stato.stato !== 'sconosciuta') {
    return NextResponse.json({ errore: 'Sei già nostro cliente con questa email: entra da "Accedi" (la prima volta ti fa creare la password).', gia: true }, { status: 409 });
  }
  const { data: esistente } = await db.rpc('utente_da_email', { p_email: email });
  if (esistente) return NextResponse.json({ errore: MESSAGGI.email_gia_registrata, gia: true }, { status: 409 });

  const pal = await palestraPubblica();
  const { data: creato, error: e1 } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (e1 || !creato?.user) return NextResponse.json({ errore: 'Registrazione non riuscita. Riprova tra poco.' }, { status: 500 });

  const figli = (Array.isArray(b.figli) ? b.figli : []).slice(0, 6)
    .map((f) => ({ nome: String(f.nome || '').trim(), cognome: String(f.cognome || '').trim(), nascita: f.nascita || null }));
  const { data, error } = await db.rpc('registra_cliente', {
    p_user: creato.user.id,
    p: {
      palestra_id: pal.id, email, nome: String(b.nome || '').trim(), cognome: String(b.cognome || '').trim(),
      telefono: String(b.telefono || '').trim(), frequenta: !!b.frequenta, nascita: b.nascita || null,
      figli, privacy: true, marketing: !!b.marketing,
    },
  });
  if (error) {
    await db.auth.admin.deleteUser(creato.user.id);   // niente accesso a metà
    const k = Object.keys(MESSAGGI).find((x) => error.message?.includes(x));
    return NextResponse.json({ errore: MESSAGGI[k] || 'Registrazione non riuscita. Riprova.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, allievi: data?.allievi || [] });
}
