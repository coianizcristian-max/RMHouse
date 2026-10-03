-- 097 · Sostituzioni: cambiare l'insegnante di una lezione
-- - Segreteria e amministrazione: su qualsiasi lezione, solo quella o anche tutte le future dello stesso orario.
-- - L'insegnante titolare: "Fatti sostituire" su una sua lezione futura, scegliendo la collega (solo quella data).
-- La lezione passa alla nuova insegnante (notifica, home, appello); resta scritto chi era la titolare e chi ha fatto il cambio.
-- La segreteria riceve un avviso quando è l'insegnante a farsi sostituire; la titolare quando la cambia la segreteria.
-- Nei compensi le ore vanno a chi tiene la lezione; nel cedolino della titolare c'è la riga "tenuta da …" a 0 €.
-- Rieseguibile.

alter table lezioni add column if not exists insegnante_titolare uuid references staff(id) on delete set null;
alter table lezioni add column if not exists sostituzione_da uuid references staff(id) on delete set null;
alter table lezioni add column if not exists sostituzione_at timestamptz;

create or replace function sostituisci_lezione(p_lezione uuid, p_staff uuid, p_da_oggi boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l lezioni; io staff; nuova staff; v_gest boolean; v_corso text; v_quando text; n int := 1;
begin
  select * into l from lezioni where id = p_lezione;
  if not found then raise exception 'lezione_non_trovata'; end if;
  io := mio_staff(l.palestra_id);
  if io.id is null then raise exception 'non_autorizzato'; end if;
  v_gest := io.ruolo::text in ('admin', 'segreteria');
  if l.stato = 'annullata' then raise exception 'lezione_annullata'; end if;
  if p_staff is not null then
    select * into nuova from staff where id = p_staff and palestra_id = l.palestra_id and attivo and not coalesce(archiviato, false);
    if not found then raise exception 'staff_non_trovato'; end if;
  end if;

  if not v_gest then
    -- l'insegnante: solo una sua lezione futura, solo quella data, a un'altra persona
    if l.insegnante_id is distinct from io.id then raise exception 'non_tua'; end if;
    if l.inizio <= now() then raise exception 'lezione_passata'; end if;
    if p_staff is null or p_staff = io.id then raise exception 'scegli_chi'; end if;
    p_da_oggi := false;
  end if;
  if p_staff is not distinct from l.insegnante_id then return jsonb_build_object('cambiate', 0); end if;

  select nome into v_corso from corsi where id = l.corso_id;
  v_quando := coalesce(v_corso, 'Lezione') || ' di '
              || (array['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'])[extract(isodow from l.inizio at time zone 'Europe/Rome')::int]
              || ' ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI');

  if p_da_oggi then
    -- cambio stabile: questa e tutte le future dello stesso orario, e l'orario stesso (anche per le lezioni ancora da generare)
    update lezioni set insegnante_id = p_staff, insegnante_titolare = null, sostituzione_da = null, sostituzione_at = null
     where id = l.id or (l.orario_id is not null and orario_id = l.orario_id and inizio > now() and stato <> 'annullata');
    get diagnostics n = row_count;
    if l.orario_id is not null then update orari set insegnante_id = p_staff where id = l.orario_id; end if;
  else
    update lezioni set insegnante_id = p_staff,
           -- torna alla titolare: niente più sostituzione
           insegnante_titolare = case when p_staff is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id) then null
                                      else coalesce(l.insegnante_titolare, l.insegnante_id) end,
           sostituzione_da = case when p_staff is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id) then null else io.id end,
           sostituzione_at = case when p_staff is not distinct from coalesce(l.insegnante_titolare, l.insegnante_id) then null else now() end
     where id = l.id;
  end if;

  begin
    if not v_gest then
      perform accoda_push_staff(l.palestra_id, 'lezione', 'Lezione passata a un''altra insegnante',
        trim(io.nome || ' ' || coalesce(io.cognome, '')) || ' ha passato ' || v_quando || ' a ' || trim(nuova.nome || ' ' || coalesce(nuova.cognome, '')),
        '/gestione/appello/' || l.id, array['admin', 'segreteria'], null, 'lez-sost:' || l.id || ':' || p_staff);
    elsif l.insegnante_id is not null and l.insegnante_id <> io.id and l.inizio > now() then
      perform accoda_push_staff(l.palestra_id, 'lezione',
        case when p_staff is null then 'Lezione senza insegnante' else 'La tua lezione la terrà ' || nuova.nome end,
        v_quando || case when p_da_oggi and n > 1 then ' e le successive' else '' end,
        '/gestione/calendario', null, l.insegnante_id, 'lez-tolta:' || l.id || ':' || coalesce(p_staff::text, '-'));
    end if;
  exception when others then null;
  end;
  return jsonb_build_object('cambiate', n);
end $$;
revoke execute on function sostituisci_lezione(uuid, uuid, boolean) from public, anon;
grant execute on function sostituisci_lezione(uuid, uuid, boolean) to authenticated;

-- Compensi: la titolare sostituita ha la riga "tenuta da …" a 0 €, la sostituta "sostituisce …"
do $$
declare v text; v0 text;
begin
  v := pg_get_functiondef('calcola_compensi(uuid, integer, integer)'::regprocedure);
  v0 := v;
  if v not ilike '%insegnante_titolare%' then
    v := replace(v, 'ti.nome as titolare, sv.nome as tenuta_da',
                    'coalesce(tt.nome, ti.nome) as titolare, coalesce(sv.nome, ti.nome) as tenuta_da, x.insegnante_titolare as tit_id');
    v := replace(v, 'left join staff sv on sv.id = x.svolta_da',
                    'left join staff sv on sv.id = x.svolta_da
        left join staff tt on tt.id = x.insegnante_titolare');
    v := replace(v, 'and (x.svolta_da = st.id or (x.insegnante_id = st.id))',
                    'and (x.svolta_da = st.id or x.insegnante_id = st.id or x.insegnante_titolare = st.id)');
    v := replace(v, 'if l.svolta_da is not null and l.svolta_da <> st.id then',
                    'if (l.svolta_da is not null and l.svolta_da <> st.id) or (l.svolta_da is null and l.insegnante_id is distinct from st.id) then');
    v := replace(v, 'case when l.insegnante_id is not null and l.insegnante_id <> st.id then ''sostituisce '' || coalesce(l.titolare, ''?'') end',
                    'case when coalesce(l.tit_id, l.insegnante_id) is not null and coalesce(l.tit_id, l.insegnante_id) <> st.id then ''sostituisce '' || coalesce(l.titolare, ''?'') end');
    v := replace(v, 'if l.insegnante_id is not null and l.insegnante_id <> st.id then v_sost := v_sost + 1; end if;',
                    'if coalesce(l.tit_id, l.insegnante_id) is not null and coalesce(l.tit_id, l.insegnante_id) <> st.id then v_sost := v_sost + 1; end if;');
    if v = v0 then raise notice 'calcola_compensi: niente da cambiare'; else execute v; end if;
  end if;
end $$;
