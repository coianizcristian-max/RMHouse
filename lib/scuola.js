import 'server-only';
import { supabaseAdmin } from './supabase/admin';
import { SLUG } from './palestra';

// Dati della scuola per le pagine legali (titolare del trattamento)
export async function datiScuola() {
  const { data } = await supabaseAdmin().from('palestre')
    .select('nome, indirizzo, telefono, email, dati_fiscali, base_url').eq('slug', SLUG).maybeSingle();
  return data || { nome: 'Ritmo Metropolitano' };
}
