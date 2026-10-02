-- 089 · Nota di credito elettronica sulle fatture
-- Una fattura già trasmessa allo SdI non si annulla: si storna (tutta o in parte) con una nota di credito.
-- Per le fatture la nota di credito ha una numerazione sua ("NCF") e un suo file XML (TD04) che
-- richiama la fattura. Le note di credito delle ricevute restano come prima (numerazione "NC").
-- Rieseguibile.

insert into numerazioni (palestra_id, codice, nome, tipo_documento, predefinita)
select p.id, 'NCF', 'Note di credito su fatture', 'nota_credito', false from palestre p
on conflict (palestra_id, codice) do nothing;

create or replace function emetti_nota_credito(p_ricevuta uuid, p_importo_cent integer, p_motivo text, p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare r ricevute; v_num int; v_anno int; v_id uuid; v_numerazione uuid; v_gia int; v_tot int;
        v_imponibile int; v_iva int; v_perc numeric; v_fattura boolean; v_data date := coalesce(p_data, current_date);
begin
  select * into r from ricevute where id = p_ricevuta;
  if not found or r.tipo_documento not in ('ricevuta', 'fattura') then raise exception 'ricevuta_non_trovata'; end if;
  if not is_gestione(r.palestra_id) then raise exception 'non_autorizzato'; end if;
  if r.annullata then raise exception 'ricevuta_annullata'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'motivo_mancante'; end if;
  v_fattura := r.tipo_documento = 'fattura';

  v_tot := r.importo_cent + r.iva_cent;
  select coalesce(sum(importo_cent + iva_cent), 0) into v_gia from ricevute
   where riferimento_id = r.id and tipo_documento = 'nota_credito' and not annullata;
  if p_importo_cent is null or p_importo_cent <= 0 or p_importo_cent > v_tot - v_gia then
    raise exception 'importo_non_valido';
  end if;
  if v_data < r.data or v_data > current_date then raise exception 'data_non_valida'; end if;

  if v_fattura then
    select id into v_numerazione from numerazioni where palestra_id = r.palestra_id and codice = 'NCF' and attiva limit 1;
  else
    select id into v_numerazione from numerazioni
     where palestra_id = r.palestra_id and tipo_documento = 'nota_credito' and predefinita and attiva limit 1;
  end if;
  if v_numerazione is null then raise exception 'numerazione_mancante'; end if;
  v_anno := extract(year from v_data)::int;
  v_num := prossimo_numero(v_numerazione, v_anno);

  v_perc := coalesce((select percentuale from aliquote_iva where id = r.aliquota_id), 0);
  v_imponibile := round(p_importo_cent / (1 + v_perc / 100.0));
  v_iva := p_importo_cent - v_imponibile;

  insert into ricevute (palestra_id, numerazione_id, tipo_documento, riferimento_id, numero, anno, data,
                        pagamento_id, account_id, allievo_id, intestatario, codice_fiscale, indirizzo,
                        descrizione, importo_cent, iva_cent, aliquota, aliquota_id, natura, metodo, note, cliente)
  values (r.palestra_id, v_numerazione, 'nota_credito', r.id, v_num, v_anno, v_data,
          r.pagamento_id, r.account_id, r.allievo_id, r.intestatario, r.codice_fiscale, r.indirizzo,
          case when v_fattura then 'Storno ' || case when p_importo_cent = v_tot - v_gia and v_gia = 0 then 'totale' else 'parziale' end
                                || ' della fattura n. ' || coalesce((select codice || ' ' from numerazioni where id = r.numerazione_id), '') || r.numero || '/' || r.anno || ': ' || trim(p_motivo)
               else 'Rimborso relativo alla ricevuta n. ' || r.numero || '/' || r.anno || ': ' || trim(p_motivo) end,
          v_imponibile, v_iva, r.aliquota, r.aliquota_id, r.natura, r.metodo, null,
          case when v_fattura then r.cliente end)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function emetti_nota_credito(uuid, integer, text, date) from public, anon;
grant execute on function emetti_nota_credito(uuid, integer, text, date) to authenticated, service_role;

-- anche l'XML della nota di credito si segna come scaricato
create or replace function segna_xml_scaricato(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update ricevute set xml_scaricato_at = coalesce(xml_scaricato_at, now())
   where id = p_id and tipo_documento in ('fattura', 'nota_credito') and is_gestione(palestra_id);
end $$;
revoke execute on function segna_xml_scaricato(uuid) from public, anon;
grant execute on function segna_xml_scaricato(uuid) to authenticated;
