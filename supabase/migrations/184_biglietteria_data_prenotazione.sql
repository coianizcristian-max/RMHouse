-- 184 — Ingresso: anche il giorno in cui è stata fatta la prenotazione (scanner e presenze)
-- Va dopo la 170–183. Si può rilanciare.

create or replace function biglietteria_presenze(p_biglietteria uuid, p_spettacolo uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pal uuid;
begin
  select palestra_id into v_pal from biglietterie where id = p_biglietteria;
  if v_pal is null or not is_staff(v_pal) then raise exception 'non_autorizzato'; end if;
  return (
    with t as (
      select x.id, x.codice, x.numero, x.entrato_at, coalesce(x.nome, pr.nome || ' ' || pr.cognome) as nome,
             pr.nome || ' ' || pr.cognome as prenotato_da, pr.created_at as prenotata_il, pr.allievo_nome as allievo, s.id as spettacolo_id, s.titolo as spettacolo, s.inizio
        from biglietteria_biglietti x
        join biglietteria_prenotazioni pr on pr.id = x.prenotazione_id
        join biglietteria_spettacoli s on s.id = pr.spettacolo_id
       where s.biglietteria_id = p_biglietteria and pr.stato in ('pagata', 'gratis')
         and (p_spettacolo is null or s.id = p_spettacolo))
    select jsonb_build_object(
      'attesi', (select count(*) from t),
      'entrati', (select count(*) from t where entrato_at is not null),
      'mancanti', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'codice', codice, 'nome', nome, 'prenotato_da', prenotato_da, 'prenotata_il', prenotata_il,
                              'allievo', allievo, 'spettacolo', spettacolo, 'inizio', inizio) order by inizio, nome) from t where entrato_at is null), '[]'::jsonb),
      'dentro', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'codice', codice, 'nome', nome, 'prenotato_da', prenotato_da, 'prenotata_il', prenotata_il,
                              'allievo', allievo, 'spettacolo', spettacolo, 'entrato_at', entrato_at) order by entrato_at desc) from t where entrato_at is not null), '[]'::jsonb))
  );
end $$;
revoke all on function biglietteria_presenze(uuid, uuid) from public, anon;
grant execute on function biglietteria_presenze(uuid, uuid) to authenticated;

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
  elsif p_spettacolo is not null and p_spettacolo <> s.id then v_esito := 'altro_spettacolo';
  elsif x.entrato_at is not null then v_esito := 'gia_entrato';
  else
    update biglietteria_biglietti set entrato_at = now(), entrato_da = auth.uid() where id = x.id;
    v_esito := 'ok';
  end if;
  return jsonb_build_object('esito', v_esito, 'codice', x.codice, 'numero', x.numero, 'di', r.posti,
    'nome', coalesce(x.nome, r.nome || ' ' || r.cognome), 'prenotato_da', r.nome || ' ' || r.cognome, 'prenotata_il', r.created_at, 'allievo', r.allievo_nome, 'pizze', case when x.numero = 1 then r.pizze else 0 end, 'extra_testo', case when x.numero = 1 then biglietteria_extra_testo(r.extra, r.pizze) end,
    'spettacolo', s.titolo, 'spettacolo_id', s.id, 'inizio', s.inizio, 'entrato_prima', v_prima, 'stato', r.stato,
    'entrati', (select count(*) from biglietteria_biglietti y join biglietteria_prenotazioni z on z.id = y.prenotazione_id
                 where z.spettacolo_id = s.id and y.entrato_at is not null),
    'attesi', (select coalesce(sum(posti), 0) from biglietteria_prenotazioni where spettacolo_id = s.id and stato in ('pagata', 'gratis')));
end $$;
grant execute on function biglietteria_ingresso(text, uuid) to authenticated;

notify pgrst, 'reload schema';
