import { NextResponse } from 'next/server';
import { staffApi } from '@/lib/staffApi';
import { chiediAlTelefono, leggiPagamento, annullaPagamento, ErroreSatispay } from '@/lib/satispay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Sportello: la segreteria manda la richiesta di pagamento sull'app Satispay del cliente,
// poi controlla (ogni pochi secondi) se l'ha accettata. Solo staff.
export async function POST(request) {
  const s = await staffApi();
  if (!s || s.staff.ruolo === 'insegnante') return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const importo = Number(b.importo_cent);
  if (!Number.isInteger(importo) || importo <= 0) return NextResponse.json({ errore: 'Importo non valido.' }, { status: 400 });
  if (String(b.telefono || '').replace(/\D/g, '').length < 8) return NextResponse.json({ errore: 'Scrivi il cellulare del cliente (quello di Satispay).' }, { status: 400 });
  try {
    const p = await chiediAlTelefono({
      telefono: b.telefono, importoCent: importo,
      riferimento: `sportello:${String(b.allievo_id || '').slice(0, 36)}`, descrizione: b.descrizione,
    });
    return NextResponse.json({ id: p.id, stato: p.status });
  } catch (e) {
    return NextResponse.json({ errore: e instanceof ErroreSatispay ? e.message : 'Satispay non risponde: riprova.' }, { status: e.stato === 404 ? 404 : 502 });
  }
}

export async function GET(request) {
  const s = await staffApi();
  if (!s) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id');
  try {
    const p = await leggiPagamento(id);
    return NextResponse.json({ id: p.id, stato: p.expired && p.status === 'PENDING' ? 'EXPIRED' : p.status, importo_cent: p.amount_unit });
  } catch (e) {
    return NextResponse.json({ errore: e.message }, { status: 502 });
  }
}

export async function DELETE(request) {
  const s = await staffApi();
  if (!s) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id');
  try { const p = await annullaPagamento(id); return NextResponse.json({ stato: p.status }); }
  catch (e) { return NextResponse.json({ errore: e.message }, { status: 502 }); }
}
