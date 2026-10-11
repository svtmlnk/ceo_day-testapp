/* ==========================================================================
   День коммерсанта — модуль авторизации (Supabase)

   Подключается и на странице входа (auth.html), и на главной (index.html).

   Пользователи лежат в таблице users:
     id (int8), username (text), email (text), password (text)

   В браузере хранится только текущая сессия:
     day-merchant:session — { id, nickname, email } вошедшего пользователя

   Наружу модуль отдаёт тот же интерфейс, что и раньше (window.Auth),
   поэтому auth.js и app.js почти не меняются.
   ========================================================================== */

(() => {
  "use strict";

  const SESSION_KEY = "day-merchant:session";
  const USERS_TABLE = "users";

  const AUTH_PAGE = "./auth.html";
  const APP_PAGE = "./index.html";

  const NICKNAME_MIN = 2;
  const NICKNAME_MAX = 30;
  const PASSWORD_MIN = 6;

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const UNIQUE_VIOLATION = "23505"; // код ошибки Postgres: такая запись уже есть

  const SERVER_ERROR = "Не удалось связаться с сервером. Попробуйте ещё раз";

  /* ---------- Сессия (localStorage) ---------- */

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (error) {
      return null;
    }
  }

  function startSession(user) {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ id: user.id, nickname: user.username, email: user.email }),
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /** Текущий пользователь { id, nickname, email } или null */
  function getSession() {
    const session = readSession();
    if (!session || session.id == null) return null; // в т.ч. старая сессия { userId }
    return { id: session.id, nickname: session.nickname, email: session.email };
  }

  /* ---------- Пароли ----------
     В таблицу пароль в открытом виде не попадает: туда пишется SHA-256
     от «почта + пароль». Это не замена настоящей авторизации, но для MVP
     лучше, чем хранить пароли как есть. Реализация на чистом JS — чтобы хеш
     был одинаковым и по http, и по https (Web Crypto работает только по https). */

  function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const K = [];
    const H = [];

    // Константы SHA-256: дробные части корней первых 64 простых чисел
    for (let n = 2, found = 0; found < 64; n++) {
      let isPrime = true;
      for (let d = 2; d * d <= n; d++) {
        if (n % d === 0) {
          isPrime = false;
          break;
        }
      }
      if (!isPrime) continue;
      if (found < 8) H[found] = (Math.pow(n, 1 / 2) * 2 ** 32) | 0;
      K[found++] = (Math.pow(n, 1 / 3) * 2 ** 32) | 0;
    }

    // Дополнение сообщения до кратного 64 байтам
    const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor((bytes.length * 8) / 2 ** 32));
    view.setUint32(paddedLength - 4, (bytes.length * 8) >>> 0);

    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const w = new Array(64);

    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + s1 + ch + K[i] + w[i]) | 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + maj) | 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }

      const sums = [a, b, c, d, e, f, g, h];
      for (let i = 0; i < 8; i++) H[i] = (H[i] + sums[i]) | 0;
    }

    return H.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
  }

  function hashPassword(email, password) {
    return sha256(`day-merchant:${email}:${password}`);
  }

  /* ---------- Проверка введённых данных ---------- */

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function fail(field, error) {
    return { ok: false, field, error };
  }

  function db() {
    return window.supabaseClient;
  }

  /* ---------- Публичный интерфейс ---------- */

  /** POST: создаёт пользователя в таблице users и сразу входит */
  async function register({ nickname, email, password }) {
    const cleanNickname = String(nickname || "").trim();
    const cleanEmail = normalizeEmail(email);
    const rawPassword = String(password || "");

    if (cleanNickname.length < NICKNAME_MIN || cleanNickname.length > NICKNAME_MAX) {
      return fail("nickname", `Никнейм — от ${NICKNAME_MIN} до ${NICKNAME_MAX} символов`);
    }
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      return fail("email", "Введите корректную почту");
    }
    if (rawPassword.length < PASSWORD_MIN) {
      return fail("password", `Пароль — не короче ${PASSWORD_MIN} символов`);
    }

    const emailTaken = fail("email", "Пользователь с такой почтой уже зарегистрирован");

    try {
      // GET: такая почта уже есть?
      const existing = await db()
        .from(USERS_TABLE)
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return emailTaken;

      // POST: новый пользователь
      const created = await db()
        .from(USERS_TABLE)
        .insert({
          username: cleanNickname,
          email: cleanEmail,
          password: hashPassword(cleanEmail, rawPassword),
        })
        .select("id, username, email")
        .single();

      if (created.error) {
        if (created.error.code === UNIQUE_VIOLATION) return emailTaken;
        throw created.error;
      }

      if (!startSession(created.data)) {
        return fail(null, "Не удалось сохранить данные — хранилище браузера недоступно");
      }
      return { ok: true };
    } catch (error) {
      console.error("Ошибка регистрации:", error);
      return fail(null, SERVER_ERROR);
    }
  }

  /** GET: ищет пользователя по почте и сверяет пароль */
  async function login({ email, password }) {
    const cleanEmail = normalizeEmail(email);
    const rawPassword = String(password || "");

    if (!EMAIL_PATTERN.test(cleanEmail)) {
      return fail("email", "Введите корректную почту");
    }
    if (!rawPassword) {
      return fail("password", "Введите пароль");
    }

    const wrongCredentials = fail("password", "Неверная почта или пароль");

    try {
      const { data: user, error } = await db()
        .from(USERS_TABLE)
        .select("id, username, email, password")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (error) throw error;
      if (!user) return wrongCredentials;
      if (user.password !== hashPassword(cleanEmail, rawPassword)) return wrongCredentials;

      if (!startSession(user)) {
        return fail(null, "Не удалось сохранить данные — хранилище браузера недоступно");
      }
      return { ok: true };
    } catch (error) {
      console.error("Ошибка входа:", error);
      return fail(null, SERVER_ERROR);
    }
  }

  /** Завершает сессию и возвращает на страницу входа */
  function logout() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* хранилище недоступно — сессии и так нет */
    }
    window.location.replace(AUTH_PAGE);
  }

  /** Для главной страницы: без входа — на страницу авторизации */
  function requireAuth() {
    const user = getSession();
    if (!user) {
      window.location.replace(AUTH_PAGE);
      return null;
    }

    // Вышли в другой вкладке — эта вкладка тоже закрывает доступ
    window.addEventListener("storage", (event) => {
      if (event.key === SESSION_KEY && !getSession()) {
        window.location.replace(AUTH_PAGE);
      }
    });
    return user;
  }

  /** Для страницы входа: если уже вошли — сразу в приложение */
  function redirectIfAuthed() {
    if (getSession()) window.location.replace(APP_PAGE);
  }

  window.Auth = Object.freeze({
    getSession,
    register,
    login,
    logout,
    requireAuth,
    redirectIfAuthed,
    APP_PAGE,
  });
})();
