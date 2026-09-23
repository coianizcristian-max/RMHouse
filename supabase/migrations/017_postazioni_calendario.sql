-- =====================================================================
-- RMHouse — 017 POSTAZIONI, CALENDARIO DEGLI INSEGNANTI, EVENTI DALL'AREA
-- Da eseguire dopo 001…016.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. POSTAZIONI: la pertica, il tessuto, il tappetino
--    Si abilitano solo sulle sale dove servono.
-- ---------------------------------------------------------------------
alter table sale add column if not exists gestione_postazioni boolean not null default false;

create table if not exists postazioni (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  sala_id     uuid not null references sale(id) on delete cascade,
  nome        text not null,
  ordine      int not null default 0,
  attiva      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  unique (sala_id, nome)
);
create index if not exists postazioni_sala on postazioni (sala_id, ordine);

create table if not exists assegnazioni_postazione (
  id            uuid primary key default gen_random_uuid(),
  palestra_id   uuid not null references palestre(id) on delete cascade,
  lezione_id    uuid not null references lezioni(id) on delete cascade,
  postazione_id uuid not null references postazioni(id) on delete cascade,
  allievo_id    uuid not null references allievi(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (lezione_id, postazione_id),
  unique (lezione_id, allievo_id)
);

alter table postazioni enable row level security;
alter table assegnazioni_postazione enable row level security;

drop policy if exists staff_legge on postazioni;
create policy staff_legge on postazioni for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on postazioni;
create policy gestione_scrive on postazioni for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

drop policy if exists staff_legge on assegnazioni_postazione;
create policy staff_legge on assegnazioni_postazione for select to authenticated using (is_staff(palestra_id));
drop policy if exists staff_scrive on assegnazioni_postazione;
create policy staff_scrive on assegnazioni_postazione for all to authenticated
  using (is_staff(palestra_id)) with check (is_staff(palestra_id));
drop policy if exists cliente_legge on assegnazioni_postazione;
create policy cliente_legge on assegnazioni_postazione for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));

