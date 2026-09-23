-- =====================================================================
-- RMHouse — 022 LISTA D'ATTESA VERA
-- Finora si poteva solo togliere qualcuno dalla coda, e l'avviso
-- automatico funzionava solo sulle singole lezioni. Qui si aggiungono:
-- la posizione in coda, l'avviso a mano, l'avviso automatico quando si
-- libera un posto nel corso, la chiusura con esito.
-- Da eseguire dopo 001…021.
-- =====================================================================

alter table liste_attesa add column if not exists note text;
alter table liste_attesa add column if not exists esito text
  check (esito in ('iscritto', 'rinunciato', 'scaduto', 'altro'));

-- ---------------------------------------------------------------------
-- 1. LA CODA, CON POSIZIONE E POSTI LIBERI DEL CORSO
-- ---------------------------------------------------------------------
create or replace view v_attese with (security_invoker = true) as
  select la.id, la.palestra_id, la.tipo, la.stato, la.esito, la.note,
         la.created_at, la.avvisato_at,
         la.corso_id, c.nome as corso, c.colore,
         la.lezione_id, l.inizio as lezione_inizio,
         la.allievo_id, a.nome, a.cognome, a.data_nascita, a.foto_url,
         la.account_id, acc.nome as titolare_nome, acc.cognome as titolare_cognome,
         acc.email, acc.telefono,
         row_number() over (partition by la.corso_id, coalesce(la.lezione_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                         la.stato order by la.created_at) as posizione,
         -- quanti posti ha libero il corso adesso, contando gli iscritti attivi
         greatest(coalesce(c.capienza, 0) -
                  (select count(*) from iscrizioni i where i.corso_id = c.id and i.stato = 'attiva'), 0) as posti_corso,
         (select count(*) from iscrizioni i
           where i.allievo_id = la.allievo_id and i.corso_id = la.corso_id and i.stato = 'attiva') > 0 as gia_iscritto
  from liste_attesa la
  join corsi c on c.id = la.corso_id
  join allievi a on a.id = la.allievo_id
  join account acc on acc.id = la.account_id
  left join lezioni l on l.id = la.lezione_id;

-- ---------------------------------------------------------------------
-- 2. AVVISARE UNA PERSONA DELLA CODA, A MANO
-- ---------------------------------------------------------------------
create or replace function avvisa_attesa(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare la liste_attesa; v_pal palestre; v_corso text; v_quando text;
begin
  select * into la from liste_attesa where id = p_id;
  if not found then raise exception 'attesa_non_trovata'; end if;
  if not is_gestione(la.palestra_id) then raise exception 'non_autorizzato'; end if;

  select * into v_pal from palestre where id = la.palestra_id;
  select c.nome into v_corso from corsi c where c.id = la.corso_id;
  select to_char(l.inizio at time zone v_pal.fuso_orario, 'DD/MM alle HH24:MI')
    into v_quando from lezioni l where l.id = la.lezione_id;

  perform accoda_messaggio(la.palestra_id, 'posto_libero', la.account_id, la.allievo_id,
    'attesa:' || la.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'), now(),
    jsonb_build_object('corso', v_corso, 'data', coalesce(v_quando, 'i prossimi giorni'),
                       'palestra', v_pal.nome,
                       'link_prenota', coalesce(v_pal.base_url, '') || '/prova'));

  update liste_attesa set stato = 'avvisato', avvisato_at = now() where id = p_id;
end $$;

-- Chiude la posizione in coda dicendo com'è finita
create or replace function chiudi_attesa(p_id uuid, p_esito text default 'altro', p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare la liste_attesa;
begin
  select * into la from liste_attesa where id = p_id;
  if not found then raise exception 'attesa_non_trovata'; end if;
  if not is_gestione(la.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_esito not in ('iscritto', 'rinunciato', 'scaduto', 'altro') then raise exception 'esito_non_valido'; end if;

  update liste_attesa
     set stato = 'chiuso', esito = p_esito, note = coalesce(nullif(trim(p_note), ''), note)
   where id = p_id;
end $$;

grant execute on function avvisa_attesa(uuid) to authenticated;
grant execute on function chiudi_attesa(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. AVVISO AUTOMATICO QUANDO SI LIBERA UN POSTO NEL CORSO
--    (prima funzionava solo sulle singole lezioni)
-- ---------------------------------------------------------------------
create or replace function avvisa_attesa_corso(p_corso uuid, p_quanti int default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_liberi int; n int := 0; v_cap int; v_iscritti int;
begin
  select coalesce(capienza, 0) into v_cap from corsi where id = p_corso;
  select count(*) into v_iscritti from iscrizioni where corso_id = p_corso and stato = 'attiva';
  v_liberi := coalesce(p_quanti, greatest(v_cap - v_iscritti, 0));
  if v_liberi <= 0 then return 0; end if;

  for r in
    select la.id from liste_attesa la
     where la.corso_id = p_corso and la.lezione_id is null and la.stato = 'in_attesa'
     order by la.created_at
     limit v_liberi
  loop
    perform avvisa_attesa(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function avvisa_attesa_corso(uuid, int) to authenticated;

-- Quando un'iscrizione si chiude, il posto torna libero: avvisa il primo
create or replace function trg_iscrizioni_attesa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.stato = 'attiva' and new.stato in ('annullata', 'scaduta') then
    perform avvisa_attesa_corso(new.corso_id, 1);
  end if;
  return new;
end $$;

drop trigger if exists iscrizioni_attesa on iscrizioni;
create trigger iscrizioni_attesa after update of stato on iscrizioni
  for each row execute function trg_iscrizioni_attesa();

-- ---------------------------------------------------------------------
-- 4. QUANTE PERSONE ASPETTANO, PER CORSO
-- ---------------------------------------------------------------------
create or replace function conta_attese(p_palestra uuid)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'in_attesa', count(*) filter (where stato = 'in_attesa'),
    'avvisati', count(*) filter (where stato = 'avvisato'),
    'da_richiamare', count(*) filter (where stato = 'avvisato' and avvisato_at < now() - interval '3 days'),
    'per_corso', coalesce((
      select jsonb_agg(jsonb_build_object('corso', corso, 'quanti', quanti) order by quanti desc)
      from (select c.nome as corso, count(*) as quanti
              from liste_attesa la join corsi c on c.id = la.corso_id
             where la.palestra_id = p_palestra and la.stato = 'in_attesa'
             group by c.nome) t), '[]'::jsonb)
  )
  from liste_attesa where palestra_id = p_palestra;
$$;
