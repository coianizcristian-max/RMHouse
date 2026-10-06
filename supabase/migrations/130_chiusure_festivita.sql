-- =====================================================================
-- RMHouse — 130 CHIUSURE E FESTIVITÀ
--
--  • Se una chiusura si cancella (messa per sbaglio) le lezioni che aveva annullato tornano in programma;
--    se si cambiano le date, si rimettono quelle fuori dal nuovo periodo e si annullano quelle nuove.
--  • aggiungi_festivita(palestra, stagione): mette in un colpo le feste nazionali della stagione
--    (Ognissanti, Immacolata, Natale, S. Stefano, Capodanno, Epifania, Pasqua, Pasquetta, 25 aprile, 1° maggio, 2 giugno)
--    senza doppioni. Le lezioni di quei giorni si annullano senza mandare un avviso per ogni festa.
-- Si può eseguire più volte. Va dopo la 129.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_chiusure_annulla()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ids uuid[]; r record; n int; pal palestre; v_periodo text; v_testo text;
begin
  select * into pal from palestre where id = new.palestra_id;
  select coalesce(array_agg(id), '{}') into v_ids from lezioni
   where palestra_id = new.palestra_id and data between new.dal and new.al and stato = 'programmata' and svolta_da is null;
  if cardinality(v_ids) = 0 then return new; end if;
  v_periodo := case when new.dal = new.al then 'il ' || to_char(new.dal, 'DD/MM')
                    else 'dal ' || to_char(new.dal, 'DD/MM') || ' al ' || to_char(new.al, 'DD/MM') end;
  v_testo := 'La scuola resta chiusa ' || v_periodo || coalesce(' (' || nullif(trim(new.motivo), '') || ')', '') || ': ';

  -- i clienti: un messaggio solo, con le loro lezioni saltate
  if coalesce(current_setting('rm.chiusura_silenziosa', true), '') <> '1' then
  for r in select a.account_id, count(distinct vp.lezione_id) as quante
             from v_partecipanti_lezione vp join allievi a on a.id = vp.allievo_id join lezioni l on l.id = vp.lezione_id
            where vp.lezione_id = any (v_ids) and l.inizio > now() and a.account_id is not null
            group by a.account_id loop
    begin
      n := 0;
      if vuole_notifica(r.account_id, 'lezioni') then
        n := accoda_push(r.account_id, 'Scuola chiusa ' || v_periodo, v_testo || r.quante || case when r.quante = 1 then ' tua lezione non si fa.' else ' tue lezioni non si fanno.' end,
                         '/area', 'chius:' || new.id || ':' || r.account_id);
      end if;
      if coalesce(n, 0) = 0 then
        insert into messaggi_coda (palestra_id, account_id, evento, canale, destinatario, oggetto, corpo, chiave)
        select new.palestra_id, acc.id, 'chiusura', 'email', acc.email, 'Scuola chiusa ' || v_periodo,
               'Ciao,' || E'\n\n' || v_testo || r.quante || case when r.quante = 1 then ' tua lezione non si fa.' else ' tue lezioni non si fanno.' end
                 || E'\n\n' || pal.nome,
               'chius-mail:' || new.id || ':' || acc.id
          from account acc where acc.id = r.account_id and acc.email is not null
        on conflict (palestra_id, chiave) do nothing;
      end if;
    exception when others then null; end;
  end loop;

  -- le insegnanti: un avviso ciascuna
  for r in select insegnante_id, count(*) as quante from lezioni where id = any (v_ids) and insegnante_id is not null and inizio > now() group by insegnante_id loop
    begin
      perform accoda_push_staff(new.palestra_id, 'lezione', 'Scuola chiusa ' || v_periodo,
        r.quante || case when r.quante = 1 then ' tua lezione annullata' else ' tue lezioni annullate' end || coalesce(' · ' || nullif(trim(new.motivo), ''), ''),
        '/gestione/calendario', null, r.insegnante_id, 'chius:' || new.id || ':' || r.insegnante_id);
    exception when others then null; end;
  end loop;

  end if;
  perform set_config('rm.chiusura', '1', true);
  perform set_config('rm.cambio_in_blocco', '1', true);
  update lezioni set stato = 'annullata', note = coalesce(new.motivo, 'Chiusura') where id = any (v_ids);
  perform set_config('rm.chiusura', '', true);
  perform set_config('rm.cambio_in_blocco', '', true);
  return new;
end $function$;

