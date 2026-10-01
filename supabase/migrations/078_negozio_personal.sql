-- =====================================================================
-- RMHouse — 078 NEGOZIO NELL'APP, BONIFICO, LEZIONI PRIVATE
--  1. descrizione degli abbonamenti (si legge nel negozio dell'app)
--  2. richieste_cliente: le richieste che il cliente fa dall'app e la
--     segreteria conferma (abbonamento pagato con bonifico, lezione privata)
--  3. richiedi_abbonamento / richiedi_personal (cliente) e
--     conferma_richiesta / rifiuta_richiesta (segreteria)
--  Ogni richiesta manda la notifica alla segreteria; ogni risposta al cliente.
-- Si può eseguire più volte. Va dopo la 077.
-- =====================================================================

alter table tipi_abbonamento add column if not exists descrizione text;

create table if not exists richieste_cliente (
  id           uuid primary key default gen_random_uuid(),
  palestra_id  uuid not null references palestre(id) on delete cascade,
  allievo_id   uuid not null references allievi(id) on delete cascade,
  tipo         text not null check (tipo in ('abbonamento', 'personal')),
  dati         jsonb not null default '{}'::jsonb,
  importo_cent int,
  stato        text not null default 'da_confermare' check (stato in ('da_confermare', 'confermata', 'rifiutata', 'annullata')),
  risposta     text,
  iscrizione_id uuid references iscrizioni(id) on delete set null,
  created_at   timestamptz not null default now(),
  gestita_at   timestamptz,
  gestita_da   uuid
);
create index if not exists ix_richieste_cliente_stato on richieste_cliente (palestra_id, stato, created_at desc);
create index if not exists ix_richieste_cliente_allievo on richieste_cliente (allievo_id, created_at desc);
alter table richieste_cliente enable row level security;
grant select, insert, update, delete on richieste_cliente to authenticated;
drop policy if exists gestione_tutto on richieste_cliente;
create policy gestione_tutto on richieste_cliente for all to authenticated
  using (is_gestione(palestra_id)) with check (is_gestione(palestra_id));
drop policy if exists cliente_legge on richieste_cliente;
create policy cliente_legge on richieste_cliente for select to authenticated
  using (allievo_id in (select id from allievi where account_id in (select miei_account())));

-- ---------------------------------------------------------------------
-- Il cliente chiede un abbonamento da pagare con bonifico
-- ---------------------------------------------------------------------
create or replace function richiedi_abbonamento(p_allievo uuid, p_tipo uuid, p_corso uuid, p_orari uuid[], p_data_inizio date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a allievi; t tipi_abbonamento; c corsi; v_quota int := 0; v_tot int; v_id uuid; v_causale text;
begin
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  select * into t from tipi_abbonamento where id = p_tipo and palestra_id = a.palestra_id and attivo and not coalesce(archiviato, false);
  if not found then raise exception 'abbonamento_non_disponibile'; end if;
  select * into c from corsi where id = p_corso and palestra_id = a.palestra_id and attivo;
  if not found then raise exception 'corso_non_disponibile'; end if;
  if t.modalita = 'orari_fissi' and coalesce(array_length(p_orari, 1), 0) = 0 then raise exception 'scegli_i_giorni'; end if;
  if exists (select 1 from richieste_cliente where allievo_id = p_allievo and tipo = 'abbonamento' and stato = 'da_confermare'
               and dati->>'tipo_abbonamento_id' = p_tipo::text and dati->>'corso_id' = p_corso::text) then
    raise exception 'richiesta_gia_inviata';
  end if;

  if coalesce((select vs.quota_mancante from v_stato_clienti vs where vs.id = a.id), false) then
    select coalesce(quota_iscrizione_cent, 0) into v_quota from palestre where id = a.palestra_id;
  end if;
  v_tot := coalesce(t.prezzo_web_cent, t.prezzo_cent, 0) + v_quota;
  v_causale := trim(a.nome || ' ' || coalesce(a.cognome, '')) || ' - ' || c.nome;

  insert into richieste_cliente (palestra_id, allievo_id, tipo, dati, importo_cent)
  values (a.palestra_id, a.id, 'abbonamento', jsonb_build_object(
      'tipo_abbonamento_id', t.id, 'abbonamento', t.nome, 'corso_id', c.id, 'corso', c.nome,
      'orari', to_jsonb(coalesce(p_orari, '{}')), 'data_inizio', coalesce(p_data_inizio, current_date),
      'prezzo_cent', coalesce(t.prezzo_web_cent, t.prezzo_cent, 0), 'quota_cent', v_quota,
      'metodo', 'bonifico', 'causale', v_causale), v_tot)
  returning id into v_id;

  begin
    perform accoda_push_staff(a.palestra_id, 'richiesta', 'Abbonamento da confermare',
      trim(a.nome || ' ' || coalesce(a.cognome, '')) || ': ' || t.nome || ' · bonifico ' || to_char(v_tot / 100.0, 'FM9990.00') || ' €',
      '/gestione/richieste', array['admin', 'segreteria'], null, 'rich:' || v_id);
  exception when others then null; end;
  return jsonb_build_object('id', v_id, 'importo_cent', v_tot, 'quota_cent', v_quota, 'causale', v_causale);
end $$;

-- ---------------------------------------------------------------------
-- Il cliente chiede una lezione privata con un insegnante
-- ---------------------------------------------------------------------
create or replace function richiedi_personal(p_allievo uuid, p_staff uuid, p_quando text, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a allievi; s staff; v_id uuid;
begin
  select * into a from allievi where id = p_allievo and account_id in (select miei_account());
  if not found then raise exception 'non_autorizzato'; end if;
  select * into s from staff where id = p_staff and palestra_id = a.palestra_id and attivo;
  if not found then raise exception 'insegnante_non_disponibile'; end if;
  if coalesce(trim(p_quando), '') = '' then raise exception 'scrivi_quando'; end if;

  insert into richieste_cliente (palestra_id, allievo_id, tipo, dati)
  values (a.palestra_id, a.id, 'personal', jsonb_build_object(
      'staff_id', s.id, 'insegnante', trim(s.nome || ' ' || coalesce(s.cognome, '')),
      'quando', left(trim(p_quando), 300), 'nota', left(nullif(trim(p_nota), ''), 500)))
  returning id into v_id;

  begin
    perform accoda_push_staff(a.palestra_id, 'richiesta', 'Lezione privata richiesta',
      trim(a.nome || ' ' || coalesce(a.cognome, '')) || ' con ' || s.nome || ': ' || left(trim(p_quando), 80),
      '/gestione/richieste', array['admin', 'segreteria'], null, 'rich:' || v_id);
  exception when others then null; end;
  return v_id;
end $$;

-- Il cliente ritira una richiesta non ancora gestita
create or replace function annulla_mia_richiesta(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update richieste_cliente set stato = 'annullata', gestita_at = now()
   where id = p_id and stato = 'da_confermare'
     and allievo_id in (select id from allievi where account_id in (select miei_account()));
end $$;

-- ---------------------------------------------------------------------
-- La segreteria risponde
-- ---------------------------------------------------------------------
create or replace function conferma_richiesta(p_id uuid, p_risposta text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r richieste_cliente; a allievi; v_isc uuid; v_orari uuid[];
begin
  select * into r from richieste_cliente where id = p_id for update;
  if not found or r.stato <> 'da_confermare' then raise exception 'richiesta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = r.allievo_id;

  if r.tipo = 'abbonamento' then
    select coalesce(array_agg(x::uuid), '{}') into v_orari from jsonb_array_elements_text(coalesce(r.dati->'orari', '[]'::jsonb)) x;
    v_isc := crea_iscrizione(r.allievo_id, (r.dati->>'tipo_abbonamento_id')::uuid, (r.dati->>'corso_id')::uuid,
                             (r.dati->>'data_inizio')::date, v_orari, 0, coalesce((r.dati->>'quota_cent')::int, 0) > 0,
                             'Richiesta dall''app (bonifico)');
  end if;

  update richieste_cliente set stato = 'confermata', risposta = nullif(trim(p_risposta), ''), iscrizione_id = v_isc,
         gestita_at = now(), gestita_da = auth.uid()
   where id = p_id;

  begin
    perform accoda_push(a.account_id,
      case when r.tipo = 'abbonamento' then 'Abbonamento attivato ✓' else 'Lezione privata confermata ✓' end,
      coalesce(nullif(trim(p_risposta), ''), case when r.tipo = 'abbonamento' then (r.dati->>'abbonamento') || ' · ' || (r.dati->>'corso')
                                                 else 'con ' || (r.dati->>'insegnante') end),
      '/area', 'risp:' || p_id);
  exception when others then null; end;
end $$;

create or replace function rifiuta_richiesta(p_id uuid, p_risposta text)
returns void language plpgsql security definer set search_path = public as $$
declare r richieste_cliente; a allievi;
begin
  select * into r from richieste_cliente where id = p_id for update;
  if not found or r.stato <> 'da_confermare' then raise exception 'richiesta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  select * into a from allievi where id = r.allievo_id;
  update richieste_cliente set stato = 'rifiutata', risposta = nullif(trim(p_risposta), ''), gestita_at = now(), gestita_da = auth.uid()
   where id = p_id;
  begin
    perform accoda_push(a.account_id, 'Risposta della segreteria', coalesce(nullif(trim(p_risposta), ''), 'La tua richiesta non è stata accettata.'), '/area/io', 'risp:' || p_id);
  exception when others then null; end;
end $$;

revoke execute on function richiedi_abbonamento(uuid, uuid, uuid, uuid[], date) from public, anon;
revoke execute on function richiedi_personal(uuid, uuid, text, text) from public, anon;
revoke execute on function annulla_mia_richiesta(uuid) from public, anon;
revoke execute on function conferma_richiesta(uuid, text) from public, anon;
revoke execute on function rifiuta_richiesta(uuid, text) from public, anon;
grant execute on function richiedi_abbonamento(uuid, uuid, uuid, uuid[], date) to authenticated;
grant execute on function richiedi_personal(uuid, uuid, text, text) to authenticated;
grant execute on function annulla_mia_richiesta(uuid) to authenticated;
grant execute on function conferma_richiesta(uuid, text) to authenticated;
grant execute on function rifiuta_richiesta(uuid, text) to authenticated;

-- la cronologia registra anche le richieste
do $$ begin
  if exists (select 1 from pg_proc where proname = 'trg_registro') then
    drop trigger if exists trg_registro on richieste_cliente;
    drop trigger if exists registro on richieste_cliente;
    create trigger registro after insert or update or delete on richieste_cliente
      for each row execute function trg_registro();
  end if;
end $$;

-- Gli insegnanti che si possono chiedere per una lezione privata
create or replace function insegnanti_personal()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'nome', trim(st.nome || ' ' || coalesce(st.cognome, '')),
           'foto', st.foto_url, 'specialita', st.specialita) order by st.nome), '[]'::jsonb)
  from staff st
  where st.palestra_id = (select palestra_id from account where user_id = auth.uid() limit 1)
    and st.attivo and not coalesce(st.archiviato, false) and st.ruolo = 'insegnante'
    and coalesce(st.visibilita::text, 'pubblico') <> 'nascosto';
$$;
revoke execute on function insegnanti_personal() from public, anon;
grant execute on function insegnanti_personal() to authenticated;
