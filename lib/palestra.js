import 'server-only';
import { supabaseAdmin } from './supabase/admin';
import { impostazioniPalestra } from './staff';

export const SLUG = process.env.NEXT_PUBLIC_PALESTRA_SLUG || 'rmhouse';

export async function palestraPubblica() {
  const { data, error } = await supabaseAdmin()
    .from('palestre')
    .select('id, slug, nome, giorni_prenotabili, preavviso_ore, fuso_orario')
    .eq('slug', SLUG)
    .single();
  if (error) throw new Error('Palestra non trovata: controlla NEXT_PUBLIC_PALESTRA_SLUG');
  return data;
}

// Come la scuola vuole l'area clienti: benvenuto, avviso in evidenza, colore
// (dalla memoria del server: prima layout e pagina dell'area lo rileggevano a ogni apertura)
export async function aspettoAreaCliente() {
  const p = await impostazioniPalestra(SLUG);
  return p?.area_cliente || {};
}