-- Crea in un colpo le postazioni numerate di una sala (Pertica 1, Pertica 2…)
create or replace function crea_postazioni(p_sala uuid, p_quante int, p_prefisso text default 'Postazione')
returns int language plpgsql security definer set search_path = public as $$
declare s sale; i int; n int := 0;
begin
  select * into s from sale where id = p_sala;
  if not found then raise exception 'sala_non_trovata'; end if;
  if not is_gestione(s.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_quante < 1 or p_quante > 60 then raise exception 'numero_non_valido'; end if;

  for i in 1..p_quante loop
    insert into postazioni (palestra_id, sala_id, nome, ordine)
    values (s.palestra_id, s.id, p_prefisso || ' ' || i, i)
    on conflict (sala_id, nome) do nothing;
    n := n + 1;
  end loop;

  update sale set gestione_postazioni = true where id = p_sala;
  return n;
end $$;

-- Chi sta dove in una certa lezione
create or replace function postazioni_lezione(p_lezione uuid)
returns table (postazione_id uuid, nome text, ordine int, allievo_id uuid, allievo text)
language sql stable security invoker as $$
  select p.id, p.nome, p.ordine, a.allievo_id, al.nome || ' ' || al.cognome
  from lezioni l
  join postazioni p on p.sala_id = l.sala_id and p.attiva
  left join assegnazioni_postazione a on a.lezione_id = l.id and a.postazione_id = p.id
  left join allievi al on al.id = a.allievo_id
  where l.id = p_lezione
  order by p.ordine, p.nome;
$$;

create or replace function assegna_postazione(p_lezione uuid, p_postazione uuid, p_allievo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l lezioni;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  if not is_staff(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  if not exists (select 1 from v_partecipanti_lezione where lezione_id = p_lezione and allievo_id = p_allievo) then
    raise exception 'non_partecipa_alla_lezione';
  end if;
  if not exists (select 1 from postazioni po where po.id = p_postazione and po.sala_id = l.sala_id and po.attiva) then
    raise exception 'postazione_non_valida';
  end if;

  delete from assegnazioni_postazione where lezione_id = p_lezione and allievo_id = p_allievo;
  insert into assegnazioni_postazione (palestra_id, lezione_id, postazione_id, allievo_id)
  values (l.palestra_id, p_lezione, p_postazione, p_allievo)
  on conflict (lezione_id, postazione_id) do update set allievo_id = excluded.allievo_id;
end $$;

create or replace function libera_postazione(p_lezione uuid, p_postazione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l lezioni;
begin
  select * into l from lezioni where id = p_lezione;
  if not found or not is_staff(l.palestra_id) then raise exception 'non_autorizzato'; end if;
  delete from assegnazioni_postazione where lezione_id = p_lezione and postazione_id = p_postazione;
end $$;

grant execute on function crea_postazioni(uuid, int, text) to authenticated;
grant execute on function assegna_postazione(uuid, uuid, uuid) to authenticated;
grant execute on function libera_postazione(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. CALENDARIO DA ABBONARE PER GLI INSEGNANTI
--    Ogni insegnante ha un indirizzo personale che Google o iPhone
--    rileggono da soli: le lezioni restano sempre aggiornate.
-- ---------------------------------------------------------------------
alter table staff add column if not exists token uuid not null default gen_random_uuid();
create unique index if not exists staff_token_unico on staff (token);

create or replace function lezioni_calendario(p_token uuid)
returns table (
  lezione_id uuid, corso text, inizio timestamptz, fine timestamptz,
  sala text, stato text, iscritti int, capienza int, aggiornato timestamptz, scuola text
)
language sql stable security definer set search_path = public as $$
  select l.id, c.nome, l.inizio, l.fine, s.nome, l.stato::text,
         (select count(*)::int from v_partecipanti_lezione vp where vp.lezione_id = l.id),
         coalesce(l.capienza_override, c.capienza, s.capienza),
         now(),
         pal.nome
  from staff st
  join lezioni l on l.insegnante_id = st.id
  join corsi c on c.id = l.corso_id
  join palestre pal on pal.id = l.palestra_id
  left join sale s on s.id = l.sala_id
  where st.token = p_token and st.attivo and not st.archiviato
    and l.inizio between now() - interval '30 days' and now() + interval '120 days'
  order by l.inizio;
$$;

-- ---------------------------------------------------------------------
-- 3. ISCRIZIONE AGLI EVENTI DALL'AREA CLIENTE
-- ---------------------------------------------------------------------
drop policy if exists cliente_legge on iscrizioni_evento;
create policy cliente_legge on iscrizioni_evento for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));

create or replace function iscrivi_evento(p_evento uuid, p_allievo uuid, p_persone int default 1, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare e eventi; a allievi; v_posti int; v_id uuid; v_mio boolean;
begin
  select * into e from eventi where id = p_evento for update;
  if not found then raise exception 'evento_non_trovato'; end if;
  if not e.prenotabile then raise exception 'evento_non_prenotabile'; end if;
  if e.inizio < now() then raise exception 'evento_gia_passato'; end if;

  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  select a.account_id in (select miei_account()) into v_mio;
  if auth.uid() is not null and not is_gestione(e.palestra_id) and not v_mio then
    raise exception 'non_autorizzato';
  end if;

  if exists (select 1 from iscrizioni_evento where evento_id = p_evento and allievo_id = p_allievo and stato <> 'annullato') then
    raise exception 'gia_iscritto';
  end if;

  if e.posti is not null then
    select coalesce(sum(persone), 0) into v_posti from iscrizioni_evento
     where evento_id = p_evento and stato <> 'annullato';
    if v_posti + greatest(p_persone, 1) > e.posti then raise exception 'posti_esauriti'; end if;
  end if;

  insert into iscrizioni_evento (palestra_id, evento_id, allievo_id, nome, email, telefono, persone, note)
  select e.palestra_id, e.id, a.id, a.nome || ' ' || a.cognome, acc.email, acc.telefono,
         greatest(p_persone, 1), p_note
  from account acc where acc.id = a.account_id
  returning id into v_id;

  -- se l'evento è a pagamento resta il dovuto in segreteria
  if e.prezzo_cent > 0 then
    insert into pagamenti (palestra_id, account_id, causale, descrizione, importo_cent, stato)
    select e.palestra_id, a.account_id, 'evento',
           e.titolo || ' — ' || a.nome || ' ' || a.cognome,
           e.prezzo_cent * greatest(p_persone, 1), 'in_attesa'::stato_pagamento;
  end if;

  return v_id;
end $$;

create or replace function annulla_iscrizione_evento(p_iscrizione uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i iscrizioni_evento; v_mio boolean;
begin
  select * into i from iscrizioni_evento where id = p_iscrizione;
  if not found then raise exception 'iscrizione_non_trovata'; end if;
  select exists (select 1 from allievi a where a.id = i.allievo_id and a.account_id in (select miei_account()))
    into v_mio;
  if auth.uid() is not null and not is_gestione(i.palestra_id) and not v_mio then raise exception 'non_autorizzato'; end if;

  update iscrizioni_evento set stato = 'annullato' where id = p_iscrizione;
end $$;

grant execute on function iscrivi_evento(uuid, uuid, int, text) to authenticated;
grant execute on function annulla_iscrizione_evento(uuid) to authenticated;

-- Gli eventi che il cliente vede nella sua area, con posti e sua iscrizione
create or replace function eventi_area()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acc uuid; v_pal uuid;
begin
  select id, palestra_id into v_acc, v_pal from account where user_id = auth.uid() limit 1;
  if v_acc is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'titolo', e.titolo, 'descrizione', e.descrizione, 'locandina', e.locandina_url,
      'inizio', e.inizio, 'fine', e.fine, 'luogo', e.luogo,
      'prenotabile', e.prenotabile, 'prezzo_cent', e.prezzo_cent, 'posti', e.posti,
      'occupati', (select coalesce(sum(ie.persone), 0) from iscrizioni_evento ie
                    where ie.evento_id = e.id and ie.stato <> 'annullato'),
      'iscritti', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', ie.id, 'allievo_id', ie.allievo_id, 'nome', ie.nome, 'persone', ie.persone)), '[]'::jsonb)
                   from iscrizioni_evento ie join allievi a on a.id = ie.allievo_id
                   where ie.evento_id = e.id and ie.stato <> 'annullato' and a.account_id = v_acc)
    ) order by e.inizio)
    from eventi e
    where e.palestra_id = v_pal and e.visibilita in ('pubblico', 'privato') and e.inizio > now()
  ), '[]'::jsonb);
