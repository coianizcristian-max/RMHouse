import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const MAX = 6 * 1024 * 1024;
const TIPI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };

// Carica una foto o una locandina nell'archivio pubblico e restituisce l'indirizzo
export async function POST(request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 });
  const { data: staff } = await supabase.from('staff').select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return NextResponse.json({ errore: 'Servono i permessi di segreteria.' }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const cartella = String(form?.get('cartella') || 'varie').replace(/[^a-z0-9-]/gi, '');
  if (!(file instanceof File)) return NextResponse.json({ errore: 'Nessun file.' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ errore: 'File troppo grande: massimo 6 MB.' }, { status: 400 });
  const est = TIPI[file.type];
  if (!est) return NextResponse.json({ errore: 'Formato non valido: usa JPG, PNG, WEBP o PDF.' }, { status: 400 });

  const db = supabaseAdmin();
  const percorso = `${staff.palestra_id}/${cartella}/${Date.now()}.${est}`;
  const { error } = await db.storage.from('media')
    .upload(percorso, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) {
    console.error(error);
    return NextResponse.json({ errore: 'Caricamento non riuscito.' }, { status: 500 });
  }
  const { data } = db.storage.from('media').getPublicUrl(percorso);
  return NextResponse.json({ url: data.publicUrl });
}
