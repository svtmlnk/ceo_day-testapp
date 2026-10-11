/* ==========================================================================
   День коммерсанта — подключение к Supabase

   Подключается на auth.html и index.html ПОСЛЕ скрипта supabase-js (CDN)
   и ДО auth.js / app.js. Создаёт один общий клиент: window.supabaseClient.

   Значения берутся в Supabase: Project Settings → API
   (Project URL и ключ anon / public).
   ========================================================================== */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ahvcuvwvfqhllcexspyr.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_sEBjrjshb7xNfiiurEHw_Q_pZP6e8xN";

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
})();