end $$;

grant execute on function eventi_area() to authenticated;

-- ---------------------------------------------------------------------
-- 4. SEDE NELLE LEZIONI: per filtrare il calendario quando le sedi sono più d'una
-- ---------------------------------------------------------------------
drop view if exists v_occupazione;
create view v_occupazione with (security_invoker = true) as
  select l.id as lezione_id, l.palestra_id, l.corso_id, l.data, l.inizio, l.fine, l.stato,
         l.insegnante_id, l.sala_id, l.prenotabile, l.note,
         c.nome as corso_nome, c.colore, c.visibilita, c.foto_url as corso_foto,
         s.nome as sala_nome, s.gestione_postazioni,
         coalesce(s.sede_id, c.sede_id) as sede_id, se.nome as sede_nome,
         st.nome as insegnante_nome, st.foto_url as insegnante_foto, st.colore as insegnante_colore,
         coalesce(l.capienza_override, c.capienza, s.capienza) as capienza,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo <> 'prova') as iscritti,
         (select count(*) from v_partecipanti_lezione vp where vp.lezione_id = l.id and vp.tipo = 'prova') as prove,
         (select count(*) from presenze ps where ps.lezione_id = l.id and ps.presente) as presenti,
         (select count(*) from presenze ps where ps.lezione_id = l.id and not ps.presente) as assenti,
         round(extract(epoch from (l.fine - l.inizio)) / 3600.0, 2) as ore
  from lezioni l
  join corsi c on c.id = l.corso_id
  left join sale s on s.id = l.sala_id
  left join sedi se on se.id = coalesce(s.sede_id, c.sede_id)
  left join staff st on st.id = l.insegnante_id;

-- ---------------------------------------------------------------------
-- 5. SALE E CORSI SENZA SEDE: vanno alla sede principale
--    (capita a quelli creati dopo la migrazione delle sedi)
-- ---------------------------------------------------------------------
update sale s set sede_id = (select id from sedi se where se.palestra_id = s.palestra_id and se.principale limit 1)
 where s.sede_id is null;
update corsi c set sede_id = (select id from sedi se where se.palestra_id = c.palestra_id and se.principale limit 1)
 where c.sede_id is null;

create or replace function trg_sede_predefinita()
returns trigger language plpgsql as $$
begin
  if new.sede_id is null then
    select id into new.sede_id from sedi
     where palestra_id = new.palestra_id and principale limit 1;
  end if;
  return new;
end $$;

drop trigger if exists sale_sede on sale;
create trigger sale_sede before insert on sale for each row execute function trg_sede_predefinita();
drop trigger if exists corsi_sede on corsi;
create trigger corsi_sede before insert on corsi for each row execute function trg_sede_predefinita();
