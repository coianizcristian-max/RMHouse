import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const MAX = 8 * 1024 * 1024;
const TIPI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// Caricamento del certificato medico dal link personale dell'allievo
export async function POST(request) {
  const form = await request.formData().catch(() => null);
  const token = form?.get('token');
  const file = form?.get('file');
  const scadenza = form?.get('scadenza');
  if (!form || typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token) || !(file instanceof File)) {
    return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 });
  }
  if (typeof scadenza === 'string' && scadenza && !/^\d{4}-\d{2}-\d{2}$/.test(scadenza)) {
    return NextResponse.json({ errore: 'Data di scadenza non valida.' }, { status: 400 });
  }
  if (file.size > MAX) return NextResponse.json({ errore: 'Il file è troppo grande: massimo 8 MB.' }, { status: 400 });
  const est = TIPI[file.type];
  if (!est) return NextResponse.json({ errore: 'Formato non valido: manda una foto o un PDF.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: allievo } = await db.from('allievi').select('id, palestra_id').eq('token', token).maybeSingle();
  if (!allievo) return NextResponse.json({ errore: 'Link non valido.' }, { status: 404 });

  const percorso = `${allievo.palestra_id}/${allievo.id}/${Date.now()}.${est}`;
  const { error: errFile } = await db.storage.from('certificati')
    .upload(percorso, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (errFile) {
    console.error(errFile);
    return NextResponse.json({ errore: 'Caricamento non riuscito. Riprova.' }, { status: 500 });
  }

  const { error } = await db.rpc('registra_certificato', {
    p_token: token, p_file: percorso, p_nome_file: file.name?.slice(0, 120) || null,
    p_scadenza: typeof scadenza === 'string' && scadenza ? scadenza : null,
  });
  if (error) {
    console.error(error);
    return NextResponse.json({ errore: 'Salvataggio non riuscito. Riprova.' }, { status: 500 });
  }

  // caricato dalla segreteria (con il documento in mano): risulta subito approvato
  if (form.get('segreteria') === '1' && typeof scadenza === 'string' && scadenza) {
    const server = await supabaseServer();
    const { data: { user } } = await server.auth.getUser();
    if (user) {
      const { data: staff } = await db.from('staff').select('ruolo').eq('user_id', user.id).eq('palestra_id', allievo.palestra_id).eq('attivo', true).maybeSingle();
      if (staff && staff.ruolo !== 'insegnante') {
        await db.from('certificati').update({ stato: 'valido', scadenza, verificato_da: user.id, verificato_at: new Date().toISOString() })
          .eq('allievo_id', allievo.id).eq('file_path', percorso);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