-- cancellata o spostata: le lezioni annullate da questa chiusura (e non coperte da un'altra) tornano in programma
create or replace function trg_chiusure_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('rm.chiusura', '1', true);
  perform set_config('rm.cambio_in_blocco', '1', true);
  update lezioni l set stato = 'programmata', note = null
   where l.palestra_id = old.palestra_id and l.data between old.dal and old.al and l.data >= current_date
     and l.stato = 'annullata' and coalesce(l.note, '') = coalesce(old.motivo, 'Chiusura')
     and not (tg_op = 'UPDATE' and l.data between new.dal and new.al)
     and not exists (select 1 from chiusure ch where ch.palestra_id = l.palestra_id and ch.id <> old.id and l.data between ch.dal and ch.al);
  get diagnostics n = row_count;
  perform set_config('rm.chiusura', '', true);
  perform set_config('rm.cambio_in_blocco', '', true);
  if tg_op = 'UPDATE' then
    -- il nuovo periodo: come una chiusura nuova (annulla e avvisa)
    perform set_config('rm.chiusura', '1', true);
    perform set_config('rm.cambio_in_blocco', '1', true);
    update lezioni set stato = 'annullata', note = coalesce(new.motivo, 'Chiusura')
     where palestra_id = new.palestra_id and data between new.dal and new.al and stato = 'programmata' and svolta_da is null;
    perform set_config('rm.chiusura', '', true);
    perform set_config('rm.cambio_in_blocco', '', true);
    return new;
  end if;
  return old;
end $$;
drop trigger if exists chiusure_cambio on chiusure;
create trigger chiusure_cambio after update of dal, al, motivo or delete on chiusure
  for each row execute function trg_chiusure_cambio();

-- Pasqua (calcolo di Gauss/Meeus)
create or replace function pasqua(p_anno int) returns date language sql immutable as $$
  with x as (select p_anno % 19 a, p_anno / 100 b, p_anno % 100 c),
       y as (select a, b, c, b / 4 d, b % 4 e, (b + 8) / 25 f from x),
       z as (select a, b, c, d, e, (b - f + 1) / 3 g from y),
       h as (select a, c, d, e, (19 * a + b - d - g + 15) % 30 h from z),
       k as (select a, h, c / 4 i, c % 4 k, e from h),
       l as (select a, h, (32 + 2 * e + 2 * i - h - k) % 7 l from k),
       m as (select h, l, (a + 11 * h + 22 * l) / 451 m from l)
  select make_date(p_anno, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1) from m;
$$;

create or replace function aggiungi_festivita(p_palestra uuid, p_stagione int)
returns int language plpgsql security definer set search_path = public as $$
declare f record; n int := 0; a1 int := p_stagione; a2 int := p_stagione + 1;
begin
  if not is_gestione(p_palestra) then raise exception 'non_autorizzato'; end if;
  perform set_config('rm.chiusura_silenziosa', '1', true);
  for f in
    select * from (values
      (make_date(a1, 11, 1), make_date(a1, 11, 1), 'Ognissanti'),
      (make_date(a1, 12, 8), make_date(a1, 12, 8), 'Immacolata'),
      (make_date(a1, 12, 25), make_date(a1, 12, 26), 'Natale e Santo Stefano'),
      (make_date(a2, 1, 1), make_date(a2, 1, 1), 'Capodanno'),
      (make_date(a2, 1, 6), make_date(a2, 1, 6), 'Epifania'),
      (pasqua(a2), pasqua(a2) + 1, 'Pasqua e Pasquetta'),
      (make_date(a2, 4, 25), make_date(a2, 4, 25), 'Festa della Liberazione'),
      (make_date(a2, 5, 1), make_date(a2, 5, 1), 'Festa dei lavoratori'),
      (make_date(a2, 6, 2), make_date(a2, 6, 2), 'Festa della Repubblica')
    ) v(dal, al, motivo)
  loop
    -- già coperta da una chiusura (es. vacanze di Natale messe a mano): non si duplica
    continue when exists (select 1 from chiusure ch where ch.palestra_id = p_palestra and ch.dal <= f.al and ch.al >= f.dal);
    insert into chiusure (palestra_id, dal, al, motivo) values (p_palestra, f.dal, f.al, f.motivo);
    n := n + 1;
  end loop;
  perform set_config('rm.chiusura_silenziosa', '', true);
  return n;
end $$;
revoke execute on function aggiungi_festivita(uuid, int) from public, anon;
grant execute on function aggiungi_festivita(uuid, int) to authenticated;
