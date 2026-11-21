-- 185 — Ingresso: biglietti di un evento accettati anche durante l'ingresso di un altro
-- • In ogni evento: «i suoi biglietti si accettano anche durante l'ingresso di…» (es. i biglietti della festa delle 19
--   valgono già all'ingresso dello spettacolo delle 18). Lo scanner dà OK con il nome e il colore dell'evento giusto.
-- • L'ingresso restituisce anche colore e posizione dell'evento del biglietto.
-- Va dopo la 170–184. Si può rilanciare.

alter table biglietteria_spettacoli add column if not exists accetta_durante uuid[] not null default '{}';

create or replace function biglietteria_ingresso(p_codice text, p_spettacolo uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x biglietteria_biglietti; r biglietteria_prenotazioni; s biglietteria_spettacoli; v_esito text; v_prima timestamptz;
begin
  select * into x from biglietteria_biglietti where codice = upper(btrim(coalesce(p_codice, '')));
  if not found then return jsonb_build_object('esito', 'non_trovato'); end if;
  if not is_staff(x.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into r from biglietteria_prenotazioni where id = x.prenotazione_id;
  select * into s from biglietteria_spettacoli where id = r.spettacolo_id;
  v_prima := x.entrato_at;
  if r.stato not in ('pagata', 'gratis') then v_esito := 'non_valido';
  elsif p_spettacolo is not null and p_spettacolo <> s.id and not (p_spettacolo = any(coalesce(s.accetta_durante, '{}'))) then v_esito := 'altro_spettacolo';
  elsif x.entrato_at is not null then v_esito := 'gia_entrato';
  else
    update biglietteria_biglietti set entrato_at = now(), entrato_da = auth.uid() where id = x.id;
    v_esito := 'ok';
  end if;
  return jsonb_build_object('esito', v_esito, 'codice', x.codice, 'numero', x.numero, 'di', r.posti,
    'nome', coalesce(x.nome, r.nome || ' ' || r.cognome), 'prenotato_da', r.nome || ' ' || r.cognome, 'prenotata_il', r.created_at, 'allievo', r.allievo_nome, 'pizze', case when x.numero = 1 then r.pizze else 0 end, 'extra_testo', case when x.numero = 1 then biglietteria_extra_testo(r.extra, r.pizze) end,
    'spettacolo', s.titolo, 'spettacolo_id', s.id, 'colore', s.colore,
    'n_evento', (select count(*) from biglietteria_spettacoli z where z.biglietteria_id = s.biglietteria_id
                  and (z.ordine < s.ordine or (z.ordine = s.ordine and z.inizio <= s.inizio))),
    'per_altro_evento', p_spettacolo is not null and p_spettacolo <> s.id, 'inizio', s.inizio, 'entrato_prima', v_prima, 'stato', r.stato,
    'entrati', (select count(*) from biglietteria_biglietti y join biglietteria_prenotazioni z on z.id = y.prenotazione_id
                 where z.spettacolo_id = s.id and y.entrato_at is not null),
    'attesi', (select coalesce(sum(posti), 0) from biglietteria_prenotazioni where spettacolo_id = s.id and stato in ('pagata', 'gratis')));
end $$;
grant execute on function biglietteria_ingresso(text, uuid) to authenticated;

notify pgrst, 'reload schema';
