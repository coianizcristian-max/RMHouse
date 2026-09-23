-- =====================================================================
-- RMHouse — RIMOZIONE DEI DATI DIMOSTRATIVI
-- Cancella solo clienti, iscrizioni, prove e presenze creati da demo.sql.
-- Il palinsesto (categorie, discipline, corsi, orari) resta:
-- se vuoi togliere anche quello, elimina i corsi dalla schermata Corsi.
-- =====================================================================

delete from account where note = 'DEMO';   -- porta con sé allievi, iscrizioni, prove, presenze, messaggi
delete from prenotazioni_spazi where email like 'demo-spazi%@esempio.it' or titolo = 'Prove saggio di Natale';

select 'clienti demo rimasti' as cosa, count(*) from account where note = 'DEMO'
union all select 'iscrizioni', count(*) from iscrizioni
union all select 'prove', count(*) from prove;
