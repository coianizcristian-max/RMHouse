import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { staffApi } from '@/lib/staffApi';
import { collegaConCodice, provaFirma, ErroreSatispay } from '@/lib/satispay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Collega Satispay Business con il codice di attivazione (solo l'amministratore).
// Le chiavi si creano qui sul server e vanno nella tabella che nessun browser può leggere.
export async function POST(request) {
  const s = await staffApi();
  if (!s || s.staff.ruolo !== 'admin') return NextResponse.json({ errore: 'Solo l\'amministratore può collegare Satispay.' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const codice = String(b.codice || '').trim();
  const ambiente = b.ambiente === 'prova' ? 'prova' : 'reale';
  if (!/^[A-Za-z0-9]{4,12}$/.test(codice)) return NextResponse.json({ errore: 'Il codice di attivazione è di 6 caratteri (lettere e numeri): copialo dalla Dashboard di Satispay Business.' }, { status: 400 });
  try {
    const { keyId, chiave } = await collegaConCodice(codice, ambiente);
    let firma = null;
    if (ambiente === 'prova') {
      try { const t = await provaFirma({ keyId, chiave, ambiente }); firma = !!t?.signature_valid || !!t?.authentication_key; } catch { firma = false; }
    }
    const { error } = await supabaseAdmin().from('satispay_chiavi')
      .upsert({ palestra_id: s.staff.palestra_id, key_id: keyId, chiave_privata: chiave, ambiente, collegato_at: new Date().toISOString() });
    if (error) return NextResponse.json({ errore: 'Collegato, ma non sono riuscito a salvarlo: riprova.' }, { status: 500 });
    return NextResponse.json({ ok: true, ambiente, firma });
  } catch (e) {
    const msg = e instanceof ErroreSatispay && /token/i.test(e.message)
      ? 'Codice non valido o già usato: generane uno nuovo nella Dashboard Satispay Business (vale una volta sola).'
      : `Satispay non ha accettato il collegamento: ${e.message}`;
    return NextResponse.json({ errore: msg }, { status: 400 });
  }
}

export async function DELETE() {
  const s = await staffApi();
  if (!s || s.staff.ruolo !== 'admin') return NextResponse.json({ errore: 'Solo l\'amministratore.' }, { status: 403 });
  await supabaseAdmin().from('satispay_chiavi').delete().eq('palestra_id', s.staff.palestra_id);
  return NextResponse.json({ ok: true });
}
