-- =====================================================================
-- RMHouse — 149 FATTURATO E STATISTICHE: STAGIONE SPORTIVA O ANNO SOLARE
-- Impostazioni → Regole e prenotazioni → "Quota e stagione": si sceglie che periodo vedere di base
-- nel fatturato del Riepilogo, nei Conti e nelle Statistiche:
--   'stagione' = la stagione sportiva (dal mese di inizio stagione) — è quella predefinita
--   'anno'     = l'anno solare (dal 1° gennaio)
-- Le ricevute mancanti e il commercialista restano sempre sull'anno solare (sono conti fiscali).
-- Si può eseguire più volte. Va dopo la 148.
-- =====================================================================
alter table palestre add column if not exists periodo_conti text not null default 'stagione';
alter table palestre drop constraint if exists palestre_periodo_conti_check;
alter table palestre add constraint palestre_periodo_conti_check check (periodo_conti in ('stagione', 'anno'));
