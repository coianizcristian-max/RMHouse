-- =====================================================================
-- RMHouse — 018 GESTIONE DEI LEAD
-- Finora i lead si potevano solo guardare. Qui si aggiungono: il diario
-- dei contatti, il cambio di stato con motivo, il promemoria di richiamo.
-- Da eseguire dopo 001…017.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DIARIO DEI CONTATTI
-- ---------------------------------------------------------------------
create table if not exists contatti_lead (
  id          uuid primary key default gen_random_uuid(),
  palestra_id uuid not null references palestre(id) on delete cascade,
  allievo_id  uuid not null references allievi(id) on delete cascade,
  quando      timestamptz not null default now(),
  canale      text not null default 'telefono'
              check (canale in ('telefono', 'whatsapp', 'email', 'di_persona', 'altro')),
  esito       text not null default 'sentito'
              check (esito in ('sentito', 'non_risponde', 'richiamare', 'non_interessato', 'iscritto')),
  testo       text,
  autore_id   uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists contatti_lead_allievo on contatti_lead (allievo_id, quando desc);

alter table contatti_lead enable row level security;
drop policy if exists staff_legge on contatti_lead;
create policy staff_legge on contatti_lead for select to authenticated using (is_staff(palestra_id));
drop policy if exists gestione_scrive on contatti_lead;
create policy gestione_scrive on contatti_lead for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));

-- Quando richiamare e a chi è affidato il lead
alter table allievi add column if not exists prossimo_contatto date;
alter table allievi add column if not exists seguito_da uuid references staff(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. SEGNARE UN CONTATTO
--    Scrive nel diario e, se serve, sposta lo stato del lead.
-- ---------------------------------------------------------------------
create or replace function segna_contatto(
  p_allievo uuid, p_canale text default 'telefono', p_esito text default 'sentito',
  p_testo text default null, p_prossimo date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; v_id uuid;
begin
  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  if not is_gestione(a.palestra_id) then raise exception 'non_autorizzato'; end if;

  insert into contatti_lead (palestra_id, allievo_id, canale, esito, testo, autore_id)
  values (a.palestra_id, p_allievo, p_canale, p_esito, nullif(trim(p_testo), ''), auth.uid())
  returning id into v_id;

  update allievi set prossimo_contatto = p_prossimo where id = p_allievo;

  if p_esito = 'non_interessato' then
    update allievi set stato_lead = 'perso', motivo_perso = coalesce(nullif(trim(p_testo), ''), motivo_perso)
     where id = p_allievo and stato_lead <> 'iscritto';
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. CAMBIARE STATO A MANO
-- ---------------------------------------------------------------------
create or replace function cambia_stato_lead(p_allievo uuid, p_stato text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a allievi;
begin
  select * into a from allievi where id = p_allievo;
  if not found then raise exception 'allievo_non_trovato'; end if;
  if not is_gestione(a.palestra_id) then raise exception 'non_autorizzato'; end if;
  if p_stato not in ('nuovo', 'prova_prenotata', 'prova_effettuata', 'iscritto', 'perso') then
    raise exception 'stato_non_valido';
  end if;

  update allievi
     set stato_lead = p_stato::stato_lead,
         motivo_perso = case when p_stato = 'perso' then nullif(trim(p_motivo), '') else null end,
         prossimo_contatto = case when p_stato in ('iscritto', 'perso') then null else prossimo_contatto end
   where id = p_allievo;

  insert into contatti_lead (palestra_id, allievo_id, canale, esito, testo, autore_id)
  values (a.palestra_id, p_allievo, 'altro',
          case when p_stato = 'perso' then 'non_interessato'
               when p_stato = 'iscritto' then 'iscritto' else 'sentito' end,
          'Stato portato a ' || p_stato || coalesce(': ' || nullif(trim(p_motivo), ''), ''), auth.uid());
end $$;

grant execute on function segna_contatto(uuid, text, text, text, date) to authenticated;
grant execute on function cambia_stato_lead(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. LA VISTA DEI LEAD, CON TUTTO QUELLO CHE SERVE PER RICHIAMARE
-- ---------------------------------------------------------------------
create or replace view v_lead with (security_invoker = true) as
  select a.id, a.palestra_id, a.nome, a.cognome, a.data_nascita, a.is_titolare,
         a.stato_lead, a.motivo_perso, a.created_at, a.prossimo_contatto, a.seguito_da,
         eta_al(a.data_nascita, current_date) as eta,
         acc.id as account_id, acc.nome as titolare_nome, acc.cognome as titolare_cognome,
         acc.email, acc.telefono, acc.fonte,
         st.nome as seguito_da_nome,
         (select max(cl.quando) from contatti_lead cl where cl.allievo_id = a.id) as ultimo_contatto,
         (select count(*)::int from contatti_lead cl where cl.allievo_id = a.id) as contatti,
         (select cl.testo from contatti_lead cl where cl.allievo_id = a.id order by cl.quando desc limit 1) as ultima_nota,
         (select jsonb_build_object('corso', c.nome, 'inizio', l.inizio, 'stato', pr.stato,
                                    'da_pagare_cent', case when pg.stato = 'in_attesa' then pg.importo_cent else 0 end)
            from prove pr
            join lezioni l on l.id = pr.lezione_id
            join corsi c on c.id = pr.corso_id
            left join pagamenti pg on pg.id = pr.pagamento_id
           where pr.allievo_id = a.id
           order by l.inizio desc limit 1) as prova
  from allievi a
  join account acc on acc.id = a.account_id
  left join staff st on st.id = a.seguito_da;

-- Quanti lead ci sono in ogni stato, per i contatori dei filtri
create or replace function conta_lead(p_palestra uuid)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'da_seguire', count(*) filter (where stato_lead in ('nuovo', 'prova_effettuata')),
    'prova_prenotata', count(*) filter (where stato_lead = 'prova_prenotata'),
    'prova_effettuata', count(*) filter (where stato_lead = 'prova_effettuata'),
    'da_richiamare', count(*) filter (where prossimo_contatto is not null and prossimo_contatto <= current_date
                                        and stato_lead not in ('iscritto', 'perso')),
    'persi', count(*) filter (where stato_lead = 'perso'),
    'iscritti', count(*) filter (where stato_lead = 'iscritto'),
    'mai_contattati', count(*) filter (where stato_lead = 'nuovo'
                                         and not exists (select 1 from contatti_lead cl where cl.allievo_id = allievi.id))
  )
  from allievi where palestra_id = p_palestra;
$$;
