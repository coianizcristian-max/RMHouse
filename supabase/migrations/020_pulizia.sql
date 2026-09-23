-- =====================================================================
-- RMHouse — 020 PULIZIA
-- La vecchia invia_bacheca(p_id) convive con quella nuova che manda
-- anche la notifica: due funzioni con lo stesso nome confondono le
-- chiamate dal sito. Si tiene solo la nuova.
-- Da eseguire dopo 001…019.
-- =====================================================================

drop function if exists invia_bacheca(uuid);
