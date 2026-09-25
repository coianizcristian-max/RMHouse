import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { stripeAttivo, stripe, baseUrl } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Il portale di Stripe dove il cliente cambia carta o disdice il rinnovo automatico
export async function GET(request) {
  const sito = baseUrl(request);
  if (!stripeAttivo()) return NextResponse.redirect(`${sito}/area/pagamenti`);
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${sito}/area/accedi`);
  const { data: acc } = await supabase.from('account').select('stripe_customer_id').eq('user_id', user.id).not('stripe_customer_id', 'is', null).limit(1).maybeSingle();
  if (!acc) return NextResponse.redirect(`${sito}/area/pagamenti`);
  try {
    const s = await stripe('POST', 'billing_portal/sessions', { customer: acc.stripe_customer_id, return_url: `${sito}/area/pagamenti`, locale: 'it' });
    return NextResponse.redirect(s.url);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${sito}/area/pagamenti?portale=0`);
  }
}
