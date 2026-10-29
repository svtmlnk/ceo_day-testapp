/* ==========================================================================
   День коммерсанта

   Структура файла:
   1. Контент и настройки по умолчанию
   2. Утилиты (даты, экранирование, склонение)
   3. Слой хранения (Supabase, таблица tasks) — единственное место,
      которое общается с базой
   4. Состояние приложения
   5. Подсчёт очков и серии
   6. Шаблоны разметки (BEM-классы описаны в styles.css)
   7. Обработчики событий
   8. Таймер фокус-сессий
   9. Окно настроек
   10. Уведомления
   11. Меню пользователя и выход
   12. Запуск
   ========================================================================== */

(() => {
  "use strict";

  /* ========================================================================
     1. Контент и настройки по умолчанию
     ====================================================================== */

  const QUOTES = [
    ["Вы промахиваетесь в 100% бросков, которые не делаете.", "Уэйн Гретцки"],
    [
      "Эффективность — делать вещи правильно. Результативность — делать правильные вещи.",
      "Питер Друкер",
    ],
    [
      "Мы — то, что мы делаем постоянно. Совершенство не действие, а привычка.",
      "Уилл Дюрант о философии Аристотеля",
    ],
    [
      "Вы не поднимаетесь до уровня своих целей. Вы опускаетесь до уровня своих систем.",
      "Джеймс Клир, «Атомные привычки»",
    ],
    ["Дисциплина — это мост между целями и достижениями.", "Джим Рон"],
    [
      "Мотивация не длится долго. Как и душ — поэтому их рекомендуют ежедневно.",
      "Зиг Зиглар",
    ],
    ["Тяжело в учении — легко в бою.", "Александр Суворов"],
    ["Путь в тысячу ли начинается с первого шага.", "Лао-цзы"],
    [
      "Оставайтесь голодными. Оставайтесь безрассудными.",
      "Стив Джобс, речь в Стэнфорде, 2005",
    ],
    [
      "Удача — это когда подготовка встречается с возможностью.",
      "приписывается Сенеке",
    ],
    [
      "Что важно, редко бывает срочным, а что срочно — редко важно.",
      "Дуайт Эйзенхауэр",
    ],
    [
      "Я снова и снова терпел неудачи в жизни. Вот почему я добился успеха.",
      "Майкл Джордан",
    ],
    [
      "Если вам предлагают потрясающую возможность, а вы не уверены, что справитесь, — соглашайтесь. Научитесь по ходу.",
      "Ричард Брэнсон",
    ],
    [
      "Всё приходит вовремя для того, кто умеет ждать.",
      "Лев Толстой, «Война и мир»",
    ],
  ];

  /*
   * Роли. Для каждой: название и счётчики касаний [ключ, подпись, цель по умолчанию].
   */
  const ROLES = {
    manager: {
      name: "Менеджер",
      counters: [
        ["calls", "Звонки", 30],
        ["offers", "Коммерческие предложения", 5],
        ["meetings", "Встречи и созвоны", 2],
        ["newContacts", "Новые контакты", 5],
      ],
    },
    director: {
      name: "Руководитель",
      counters: [
        ["keyClients", "Касания с ключевыми клиентами", 3],
        ["oneOnOnes", "Встречи 1:1 с командой", 2],
        ["decisions", "Принятые решения", 5],
        ["strategyHours", "Часы на стратегию", 2],
      ],
    },
  };

  const DEFAULT_ROLE = "manager";
  const MAX_PLAN_TASKS = 50; // задач в поле «Мои задачи на сегодня»

  /* Доска стикеров. Хранится в таблице tasks отдельной строкой с датой BOARD_DATE
     (доска одна на пользователя и не привязана к дню) */
  const BOARD_DATE = "2000-01-01";
  const STICKER_COLORS = ["yellow", "pink", "green", "blue", "orange", "purple"];
  const STICKER_SIZE = 168; // размер нового стикера
  const STICKER_MIN = 110; // меньше — не помещаются кнопки и текст
  const STICKER_MAX = 520;
  const RESIZE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"]; // края и углы, за которые тянут
  const BOARD_WIDTH = 1200;
  const BOARD_HEIGHT = 700;
  const MAX_STICKERS = 60;
  const MAX_STICKER_TEXT = 300;
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 1.25;

  /* Из чего складываются очки дня (в сумме 100) */
  const SCORE_WEIGHTS = { touches: 67, review: 33 };
  const STREAK_MIN_SCORE = 50;

  const FOCUS_SECONDS = 25 * 60;
  const BREAK_SECONDS = 5 * 60;

  const SAVE_DELAY_MS = 700;
  const TOAST_DURATION_MS = 2800;

  const RING_RADIUS = 20;
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  const WEEKDAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const WIN_PLACEHOLDERS = [
    "Даже маленькая считается",
    "Что получилось лучше, чем вчера",
    "За что себя похвалить",
  ];

  /* ========================================================================
     2. Утилиты
     ====================================================================== */

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  function escapeHtml(value) {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return String(value ?? "").replace(/[&<>"']/g, (char) => entities[char]);
  }

  /** Дата → строка «ГГГГ-ММ-ДД» в местном часовом поясе */
  function toDateKey(date) {
    const local = new Date(date);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 10);
  }

  function getTodayKey() {
    return toDateKey(new Date());
  }

  /** Сдвинуть дату-строку на N дней */
  function shiftDate(dateKey, days) {
    const date = new Date(`${dateKey}T12:00`);
    date.setDate(date.getDate() + days);
    return toDateKey(date);
  }

  /** Порядковый номер дня — нужен, чтобы цитата и вызов менялись каждый день */
  function getDayNumber(dateKey) {
    return Math.floor(new Date(`${dateKey}T12:00`).getTime() / 86400000);
  }

  function pickForDate(list, dateKey, step = 1) {
    const length = list.length;
    return list[(((getDayNumber(dateKey) * step) % length) + length) % length];
  }

  /** Склонение: plural(2, "день", "дня", "дней") → "дня" */
  function plural(n, one, few, many) {
    const lastDigit = n % 10;
    const lastTwoDigits = n % 100;
    if (lastDigit === 1 && lastTwoDigits !== 11) return one;
    if (
      lastDigit >= 2 &&
      lastDigit <= 4 &&
      (lastTwoDigits < 12 || lastTwoDigits > 14)
    ) {
      return few;
    }
    return many;
  }

  /** Сколько задач в списке: считаются строки с текстом */
  function countPlanTasks(plan) {
    return plan.filter((task) => task.text.trim()).length;
  }

  /** Приводит план дня к списку [{ text, done }]. Старый формат — текст, по задаче в строке */
  function normalizePlan(plan) {
    if (typeof plan === "string") {
      return plan
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_PLAN_TASKS)
        .map((text) => ({ text, done: false }));
    }
    if (!Array.isArray(plan)) return [];
    return plan.map((task) => ({
      text: String(task?.text ?? ""),
      done: Boolean(task?.done),
    }));
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /** Приводит данные доски из базы к виду { date, stickers: [{ id, x, y, w, h, color, text, z }] } */
  function normalizeBoard(saved) {
    const list = Array.isArray(saved?.stickers) ? saved.stickers : [];
    return {
      date: BOARD_DATE,
      stickers: list.slice(0, MAX_STICKERS).map((item, index) => {
        const w = clamp(Number(item?.w) || STICKER_SIZE, STICKER_MIN, STICKER_MAX);
        const h = clamp(Number(item?.h) || STICKER_SIZE, STICKER_MIN, STICKER_MAX);
        return {
          id: String(item?.id ?? `s${index}`),
          x: clamp(Number(item?.x) || 0, 0, Math.max(0, BOARD_WIDTH - w)),
          y: clamp(Number(item?.y) || 0, 0, Math.max(0, BOARD_HEIGHT - h)),
          w,
          h,
          color: STICKER_COLORS.includes(item?.color) ? item.color : "yellow",
          text: String(item?.text ?? "").slice(0, MAX_STICKER_TEXT),
          z: Number(item?.z) || index + 1,
        };
      }),
    };
  }

  function formatTimer(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  /* ========================================================================
     3. Слой хранения (Supabase)

     Все обращения к данным идут только через объект `storage`.

       loadSettings() / saveSettings()  — настройки, в localStorage браузера
                                          (отдельно для каждого пользователя)
       loadDays()    — GET:    все дни пользователя из таблицы tasks
       saveDay(day)  — POST:   день ещё не в базе → insert
                       PUT:    день уже в базе → update по id строки
       deleteDay(d)  — DELETE: удалить день из базы
       flush()       — дождаться всех отправленных записей (нужно при выходе)

     Таблица tasks: id (int8), user_id (int8 → users.id), date (date),
     fulldata (text). Один день = одна строка; весь объект дня лежит
     в fulldata как JSON. Доска стикеров — ещё одна строка с датой BOARD_DATE.
     ====================================================================== */

  const currentUser = window.Auth.getSession(); // null — идёт переход на страницу входа

  const SETTINGS_KEY_PREFIX = "day-merchant:settings:"; // + id пользователя
  const TASKS_TABLE = "tasks";

  /* Ключи старой версии приложения — при запуске удаляются вместе с записями */
  const LEGACY_STORAGE_KEYS = ["dp-days", "dp-settings"];

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (error) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  const db = () => window.supabaseClient;

  const taskRowIds = {}; // { "ГГГГ-ММ-ДД": id строки в tasks }
  const writeQueues = {}; // { "ГГГГ-ММ-ДД": Promise } — записи одного дня идут по очереди

  /* Записи одного дня выполняются строго друг за другом: иначе два быстрых
     сохранения подряд создали бы две строки вместо одной. */
  function enqueueWrite(date, job) {
    const next = (writeQueues[date] || Promise.resolve()).then(job);
    writeQueues[date] = next;
    return next;
  }

  const storage = {
    clearLegacyData() {
      try {
        LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
      } catch (error) {
        /* localStorage недоступен — удалять нечего */
      }
    },

    async loadSettings() {
      return readJson(SETTINGS_KEY_PREFIX + currentUser.id);
    },

    async saveSettings(settings) {
      return writeJson(SETTINGS_KEY_PREFIX + currentUser.id, settings);
    },

    /** GET: все дни пользователя. При ошибке бросает исключение */
    async loadDays() {
      const { data: rows, error } = await db()
        .from(TASKS_TABLE)
        .select("id, date, fulldata")
        .eq("user_id", currentUser.id)
        .order("id", { ascending: true });

      if (error) throw error;

      const days = {};
      let board = normalizeBoard(null);
      rows.forEach((row) => {
        taskRowIds[row.date] = row.id;

        let saved = null;
        try {
          saved = JSON.parse(row.fulldata);
        } catch (parseError) {
          /* битая запись — покажем пустой день, при сохранении она перезапишется */
        }
        if (row.date === BOARD_DATE) {
          board = normalizeBoard(saved); // это доска стикеров, а не день
          return;
        }
        const day = {
          ...createEmptyDay(row.date),
          ...(saved || {}),
          date: row.date,
        };
        day.plan = normalizePlan(day.plan);
        days[row.date] = day;
      });
      return { days, board };
    },

    /** POST (новый день) или PUT (день уже есть в базе). Возвращает true/false */
    saveDay(day) {
      return enqueueWrite(day.date, async () => {
        try {
          const fulldata = JSON.stringify(day);
          const rowId = taskRowIds[day.date];

          if (rowId) {
            const { error } = await db()
              .from(TASKS_TABLE)
              .update({ fulldata })
              .eq("id", rowId);
            if (error) throw error;
          } else {
            const { data, error } = await db()
              .from(TASKS_TABLE)
              .insert({ user_id: currentUser.id, date: day.date, fulldata })
              .select("id")
              .single();
            if (error) throw error;
            taskRowIds[day.date] = data.id;
          }
          return true;
        } catch (error) {
          console.error("Ошибка сохранения дня:", error);
          return false;
        }
      });
    },

    /** DELETE: удаляет день из базы. Возвращает true/false */
    deleteDay(date) {
      return enqueueWrite(date, async () => {
        try {
          const rowId = taskRowIds[date];
          if (rowId) {
            const { error } = await db()
              .from(TASKS_TABLE)
              .delete()
              .eq("id", rowId);
            if (error) throw error;
            delete taskRowIds[date];
          }
          return true;
        } catch (error) {
          console.error("Ошибка удаления дня:", error);
          return false;
        }
      });
    },

    /** Ждёт, пока завершатся все уже отправленные записи */
    flush() {
      return Promise.all(Object.values(writeQueues));
    },
  };

  /* ========================================================================
     4. Состояние приложения
     ====================================================================== */

  const state = {
    settings: { role: DEFAULT_ROLE, targets: {}, location: null },
    weather: { status: "idle", data: null, message: "" },
    days: {}, // { "ГГГГ-ММ-ДД": day }
    board: { date: BOARD_DATE, stickers: [] }, // доска стикеров
    boardView: { x: 0, y: 0, zoom: 1 }, // сдвиг и масштаб доски; живёт только на странице
    currentDate: getTodayKey(),
    isLoaded: false,
  };

  function createEmptyDay(date) {
    return {
      date,
      plan: [], // «Мои задачи на сегодня» — [{ text, done }]
      counts: {}, // { ключ счётчика: число касаний }
      tasks: [], // [{ text, done }]
      wins: ["", "", ""],
      improvement: "",
      focusSessions: 0,
      carriedOver: false, // незакрытые задачи прошлых дней уже перенесены в этот день
    };
  }

  /** День по дате; если записи ещё нет — создаётся пустая в памяти */
  function getDay(date = state.currentDate) {
    if (!state.days[date]) state.days[date] = createEmptyDay(date);
    return state.days[date];
  }

  function getRole() {
    return ROLES[state.settings.role] || ROLES[DEFAULT_ROLE];
  }

  function getTarget(counterKey, defaultTarget) {
    const saved =
      state.settings.targets?.[`${state.settings.role}:${counterKey}`];
    return saved ?? defaultTarget;
  }

  /* Сохранение с задержкой: пока человек печатает, пишем не на каждую букву */

  const saveTimers = {};

  function saveDay(date = state.currentDate, { immediately = false } = {}) {
    clearTimeout(saveTimers[date]);

    const persist = async () => {
      delete saveTimers[date];
      const isSaved = await storage.saveDay(state.days[date]);
      if (!isSaved) showToast("Не удалось сохранить запись");
    };

    if (immediately) persist();
    else saveTimers[date] = setTimeout(persist, SAVE_DELAY_MS);
  }

  async function saveSettings() {
    const isSaved = await storage.saveSettings(state.settings);
    if (!isSaved) showToast("Настройки не сохранены");
  }

  /* Доска стикеров сохраняется так же: с задержкой при вводе, сразу при действиях */
  let boardTimer = null;

  function saveBoard({ immediately = false } = {}) {
    clearTimeout(boardTimer);

    const persist = async () => {
      boardTimer = null;
      const isSaved = await storage.saveDay(state.board);
      if (!isSaved) showToast("Не удалось сохранить стикеры");
    };

    if (immediately) persist();
    else boardTimer = setTimeout(persist, SAVE_DELAY_MS);
  }

  /* Не теряем введённое, если вкладку закрыли раньше срока задержки */
  window.addEventListener("pagehide", () => {
    Object.keys(saveTimers).forEach((date) =>
      saveDay(date, { immediately: true }),
    );
    if (boardTimer) saveBoard({ immediately: true });
  });

  /* ========================================================================
     5. Подсчёт очков и серии
     ====================================================================== */

  function getTouchesProgress(day) {
    const counters = getRole().counters;
    const sum = counters.reduce((total, [key, , defaultTarget]) => {
      const target = Math.max(1, getTarget(key, defaultTarget));
      return total + Math.min(1, (day.counts[key] || 0) / target);
    }, 0);
    return sum / counters.length;
  }

  /* Разбор дня: три победы дают 75%, пункт «что сделаю иначе» — 25% */
  function getReviewProgress(day) {
    const filledWins = day.wins.filter((win) => win.trim()).length;
    return (filledWins / 3) * 0.75 + (day.improvement.trim() ? 0.25 : 0);
  }

  function getScore(day) {
    if (!day) return 0;
    return Math.round(
      getTouchesProgress(day) * SCORE_WEIGHTS.touches +
        getReviewProgress(day) * SCORE_WEIGHTS.review,
    );
  }

  /** Сколько дней подряд набрано не меньше STREAK_MIN_SCORE очков */
  function getStreak() {
    const todayKey = getTodayKey();
    let streak = 0;
    let dateKey = todayKey;

    // Если сегодня ещё не набрано, считаем серию от вчерашнего дня
    if (getScore(state.days[dateKey]) < STREAK_MIN_SCORE) {
      dateKey = shiftDate(dateKey, -1);
    }
    while (getScore(state.days[dateKey]) >= STREAK_MIN_SCORE) {
      streak++;
      dateKey = shiftDate(dateKey, -1);
    }
    return streak;
  }

  /* ========================================================================
     6. Шаблоны разметки
     ====================================================================== */

  const appElement = $("#app");

  function renderApp() {
    if (!state.isLoaded) {
      appElement.innerHTML = '<p class="page__loading">Открываю ваш день…</p>';
      return;
    }

    const day = getDay();

    appElement.innerHTML = [
      renderWeatherBlock(),
      renderHeader(day),
      renderWeek(),
      renderMorning(day),
      renderTasks(day),
      renderBoard(),
      `<div class="grid grid--two">${renderFocus(day)}${renderTouches(day)}</div>`,
      renderEvening(day),
      renderFooter(),
    ].join("");

    renderTimer();

    applyBoardView();
  }

  /* ---------- Погода ---------- */

  // Open-Meteo: бесплатный сервис без ключа, разрешает запросы из браузера
  const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const WEATHER_TIMEOUT_MS = 10000;
  const MAX_LOCATION_LENGTH = 80;

  // Коды погоды WMO → [значок, описание]
  const WEATHER_CODES = {
    0: ["☀️", "Ясно"],
    1: ["🌤️", "Малооблачно"],
    2: ["⛅", "Переменная облачность"],
    3: ["☁️", "Пасмурно"],
    45: ["🌫️", "Туман"],
    48: ["🌫️", "Изморозь"],
    51: ["🌦️", "Лёгкая морось"],
    53: ["🌦️", "Морось"],
    55: ["🌦️", "Сильная морось"],
    56: ["🌧️", "Ледяная морось"],
    57: ["🌧️", "Ледяная морось"],
    61: ["🌧️", "Небольшой дождь"],
    63: ["🌧️", "Дождь"],
    65: ["🌧️", "Сильный дождь"],
    66: ["🌧️", "Ледяной дождь"],
    67: ["🌧️", "Ледяной дождь"],
    71: ["🌨️", "Небольшой снег"],
    73: ["🌨️", "Снег"],
    75: ["❄️", "Сильный снег"],
    77: ["🌨️", "Снежная крупа"],
    80: ["🌦️", "Ливень"],
    81: ["🌧️", "Сильный ливень"],
    82: ["⛈️", "Очень сильный ливень"],
    85: ["🌨️", "Снегопад"],
    86: ["❄️", "Сильный снегопад"],
    95: ["⛈️", "Гроза"],
    96: ["⛈️", "Гроза с градом"],
    99: ["⛈️", "Гроза с градом"],
  };

  let weatherRequestId = 0;

  function describeWeather(code) {
    return WEATHER_CODES[code] || ["🌡️", "Погода"];
  }

  function formatTemperature(value) {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    const rounded = Math.round(value);
    const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    return `${sign}${Math.abs(rounded)}°`;
  }

  async function fetchJson(url, timeout = WEATHER_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Название места → координаты. null, если такого места не нашли */
  async function geocodeLocation(query) {
    const params = new URLSearchParams({
      name: query,
      count: "1",
      language: "ru",
      format: "json",
    });
    const result = (await fetchJson(`${GEOCODING_URL}?${params}`)).results?.[0];
    if (!result) return null;

    const title = [result.name, result.admin1, result.country]
      .filter((part, index, list) => part && list.indexOf(part) === index)
      .join(", ");
    return {
      name: title,
      lat: result.latitude,
      lon: result.longitude,
      timezone: result.timezone || "",
    };
  }

  /* Прогноз берём у нескольких бесплатных сервисов подряд: если один недоступен
     (например, заблокирован у провайдера), пробуем следующий. Все ответы приводим
     к одному виду: { current: {...}, daily: {...} } */
  const MET_NO_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
  const WTTR_URL = "https://wttr.in/";
  const PROVIDER_TIMEOUT_MS = 6000;

  // Коды погоды сервиса MET Norway (symbol_code) → код WMO
  function metSymbolToCode(symbol = "") {
    const name = symbol.replace(/_(day|night|polartwilight)$/, "");
    if (name.includes("thunder")) return 95;
    if (name.startsWith("heavysnow")) return 75;
    if (name.startsWith("lightsnow")) return 71;
    if (name.includes("snow")) return 73;
    if (name.includes("sleet")) return 67;
    if (name.startsWith("heavyrain")) return 65;
    if (name.startsWith("lightrain")) return 61;
    if (name.includes("rain")) return 63;
    if (name === "fog") return 45;
    if (name === "clearsky") return 0;
    if (name === "fair") return 1;
    if (name === "partlycloudy") return 2;
    return 3;
  }

  // Коды погоды wttr.in (WorldWeatherOnline) → код WMO
  function wwoToCode(code) {
    const value = Number(code);
    if ([113].includes(value)) return 0;
    if ([116].includes(value)) return 2;
    if ([119, 122].includes(value)) return 3;
    if ([143, 248, 260].includes(value)) return 45;
    if ([200, 386, 389, 392, 395].includes(value)) return 95;
    if ([176, 263, 266, 293, 296, 353].includes(value)) return 61;
    if ([299, 302, 305, 356].includes(value)) return 63;
    if ([308, 359].includes(value)) return 65;
    if ([179, 227, 323, 326, 368].includes(value)) return 71;
    if ([230, 329, 332, 335, 338, 371, 350, 374, 377, 362, 365].includes(value)) return 73;
    if ([182, 185, 281, 284, 311, 314, 317, 320].includes(value)) return 67;
    return 3;
  }

  async function forecastFromOpenMeteo({ lat, lon }) {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      wind_speed_unit: "ms",
      timezone: "auto",
      forecast_days: "4",
    });
    return fetchJson(`${FORECAST_URL}?${params}`, PROVIDER_TIMEOUT_MS);
  }

  async function forecastFromMetNo({ lat, lon, timezone }) {
    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
    });
    const series = (await fetchJson(`${MET_NO_URL}?${params}`, PROVIDER_TIMEOUT_MS))
      .properties?.timeseries;
    if (!series?.length) throw new Error("MET Norway: пустой ответ");

    const zone = timezone || undefined; // нет часового пояса — берём пояс браузера
    const dayOf = (iso) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(iso));
    const hourOf = (iso) =>
      Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" })
          .format(new Date(iso)),
      );

    const now = series[0].data;
    const byDay = new Map();
    for (const item of series) {
      const details = item.data?.instant?.details;
      if (!details) continue;
      const key = dayOf(item.time);
      if (!byDay.has(key)) byDay.set(key, { temps: [], code: null, bestHourGap: 99 });
      const entry = byDay.get(key);
      entry.temps.push(details.air_temperature);

      const symbol =
        item.data.next_6_hours?.summary?.symbol_code ||
        item.data.next_1_hours?.summary?.symbol_code;
      const gap = Math.abs(hourOf(item.time) - 12);
      if (symbol && gap < entry.bestHourGap) {
        entry.code = metSymbolToCode(symbol);
        entry.bestHourGap = gap;
      }
    }

    const days = [...byDay.entries()].slice(0, 4);
    return {
      current: {
        temperature_2m: now.instant.details.air_temperature,
        apparent_temperature: null,
        weather_code: metSymbolToCode(
          now.next_1_hours?.summary?.symbol_code || now.next_6_hours?.summary?.symbol_code,
        ),
        wind_speed_10m: now.instant.details.wind_speed,
      },
      daily: {
        time: days.map(([date]) => date),
        weather_code: days.map(([, entry]) => entry.code ?? 3),
        temperature_2m_max: days.map(([, entry]) => Math.max(...entry.temps)),
        temperature_2m_min: days.map(([, entry]) => Math.min(...entry.temps)),
        precipitation_probability_max: days.map(() => null),
      },
    };
  }

  async function forecastFromWttr({ lat, lon }) {
    const url = `${WTTR_URL}${lat.toFixed(3)},${lon.toFixed(3)}?format=j1`;
    const json = await fetchJson(url, PROVIDER_TIMEOUT_MS);
    const current = json.current_condition?.[0];
    const days = json.weather;
    if (!current || !days?.length) throw new Error("wttr.in: пустой ответ");

    const chanceOfRain = (day) =>
      Math.max(
        0,
        ...(day.hourly || []).map((hour) =>
          Math.max(Number(hour.chanceofrain) || 0, Number(hour.chanceofsnow) || 0),
        ),
      );
    const noon = (day) =>
      day.hourly?.find((hour) => hour.time === "1200") || day.hourly?.[4] || {};

    return {
      current: {
        temperature_2m: Number(current.temp_C),
        apparent_temperature: Number(current.FeelsLikeC),
        weather_code: wwoToCode(current.weatherCode),
        wind_speed_10m: Number(current.windspeedKmph) / 3.6,
      },
      daily: {
        time: days.map((day) => day.date),
        weather_code: days.map((day) => wwoToCode(noon(day).weatherCode)),
        temperature_2m_max: days.map((day) => Number(day.maxtempC)),
        temperature_2m_min: days.map((day) => Number(day.mintempC)),
        precipitation_probability_max: days.map(chanceOfRain),
      },
    };
  }

  const FORECAST_PROVIDERS = [forecastFromOpenMeteo, forecastFromMetNo, forecastFromWttr];
  const PROVIDER_KEY = "day-merchant:weather-provider";

  // Запоминаем сработавший сервис в браузере, чтобы не ждать недоступный при каждом открытии
  try {
    const index = FORECAST_PROVIDERS.findIndex(
      (provider) => provider.name === localStorage.getItem(PROVIDER_KEY),
    );
    if (index > 0) FORECAST_PROVIDERS.unshift(...FORECAST_PROVIDERS.splice(index, 1));
  } catch (error) {
    /* localStorage недоступен — порядок по умолчанию */
  }

  async function fetchForecast(location) {
    let lastError = null;
    for (const provider of [...FORECAST_PROVIDERS]) {
      try {
        const forecast = await provider(location);
        if (!Array.isArray(forecast.daily?.time) || !forecast.current) {
          throw new Error("Неполный ответ сервиса погоды");
        }
        // Сервис, который сработал, в следующий раз опрашиваем первым
        FORECAST_PROVIDERS.splice(FORECAST_PROVIDERS.indexOf(provider), 1);
        FORECAST_PROVIDERS.unshift(provider);
        try {
          localStorage.setItem(PROVIDER_KEY, provider.name);
        } catch (error) {
          /* не критично */
        }
        return forecast;
      } catch (error) {
        lastError = error;
        console.warn(`Погода: ${provider.name} недоступен —`, error);
      }
    }
    throw lastError || new Error("Сервисы погоды недоступны");
  }

  function setWeather(patch) {
    state.weather = { ...state.weather, ...patch };
    const result = $("#weather-result");
    if (result) result.innerHTML = renderWeatherResult();
  }

  /** Подгружает прогноз для сохранённого места (при открытии приложения) */
  async function loadWeather() {
    const location = state.settings.location;
    if (!location) return;

    const requestId = ++weatherRequestId;
    setWeather({ status: "loading", message: "" });
    try {
      const data = await fetchForecast(location);
      if (requestId !== weatherRequestId) return; // пришёл устаревший ответ
      setWeather({ status: "ready", data });
    } catch (error) {
      if (requestId !== weatherRequestId) return;
      console.error("Ошибка загрузки погоды:", error);
      setWeather({
        status: "error",
        message: "Не удалось получить прогноз. Проверьте интернет и попробуйте ещё раз.",
      });
    }
  }

  /** Пользователь ввёл место: ищем его, запоминаем и показываем прогноз */
  async function submitLocation(rawQuery) {
    const query = rawQuery.trim().slice(0, MAX_LOCATION_LENGTH);

    if (!query) {
      // пустое поле — убираем место
      weatherRequestId++;
      state.settings.location = null;
      saveSettings();
      setWeather({ status: "idle", data: null, message: "" });
      return;
    }

    const requestId = ++weatherRequestId;
    setWeather({ status: "loading", message: "" });
    try {
      const location = await geocodeLocation(query);
      if (requestId !== weatherRequestId) return;
      if (!location) {
        setWeather({
          status: "error",
          message: `Не нашли «${query}». Проверьте название или попробуйте написать иначе.`,
        });
        return;
      }

      const data = await fetchForecast(location);
      if (requestId !== weatherRequestId) return;

      state.settings.location = location;
      saveSettings();
      const input = $("#weather-input");
      if (input) input.value = location.name;
      setWeather({ status: "ready", data });
    } catch (error) {
      if (requestId !== weatherRequestId) return;
      console.error("Ошибка загрузки погоды:", error);
      setWeather({
        status: "error",
        message: "Не удалось получить прогноз. Проверьте интернет и попробуйте ещё раз.",
      });
    }
  }

  function renderWeatherResult() {
    const { status, data, message } = state.weather;

    if (status === "loading") {
      return '<p class="weather__note">Загружаю прогноз…</p>';
    }
    if (status === "error") {
      return `<p class="weather__note weather__note--error">${escapeHtml(message)}</p>`;
    }
    if (status !== "ready" || !data?.current || !data.daily) {
      return '<p class="weather__note">Впишите город — покажу погоду на ближайшие дни.</p>';
    }

    const [icon, label] = describeWeather(data.current.weather_code);
    const feelsLike =
      typeof data.current.apparent_temperature === "number"
        ? `ощущается как ${formatTemperature(data.current.apparent_temperature)} · `
        : "";
    const wind = Math.round(data.current.wind_speed_10m);

    const days = data.daily.time
      .slice(1, 4)
      .map((date, offset) => {
        const index = offset + 1;
        const [dayIcon, dayLabel] = describeWeather(data.daily.weather_code[index]);
        const weekday = new Date(`${date}T12:00`).toLocaleDateString("ru-RU", {
          weekday: "short",
          day: "numeric",
        });
        const rain = data.daily.precipitation_probability_max?.[index];
        return `
          <li class="weather__day" title="${escapeHtml(dayLabel)}">
            <span class="weather__day-name">${escapeHtml(weekday)}</span>
            <span class="weather__day-icon" aria-hidden="true">${dayIcon}</span>
            <span class="weather__day-temp">${formatTemperature(data.daily.temperature_2m_max[index])}
              <span class="weather__day-min">${formatTemperature(data.daily.temperature_2m_min[index])}</span></span>
            ${typeof rain === "number" ? `<span class="weather__day-rain">осадки ${rain}%</span>` : ""}
          </li>`;
      })
      .join("");

    return `
      <div class="weather__now">
        <span class="weather__icon" aria-hidden="true">${icon}</span>
        <div>
          <div class="weather__temp">${formatTemperature(data.current.temperature_2m)}</div>
          <div class="weather__label">${escapeHtml(label)}</div>
          <div class="weather__meta">${feelsLike}ветер ${wind} м/с</div>
        </div>
      </div>
      <ul class="weather__days">${days}</ul>`;
  }

  function renderWeatherBlock() {
    const location = state.settings.location?.name || "";
    return `
      <section class="weather" aria-label="Прогноз погоды">
        <form class="weather__form" data-form="weather" autocomplete="off">
          <label class="weather__label-text" for="weather-input">Погода</label>
          <input class="input weather__input" id="weather-input" name="location" type="text" maxlength="${MAX_LOCATION_LENGTH}" value="${escapeHtml(location)}" placeholder="Введите город, например Москва" enterkeyhint="search">
          <button class="button" type="submit">Показать</button>
        </form>
        <div class="weather__result" id="weather-result">${renderWeatherResult()}</div>
      </section>`;
  }

  /* ---------- Шапка ---------- */

  function getGreeting() {
    const todayKey = getTodayKey();
    if (state.currentDate < todayKey) return "Разбор прошедшего дня";
    if (state.currentDate > todayKey) return "Подготовка к дню";

    const hour = new Date().getHours();
    if (hour < 12) return "Доброе утро";
    if (hour < 18) return "Хорошего дня";
    return "Добрый вечер";
  }

  /* Меню пользователя: аватар с первой буквой никнейма и выпадающий список */
  function renderUserMenu() {
    if (!currentUser) return "";
    const initial = currentUser.nickname.charAt(0).toUpperCase();

    return `
        <div class="user-menu">
          <button class="user-menu__button" type="button" data-action="toggle-user-menu"
            aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu-list"
            aria-label="Меню пользователя">${escapeHtml(initial)}</button>
          <div class="user-menu__list" id="user-menu-list" role="menu" hidden>
            <div class="user-menu__info">
              <strong class="user-menu__name">${escapeHtml(currentUser.nickname)}</strong>
              <span>${escapeHtml(currentUser.email)}</span>
            </div>
            <button class="user-menu__item" type="button" role="menuitem" data-action="logout">Выйти</button>
          </div>
        </div>`;
  }

  function renderHeader(day) {
    const isToday = state.currentDate === getTodayKey();
    const dateTitle = new Date(`${state.currentDate}T12:00`).toLocaleDateString(
      "ru-RU",
      { weekday: "long", day: "numeric", month: "long" },
    );
    const score = getScore(day);
    const streak = getStreak();
    const scoreHint = `Очки дня: касания ${SCORE_WEIGHTS.touches}, вечерний разбор ${SCORE_WEIGHTS.review}`;

    return `
      <header class="header">
        <div class="header__greeting">
          <span class="header__date">${escapeHtml(dateTitle)}</span>
          <h1 class="header__title">${getGreeting()}</h1>
        </div>

        <nav class="header__nav">
          <button class="button" data-action="shift-day" data-offset="-1" aria-label="Предыдущий день">‹</button>
          ${isToday ? "" : '<button class="button" data-action="go-today">Сегодня</button>'}
          <button class="button" data-action="shift-day" data-offset="1" aria-label="Следующий день">›</button>
        </nav>

        <div class="score" title="${scoreHint}">
          <svg class="score__ring" viewBox="0 0 48 48">
            <circle class="score__ring-track" cx="24" cy="24" r="${RING_RADIUS}" />
            <circle class="score__ring-progress" cx="24" cy="24" r="${RING_RADIUS}"
              stroke-dasharray="${RING_LENGTH}"
              stroke-dashoffset="${RING_LENGTH * (1 - score / 100)}"
              transform="rotate(-90 24 24)" />
            <text class="score__ring-value" x="24" y="29" text-anchor="middle">${score}</text>
          </svg>
          <div>
            <strong class="score__title">Очки дня</strong>
            <span class="score__streak">Серия: <span class="score__streak-count">${streak}</span> ${plural(streak, "день", "дня", "дней")} от ${STREAK_MIN_SCORE}</span>
          </div>
        </div>
        ${renderUserMenu()}
      </header>`;
  }

  /* ---------- Неделя ---------- */

  function renderWeek() {
    const todayKey = getTodayKey();
    const currentWeekday = new Date(`${state.currentDate}T12:00`).getDay();
    const monday = shiftDate(state.currentDate, -((currentWeekday + 6) % 7));

    const dayButtons = WEEKDAY_NAMES.map((weekdayName, index) => {
      const dateKey = shiftDate(monday, index);
      const modifiers = [
        dateKey === state.currentDate ? " week__day--current" : "",
        dateKey === todayKey ? " week__day--today" : "",
      ].join("");

      return `
        <button class="week__day${modifiers}" data-action="select-day" data-date="${dateKey}">
          <span class="week__weekday">${weekdayName}</span>
          <span class="week__date">${Number(dateKey.slice(8))}</span>
          <span class="week__bar"><i class="week__bar-fill" style="width:${getScore(state.days[dateKey])}%"></i></span>
        </button>`;
    });

    return `<div class="week">${dayButtons.join("")}</div>`;
  }

  /* ---------- Утро ---------- */

  function renderMorning(day) {
    const [quoteText, quoteAuthor] = pickForDate(QUOTES, state.currentDate);
    return `
      <section class="section section--morning">
        <div class="section__header">
          <span class="section__badge">Утро</span>
          <h2 class="section__title">Настрой</h2>
          <span class="section__hint">15 минут до первых дел</span>
        </div>

        <figure class="quote">
          <blockquote class="quote__text">«${escapeHtml(quoteText)}»</blockquote>
          <figcaption class="quote__author">— ${escapeHtml(quoteAuthor)}</figcaption>
        </figure>

        ${renderPlan(day)}
      </section>`;
  }

  /* ---------- Мои задачи на сегодня ---------- */

  function renderPlan(day) {
    const isToday = state.currentDate === getTodayKey();

    // Пока задач нет, показываем одну пустую строку — она появится в данных при вводе
    const rows = day.plan.length ? day.plan : [{ text: "", done: false }];

    return `
        <div class="plan">
          <div class="plan__header">
            <span class="plan__title">Мои задачи на ${isToday ? "сегодня" : "этот день"}</span>
            <span class="plan__count" id="plan-count">${countPlanTasks(day.plan)}/${MAX_PLAN_TASKS}</span>
          </div>
          <div class="plan__list">${rows.map(renderPlanTask).join("")}</div>
          <button class="button button--dawn" type="button" data-action="save-plan">Сохранить задачи</button>
        </div>`;
  }

  function renderPlanTask(task, index) {
    return `
          <div class="plan__row">
            <input class="input input--plain${task.done ? " input--done" : ""}" id="plan-text-${index}" data-field="plan-text" data-index="${index}" value="${escapeHtml(task.text)}" placeholder="${index === 0 ? "Впишите задачу и нажмите Enter" : "Задача"}" aria-label="Задача ${index + 1}">
            <input class="checkbox" type="checkbox" data-field="plan-done" data-index="${index}" ${task.done ? "checked" : ""} aria-label="Выполнена">
            <button class="delete-button" type="button" data-action="delete-plan-task" data-index="${index}" aria-label="Удалить задачу">×</button>
          </div>`;
  }

  /* ---------- Фокус (только таймер) ---------- */

  function renderFocus() {
    return `
      <section class="section section--day">
        <div class="section__header">
          <span class="section__badge">День</span>
          <h2 class="section__title">Фокус</h2>
          <span class="section__hint">Работа короткими сессиями</span>
        </div>
        <div class="timer" id="timer"></div>
      </section>`;
  }

  /* ---------- Касания ---------- */

  function renderCounter([key, name, defaultTarget], day) {
    const value = day.counts[key] || 0;
    const target = getTarget(key, defaultTarget);
    const percent = Math.min(100, (value / Math.max(1, target)) * 100);

    return `
      <div class="counter${value >= target ? " counter--reached" : ""}">
        <span class="counter__title">${escapeHtml(name)}</span>
        <div class="counter__value">
          <b class="counter__current">${value}</b>
          <span class="counter__target">/ ${target}</span>
        </div>
        <div class="counter__progress"><i class="counter__progress-fill" style="width:${percent}%"></i></div>
        <div class="counter__buttons">
          <button class="counter__button" type="button" data-action="change-counter" data-counter="${key}" data-step="-1" aria-label="Минус">−</button>
          <button class="counter__button counter__button--plus" type="button" data-action="change-counter" data-counter="${key}" data-step="1" aria-label="Плюс">+</button>
        </div>
      </div>`;
  }

  function renderTouches(day) {
    const counters = getRole().counters.map((counter) =>
      renderCounter(counter, day),
    );

    return `
      <section class="section section--day">
        <div class="section__header">
          <span class="section__badge">День</span>
          <h2 class="section__title">Касания</h2>
          <span class="section__hint">Активность, которую вы контролируете</span>
        </div>
        <div class="counters">${counters.join("")}</div>
      </section>`;
  }

  /* ---------- Остальные задачи ---------- */

  function renderTask(task, index) {
    return `
      <div class="task">
        <input class="checkbox" type="checkbox" data-field="task-done" data-index="${index}" ${task.done ? "checked" : ""} aria-label="Готово">
        <input class="input${task.done ? " input--done" : ""}" id="task-${index}" data-field="task-text" data-index="${index}" value="${escapeHtml(task.text)}" placeholder="Задача">
        <button class="delete-button" data-action="delete-task" data-index="${index}" aria-label="Удалить">×</button>
      </div>`;
  }

  function renderTasks(day) {
    return `
      <section class="section section--day">
        <div class="section__header">
          <span class="section__badge">День</span>
          <h2 class="section__title">Остальное</h2>
          <span class="section__hint">Мелочи — после главного</span>
        </div>
        <div class="tasks">
          ${day.tasks.map(renderTask).join("")}
          <button class="add-button" data-action="add-task">+ Задача</button>
        </div>
      </section>`;
  }

  /* ---------- Стикеры ---------- */

  function renderSticker(sticker) {
    return `
        <div class="sticker" data-sticker="${sticker.id}" data-color="${sticker.color}" style="left:${sticker.x}px;top:${sticker.y}px;width:${sticker.w}px;height:${sticker.h}px;z-index:${sticker.z}">
          <div class="sticker__bar" data-handle="${sticker.id}" title="Перетащите за эту полосу">
            <span class="sticker__grip" aria-hidden="true">⋮⋮</span>
            <button class="sticker__button" type="button" data-action="cycle-sticker-color" data-id="${sticker.id}" aria-label="Сменить цвет">●</button>
            <button class="sticker__button" type="button" data-action="delete-sticker" data-id="${sticker.id}" aria-label="Удалить стикер">×</button>
          </div>
          <textarea class="sticker__text" id="sticker-text-${sticker.id}" data-field="sticker-text" data-id="${sticker.id}" maxlength="${MAX_STICKER_TEXT}" placeholder="Мысль, идея, напоминание…" aria-label="Текст стикера">${escapeHtml(sticker.text)}</textarea>
          ${RESIZE_DIRS.map((dir) => `<span class="sticker__resize sticker__resize--${dir}" data-resize="${dir}" data-id="${sticker.id}"></span>`).join("")}
        </div>`;
  }

  function renderBoard() {
    const { stickers } = state.board;

    return `
      <section class="section section--day">
        <div class="section__header">
          <span class="section__badge">Доска</span>
          <h2 class="section__title">Стикеры</h2>
          <span class="section__hint">Фон — двигать доску, полоса — стикер</span>
        </div>
        <div class="board__toolbar">
          <button class="button button--primary" type="button" data-action="add-sticker">+ Стикер</button>
          <span class="board__count">${stickers.length}/${MAX_STICKERS}</span>
          <div class="board__zoom">
            <button class="button" type="button" data-action="zoom-out" aria-label="Отдалить">−</button>
            <button class="button board__zoom-value" type="button" data-action="zoom-reset" id="board-zoom" title="Сбросить масштаб и положение">100%</button>
            <button class="button" type="button" data-action="zoom-in" aria-label="Приблизить">+</button>
          </div>
        </div>
        <div class="board" id="board">
          <div class="board__canvas" style="width:${BOARD_WIDTH}px;height:${BOARD_HEIGHT}px">
            ${stickers.map(renderSticker).join("")}
            ${stickers.length ? "" : '<p class="board__empty">Доска пуста. Нажмите «+ Стикер» и запишите мысль.</p>'}
          </div>
        </div>
      </section>`;
  }

  /* ---------- Вечерний разбор ---------- */

  function renderEvening(day) {
    const isToday = state.currentDate === getTodayKey();
    const wins = day.wins
      .map(
        (win, index) => `
          <input class="input" id="win-${index}" data-field="win" data-index="${index}" value="${escapeHtml(win)}" placeholder="${WIN_PLACEHOLDERS[index]}">`,
      )
      .join("");

    return `
      <section class="section section--evening">
        <div class="section__header">
          <span class="section__badge">Вечер</span>
          <h2 class="section__title">Разбор дня</h2>
          <span class="section__hint">5 минут, чтобы завтра было легче</span>
        </div>

        <div class="review__columns">
          <div class="field">
            <span class="field__label">Три победы сегодня</span>
            <div class="review__wins">${wins}</div>
          </div>

          <div class="field">
            <label class="field__label" for="improvement">Что сделаю иначе завтра</label>
            <textarea class="input input--textarea" id="improvement" data-field="improvement" rows="3">${escapeHtml(day.improvement)}</textarea>
          </div>
        </div>

        <button class="button button--dusk" data-action="carry-over">
          Перенести незакрытое на ${isToday ? "завтра" : "следующий день"}
        </button>
      </section>`;
  }

  /* ---------- Подвал ---------- */

  function renderFooter() {
    return `
      <footer class="footer">
        <span class="footer__note">Записи сохраняются в вашем аккаунте. Роль: ${getRole().name.toLowerCase()}.</span>
        <button class="footer__link" data-action="open-settings">Настройки: роль и цели</button>
      </footer>`;
  }

  /* Обновление очков без полной перерисовки — чтобы не сбивать фокус при вводе */
  function refreshScore() {
    const score = getScore(getDay());

    const valueElement = $(".score__ring-value");
    const progressElement = $(".score__ring-progress");
    if (valueElement) valueElement.textContent = score;
    if (progressElement) {
      progressElement.setAttribute(
        "stroke-dashoffset",
        RING_LENGTH * (1 - score / 100),
      );
    }

    const weekBar = $(".week__day--current .week__bar-fill");
    if (weekBar) weekBar.style.width = `${score}%`;
  }

  /* ========================================================================
     7. Обработчики событий
     ====================================================================== */

  /** Задача плана по индексу; пустая строка-заготовка создаётся в данных при первом вводе */
  function getPlanTask(day, index) {
    if (!day.plan[index]) day.plan[index] = { text: "", done: false };
    return day.plan[index];
  }

  /** Перерисовывает страницу и ставит курсор в строку плана */
  function focusPlanTask(index, caret = "end") {
    renderApp();
    const input = document.getElementById(`plan-text-${index}`);
    if (!input) return;
    input.focus();
    const position = caret === "start" ? 0 : input.value.length;
    input.setSelectionRange(position, position);
  }

  /* Ввод текста: обновляем день и сохраняем с задержкой, без перерисовки */
  const INPUT_HANDLERS = {
    "plan-text": (day, el, index) => {
      getPlanTask(day, index).text = el.value;

      const counter = $("#plan-count");
      if (counter)
        counter.textContent = `${countPlanTasks(day.plan)}/${MAX_PLAN_TASKS}`;
    },
    improvement: (day, el) => (day.improvement = el.value),
    win: (day, el, index) => (day.wins[index] = el.value),
    "task-text": (day, el, index) => (day.tasks[index].text = el.value),
  };

  /* Переключатели: сохраняем сразу и перерисовываем */
  const CHANGE_HANDLERS = {
    "plan-done": (day, el, index) =>
      (getPlanTask(day, index).done = el.checked),
    "task-done": (day, el, index) => (day.tasks[index].done = el.checked),
  };

  appElement.addEventListener("input", (event) => {
    const el = event.target;

    if (el.dataset.field === "sticker-text") {
      const sticker = findSticker(el.dataset.id);
      if (sticker) {
        sticker.text = el.value;
        saveBoard();
      }
      return;
    }

    const handler = INPUT_HANDLERS[el.dataset.field];
    if (!handler) return;

    handler(getDay(), el, Number(el.dataset.index));
    saveDay();
    refreshScore();
  });

  appElement.addEventListener("submit", (event) => {
    if (event.target.dataset?.form !== "weather") return;
    event.preventDefault();
    submitLocation(new FormData(event.target).get("location") || "");
  });

  appElement.addEventListener("change", (event) => {
    const el = event.target;
    const handler = CHANGE_HANDLERS[el.dataset.field];
    if (!handler) return;

    handler(getDay(), el, Number(el.dataset.index));
    saveDay(state.currentDate, { immediately: true });
    renderApp();
  });

  /* Enter в поле задачи создаёт новую задачу под ней */
  appElement.addEventListener("keydown", (event) => {
    const field = event.target.dataset?.field;
    const index = Number(event.target.dataset?.index);

    if (field === "plan-text") {
      const day = getDay();

      if (event.key === "Enter") {
        event.preventDefault();
        if (day.plan.length >= MAX_PLAN_TASKS) {
          showToast(`Не больше ${MAX_PLAN_TASKS} задач`);
          return;
        }
        getPlanTask(day, index);
        day.plan.splice(index + 1, 0, { text: "", done: false });
        saveDay();
        focusPlanTask(index + 1);
      }

      // Backspace в пустой строке удаляет её и возвращает курсор выше
      if (event.key === "Backspace" && !event.target.value && index > 0) {
        event.preventDefault();
        day.plan.splice(index, 1);
        saveDay();
        focusPlanTask(index - 1);
      }
      return;
    }

    if (event.key !== "Enter" || field !== "task-text") return;

    event.preventDefault();
    const nextIndex = index + 1;
    getDay().tasks.splice(nextIndex, 0, { text: "", done: false });
    saveDay();
    renderApp();
    document.getElementById(`task-${nextIndex}`)?.focus();
  });

  /* Вставка нескольких строк раскладывается по отдельным задачам */
  appElement.addEventListener("paste", (event) => {
    const input = event.target;
    if (input.dataset?.field !== "plan-text") return;

    const pasted = event.clipboardData?.getData("text") || "";
    if (!/[\r\n]/.test(pasted)) return; // одна строка — обычная вставка

    event.preventDefault();
    const day = getDay();
    const index = Number(input.dataset.index);
    const task = getPlanTask(day, index);

    const merged =
      input.value.slice(0, input.selectionStart) +
      pasted +
      input.value.slice(input.selectionEnd);
    const texts = merged
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!texts.length) return;

    const room = MAX_PLAN_TASKS - (day.plan.length - 1);
    if (texts.length > room) showToast(`Не больше ${MAX_PLAN_TASKS} задач`);
    const added = texts.slice(0, Math.max(1, room));

    const [first, ...rest] = added;
    task.text = first;
    day.plan.splice(
      index + 1,
      0,
      ...rest.map((text) => ({ text, done: false })),
    );
    saveDay();
    focusPlanTask(index + added.length - 1);
  });

  /* Нажатия на кнопки: действие определяется по data-action */
  const CLICK_ACTIONS = {
    "shift-day": (button) =>
      showDay(shiftDate(state.currentDate, Number(button.dataset.offset))),

    "go-today": () => showDay(getTodayKey()),

    "select-day": (button) => showDay(button.dataset.date),

    "save-plan": async () => {
      // Автосохранение и так работает; кнопка отправляет запись сразу и подтверждает это
      const date = state.currentDate;
      clearTimeout(saveTimers[date]);
      delete saveTimers[date];

      // Пустые строки не сохраняем
      const day = getDay(date);
      day.plan = day.plan.filter((task) => task.text.trim());

      const isSaved = await storage.saveDay(day);
      showToast(isSaved ? "Задачи сохранены" : "Не удалось сохранить запись");
      if (date === state.currentDate) renderApp();
    },

    "delete-plan-task": (button) => {
      getDay().plan.splice(Number(button.dataset.index), 1);
      saveDay(state.currentDate, { immediately: true });
      renderApp();
    },

    "change-counter": (button) => {
      const day = getDay();
      const key = button.dataset.counter;
      const step = Number(button.dataset.step);
      const [, , defaultTarget] = getRole().counters.find(([k]) => k === key);

      day.counts[key] = Math.max(0, (day.counts[key] || 0) + step);
      if (step > 0 && day.counts[key] === getTarget(key, defaultTarget)) {
        showToast("Цель по касаниям выполнена!");
      }
      saveDay();
      renderApp();
    },

    "add-task": () => {
      const day = getDay();
      day.tasks.push({ text: "", done: false });
      saveDay();
      renderApp();
      document.getElementById(`task-${day.tasks.length - 1}`)?.focus();
    },

    "delete-task": (button) => {
      getDay().tasks.splice(Number(button.dataset.index), 1);
      saveDay(state.currentDate, { immediately: true });
      renderApp();
    },

    "add-sticker": addSticker,

    "zoom-in": () => zoomBoard(ZOOM_STEP),

    "zoom-out": () => zoomBoard(1 / ZOOM_STEP),

    "zoom-reset": () => {
      state.boardView = { x: 0, y: 0, zoom: 1 };
      applyBoardView();
    },

    "delete-sticker": (button) => deleteSticker(button.dataset.id),

    "cycle-sticker-color": (button) => cycleStickerColor(button.dataset.id),

    "carry-over": carryOverUnfinishedTasks,

    "open-settings": openSettings,

    "timer-toggle": toggleTimer,

    "timer-reset": resetTimer,

    "toggle-user-menu": toggleUserMenu,

    logout: logout,

    reload: () => window.location.reload(),
  };

  appElement.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    CLICK_ACTIONS[button.dataset.action]?.(button);
  });

  /* ---------- Стикеры: добавление, цвет, удаление, перетаскивание ---------- */

  const findSticker = (id) => state.board.stickers.find((item) => item.id === id);
  const nextStickerZ = () =>
    state.board.stickers.reduce((max, item) => Math.max(max, item.z), 0) + 1;

  let lastStickerColor = "yellow"; // новый стикер берёт цвет последнего изменённого

  function addSticker() {
    const { stickers } = state.board;
    if (stickers.length >= MAX_STICKERS) {
      showToast(`Не больше ${MAX_STICKERS} стикеров`);
      return;
    }

    // Новый стикер появляется в видимой части доски, каждый следующий чуть сдвинут
    const { x: viewX, y: viewY, zoom } = state.boardView;
    const offset = (stickers.length % 6) * 26;
    const sticker = {
      id: Math.random().toString(36).slice(2, 10),
      x: clamp((20 - viewX) / zoom + offset, 0, BOARD_WIDTH - STICKER_SIZE),
      y: clamp((20 - viewY) / zoom + offset, 0, BOARD_HEIGHT - STICKER_SIZE),
      w: STICKER_SIZE,
      h: STICKER_SIZE,
      color: lastStickerColor,
      text: "",
      z: nextStickerZ(),
    };

    stickers.push(sticker);
    saveBoard({ immediately: true });
    renderApp();
    document.getElementById(`sticker-text-${sticker.id}`)?.focus();
  }

  function cycleStickerColor(id) {
    const sticker = findSticker(id);
    if (!sticker) return;

    const next =
      STICKER_COLORS[(STICKER_COLORS.indexOf(sticker.color) + 1) % STICKER_COLORS.length];
    sticker.color = next;
    lastStickerColor = next;
    $(`[data-sticker="${id}"]`)?.setAttribute("data-color", next); // без перерисовки — не сбиваем ввод
    saveBoard({ immediately: true });
  }

  function deleteSticker(id) {
    const sticker = findSticker(id);
    if (!sticker) return;
    if (sticker.text.trim() && !window.confirm("Удалить стикер вместе с текстом?")) return;

    state.board.stickers = state.board.stickers.filter((item) => item.id !== id);
    saveBoard({ immediately: true });
    renderApp();
  }

  /* ---------- Масштаб и сдвиг доски ---------- */

  /** Не даёт увести холст так, чтобы за его краем осталась пустота */
  function clampBoardView(view, viewport) {
    const fit = (offset, canvasSize, viewportSize) => {
      const scaled = canvasSize * view.zoom;
      if (scaled <= viewportSize) return (viewportSize - scaled) / 2; // холст целиком виден — по центру
      return clamp(offset, viewportSize - scaled, 0);
    };
    view.x = fit(view.x, BOARD_WIDTH, viewport.width);
    view.y = fit(view.y, BOARD_HEIGHT, viewport.height);
  }

  /** Применяет масштаб и сдвиг к холсту и подписи «100%» */
  function applyBoardView() {
    const board = $("#board");
    const canvas = $(".board__canvas");
    if (!board || !canvas) return;

    const view = state.boardView;
    clampBoardView(view, board.getBoundingClientRect());
    canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;

    const label = $("#board-zoom");
    if (label) label.textContent = `${Math.round(view.zoom * 100)}%`;
  }

  /** Меняет масштаб вокруг точки доски (по умолчанию — её центра) */
  function zoomBoard(factor, originX, originY) {
    const board = $("#board");
    if (!board) return;

    const rect = board.getBoundingClientRect();
    const view = state.boardView;
    const cx = originX ?? rect.width / 2;
    const cy = originY ?? rect.height / 2;
    const zoom = clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const ratio = zoom / view.zoom;

    view.x = cx - (cx - view.x) * ratio;
    view.y = cy - (cy - view.y) * ratio;
    view.zoom = zoom;
    applyBoardView();
  }

  /* Колесо мыши с Ctrl (и щипок на тачпаде) — масштаб вокруг курсора */
  appElement.addEventListener(
    "wheel",
    (event) => {
      const board = event.target.closest?.("#board");
      if (!board || !(event.ctrlKey || event.metaKey)) return;

      event.preventDefault();
      const rect = board.getBoundingClientRect();
      zoomBoard(
        event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    { passive: false },
  );

  /* Сдвиг доски: зажать левую кнопку (или палец) на пустом месте и тянуть */
  let pan = null;

  /* Изменение размера: тянем за любой край или угол стикера */
  let resize = null;

  /* Перетаскивание за верхнюю полосу — мышью, пальцем и пером (Pointer Events) */
  let drag = null;

  appElement.addEventListener("pointerdown", (event) => {
    const board = event.target.closest("#board");
    if (board && !event.target.closest(".sticker") && event.button <= 0) {
      board.setPointerCapture(event.pointerId);
      board.classList.add("board--panning");
      pan = {
        board,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: state.boardView.x,
        originY: state.boardView.y,
      };
      return;
    }

    const grip = event.target.closest("[data-resize]");
    if (grip && event.button <= 0) {
      const sticker = findSticker(grip.dataset.id);
      const element = grip.closest(".sticker");
      if (!sticker || !element) return;

      sticker.z = nextStickerZ();
      element.style.zIndex = sticker.z;
      element.classList.add("sticker--dragging");
      grip.setPointerCapture(event.pointerId);

      resize = {
        sticker,
        element,
        dir: grip.dataset.resize,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: sticker.x, y: sticker.y, w: sticker.w, h: sticker.h },
      };
      return;
    }

    const handle = event.target.closest("[data-handle]");
    if (!handle || event.target.closest("button") || event.button > 0) return;

    const sticker = findSticker(handle.dataset.handle);
    const element = handle.closest(".sticker");
    if (!sticker || !element) return;

    sticker.z = nextStickerZ(); // поднимаем стикер поверх остальных
    element.style.zIndex = sticker.z;
    element.classList.add("sticker--dragging");
    handle.setPointerCapture(event.pointerId);

    drag = {
      sticker,
      element,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: sticker.x,
      originY: sticker.y,
    };
  });

  appElement.addEventListener("pointermove", (event) => {
    if (pan && event.pointerId === pan.pointerId) {
      state.boardView.x = pan.originX + event.clientX - pan.startX;
      state.boardView.y = pan.originY + event.clientY - pan.startY;
      applyBoardView();
      return;
    }

    if (resize && event.pointerId === resize.pointerId) {
      const { sticker, element, dir, origin } = resize;
      const { zoom } = state.boardView;
      const dx = (event.clientX - resize.startX) / zoom;
      const dy = (event.clientY - resize.startY) / zoom;

      // Тянем нужные стороны; противоположная остаётся на месте, размер ограничен и доской
      if (dir.includes("e")) {
        sticker.w = clamp(origin.w + dx, STICKER_MIN, Math.min(STICKER_MAX, BOARD_WIDTH - origin.x));
      }
      if (dir.includes("w")) {
        const right = origin.x + origin.w;
        sticker.w = clamp(origin.w - dx, STICKER_MIN, Math.min(STICKER_MAX, right));
        sticker.x = right - sticker.w;
      }
      if (dir.includes("s")) {
        sticker.h = clamp(origin.h + dy, STICKER_MIN, Math.min(STICKER_MAX, BOARD_HEIGHT - origin.y));
      }
      if (dir.includes("n")) {
        const bottom = origin.y + origin.h;
        sticker.h = clamp(origin.h - dy, STICKER_MIN, Math.min(STICKER_MAX, bottom));
        sticker.y = bottom - sticker.h;
      }

      element.style.left = `${sticker.x}px`;
      element.style.top = `${sticker.y}px`;
      element.style.width = `${sticker.w}px`;
      element.style.height = `${sticker.h}px`;
      return;
    }

    if (!drag || event.pointerId !== drag.pointerId) return;

    // Сдвиг на экране делим на масштаб — получаем сдвиг на самой доске
    const { zoom } = state.boardView;
    drag.sticker.x = clamp(drag.originX + (event.clientX - drag.startX) / zoom, 0, BOARD_WIDTH - drag.sticker.w);
    drag.sticker.y = clamp(drag.originY + (event.clientY - drag.startY) / zoom, 0, BOARD_HEIGHT - drag.sticker.h);
    drag.element.style.left = `${drag.sticker.x}px`;
    drag.element.style.top = `${drag.sticker.y}px`;
  });

  function endDrag(event) {
    if (resize && event.pointerId === resize.pointerId) {
      resize.element.classList.remove("sticker--dragging");
      // Размеры храним целыми числами
      Object.assign(resize.sticker, {
        x: Math.round(resize.sticker.x),
        y: Math.round(resize.sticker.y),
        w: Math.round(resize.sticker.w),
        h: Math.round(resize.sticker.h),
      });
      resize = null;
      saveBoard({ immediately: true });
      return;
    }

    if (pan && event.pointerId === pan.pointerId) {
      pan.board.classList.remove("board--panning");
      pan = null;
      return;
    }

    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.element.classList.remove("sticker--dragging");
    drag = null;
    saveBoard({ immediately: true });
  }

  appElement.addEventListener("pointerup", endDrag);
  appElement.addEventListener("pointercancel", endDrag);

  /** Открывает день. Сегодняшний день при первом открытии получает незакрытые задачи прошлых дней */
  function showDay(dateKey) {
    state.currentDate = dateKey;
    if (dateKey === getTodayKey()) carryOverIntoToday();
    renderApp();
  }

  /**
   * Автоперенос: незакрытые задачи («Мои задачи» и «Остальное») из ближайшего
   * предыдущего дня, где были задачи, попадают в сегодняшний день.
   * Срабатывает один раз за день (флаг carriedOver хранится в записи дня),
   * поэтому удалённая задача не вернётся. Прошлые дни не меняются.
   */
  function carryOverIntoToday() {
    const todayKey = getTodayKey();
    const today = getDay(todayKey);
    if (today.carriedOver) return;

    const hasTasks = (day) =>
      [...day.plan, ...day.tasks].some((task) => task.text.trim());
    const previousDate = Object.keys(state.days)
      .filter((date) => date < todayKey && hasTasks(state.days[date]))
      .sort()
      .pop();

    // Тексты незакрытых задач, которых ещё нет в целевом списке (и без повторов внутри)
    const pickUnfinished = (fromList, toList, limit = Infinity) => {
      const seen = new Set(toList.map((task) => task.text.trim()));
      const picked = [];
      fromList.forEach((task) => {
        const text = task.text.trim();
        if (!text || task.done || seen.has(text) || picked.length >= limit)
          return;
        seen.add(text);
        picked.push(text);
      });
      return picked;
    };

    let total = 0;
    if (previousDate) {
      const previous = state.days[previousDate];

      today.plan = today.plan.filter((task) => task.text.trim()); // пустые строки не нужны
      const planTexts = pickUnfinished(
        previous.plan,
        today.plan,
        MAX_PLAN_TASKS - today.plan.length,
      );
      const taskTexts = pickUnfinished(previous.tasks, today.tasks);

      today.plan.push(...planTexts.map((text) => ({ text, done: false })));
      today.tasks.push(...taskTexts.map((text) => ({ text, done: false })));
      total = planTexts.length + taskTexts.length;

      if (total) {
        const fromDate = new Date(`${previousDate}T12:00`).toLocaleDateString(
          "ru-RU",
          {
            day: "numeric",
            month: "long",
          },
        );
        showToast(
          `Перенесено с ${fromDate}: ${total} ${plural(total, "задача", "задачи", "задач")}`,
        );
      }
    }

    today.carriedOver = true;
    saveDay(todayKey, { immediately: true });
  }

  /** Переносит незавершённые задачи на следующий день */
  function carryOverUnfinishedTasks() {
    const day = getDay();
    const nextDate = shiftDate(state.currentDate, 1);
    const nextDay = getDay(nextDate);

    const unfinished = (list) =>
      list
        .filter((task) => task.text.trim() && !task.done)
        .map((task) => task.text.trim());

    // «Мои задачи на сегодня» → в план следующего дня (в пределах лимита)
    const planThere = new Set(nextDay.plan.map((task) => task.text.trim()));
    const planRoom = Math.max(0, MAX_PLAN_TASKS - nextDay.plan.length);
    const planCandidates = unfinished(day.plan).filter(
      (text) => !planThere.has(text),
    );
    const planToCarry = planCandidates.slice(0, planRoom);

    // «Остальное» → в «Остальное» следующего дня
    const tasksThere = new Set(nextDay.tasks.map((task) => task.text));
    const tasksToCarry = unfinished(day.tasks).filter(
      (text) => !tasksThere.has(text),
    );

    const total = planToCarry.length + tasksToCarry.length;
    if (!total) {
      showToast(
        planCandidates.length
          ? `Не больше ${MAX_PLAN_TASKS} задач на день`
          : "Всё закрыто — переносить нечего",
      );
      return;
    }

    nextDay.plan.push(...planToCarry.map((text) => ({ text, done: false })));
    nextDay.tasks.push(...tasksToCarry.map((text) => ({ text, done: false })));
    saveDay(nextDate, { immediately: true });
    showToast(`Перенесено задач: ${total}`);
  }

  /* ========================================================================
     8. Таймер фокус-сессий
     ====================================================================== */

  const timer = {
    mode: "focus", // "focus" | "break"
    secondsLeft: FOCUS_SECONDS,
    isRunning: false,
    endTime: 0,
    intervalId: null,
  };

  function getTimerButtonLabel() {
    if (timer.isRunning) return "Пауза";
    const fullDuration = timer.mode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS;
    return timer.secondsLeft < fullDuration ? "Продолжить" : "Старт";
  }

  function renderTimer() {
    const element = $("#timer");
    if (!element) return;

    element.innerHTML = `
      <div>
        <div class="timer__mode">${timer.mode === "focus" ? "Фокус-сессия" : "Перерыв"}</div>
        <div class="timer__clock" id="timer-clock">${formatTimer(timer.secondsLeft)}</div>
      </div>
      <span class="timer__spacer"></span>
      <span class="timer__sessions">Сессий сегодня: <b class="timer__sessions-count">${getDay().focusSessions || 0}</b></span>
      <button class="timer__button" type="button" data-action="timer-toggle">${getTimerButtonLabel()}</button>
      <button class="timer__button timer__button--secondary" type="button" data-action="timer-reset">Сброс</button>`;
  }

  function toggleTimer() {
    if (timer.isRunning) {
      timer.isRunning = false;
      clearInterval(timer.intervalId);
    } else {
      timer.isRunning = true;
      timer.endTime = Date.now() + timer.secondsLeft * 1000;
      timer.intervalId = setInterval(tickTimer, 500);
    }
    renderTimer();
  }

  function resetTimer() {
    timer.isRunning = false;
    clearInterval(timer.intervalId);
    timer.mode = "focus";
    timer.secondsLeft = FOCUS_SECONDS;
    renderTimer();
  }

  function tickTimer() {
    timer.secondsLeft = Math.max(
      0,
      Math.round((timer.endTime - Date.now()) / 1000),
    );

    const clock = $("#timer-clock");
    if (clock) clock.textContent = formatTimer(timer.secondsLeft);
    if (timer.secondsLeft > 0) return;

    clearInterval(timer.intervalId);
    timer.isRunning = false;
    playBeep();

    if (timer.mode === "focus") {
      const today = getDay(getTodayKey());
      today.focusSessions = (today.focusSessions || 0) + 1;
      saveDay(getTodayKey(), { immediately: true });

      timer.mode = "break";
      timer.secondsLeft = BREAK_SECONDS;
      showToast("25 минут фокуса. Встаньте и разомнитесь 5 минут.");
    } else {
      timer.mode = "focus";
      timer.secondsLeft = FOCUS_SECONDS;
      showToast("Перерыв окончен. Следующая сессия?");
    }
    renderTimer();
  }

  /** Три коротких сигнала по окончании сессии */
  function playBeep() {
    try {
      const audio = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((offset) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + offset;

        oscillator.frequency.value = 880;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
        oscillator.start(start);
        oscillator.stop(start + 0.2);
      });
    } catch (error) {
      /* Звук недоступен — таймер всё равно работает */
    }
  }

  /* ========================================================================
     9. Окно настроек
     ====================================================================== */

  const settingsDialog = $("#settings-dialog");
  const settingsForm = $("#settings-form");
  let draftRole = DEFAULT_ROLE; // роль, выбранная в окне, но ещё не сохранённая

  function openSettings() {
    draftRole = state.settings.role;
    renderSettingsRole();
    settingsDialog.showModal();
  }

  /* Подсвечивает выбранную роль и показывает цели именно для неё */
  function renderSettingsRole() {
    $$("#settings-role button").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.role === draftRole);
    });

    $("#settings-targets").innerHTML = ROLES[draftRole].counters
      .map(([key, name, defaultTarget]) => {
        const savedTarget = state.settings.targets?.[`${draftRole}:${key}`];
        return `
          <label class="dialog__target" for="target-${key}">
            <span>${escapeHtml(name)}</span>
            <input class="input input--number" type="number" min="0" id="target-${key}" data-target="${key}" value="${savedTarget ?? defaultTarget}">
          </label>`;
      })
      .join("");
  }

  $$("#settings-role button").forEach((button) => {
    button.addEventListener("click", () => {
      draftRole = button.dataset.role;
      renderSettingsRole();
    });
  });

  $("#settings-cancel").addEventListener("click", () => settingsDialog.close());

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const targets = { ...(state.settings.targets || {}) };
    $$("[data-target]").forEach((input) => {
      const value = parseInt(input.value, 10);
      if (!Number.isNaN(value))
        targets[`${draftRole}:${input.dataset.target}`] = value;
    });

    state.settings = {
      ...state.settings,
      role: draftRole,
      targets,
    };

    saveSettings();
    settingsDialog.close();
    renderApp();
    showToast("Настройки сохранены");
  });

  /* ========================================================================
     10. Уведомления
     ====================================================================== */

  let toastTimeoutId = null;

  function showToast(message) {
    let toast = $(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast toast--hidden";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.remove("toast--hidden");

    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(
      () => toast.classList.add("toast--hidden"),
      TOAST_DURATION_MS,
    );
  }

  /* ========================================================================
     11. Меню пользователя и выход
     ====================================================================== */

  function closeUserMenu() {
    const list = $("#user-menu-list");
    const button = $(".user-menu__button");
    if (!list || list.hidden) return false;

    list.hidden = true;
    button?.setAttribute("aria-expanded", "false");
    return true;
  }

  function toggleUserMenu(button) {
    const list = $("#user-menu-list");
    if (!list) return;

    list.hidden = !list.hidden;
    button.setAttribute("aria-expanded", String(!list.hidden));
  }

  async function logout() {
    // Отправляем всё, что ещё ждёт отложенного сохранения, и ждём ответа базы:
    // иначе переход на страницу входа оборвёт запросы на полпути
    Object.keys(saveTimers).forEach((date) =>
      saveDay(date, { immediately: true }),
    );
    if (boardTimer) saveBoard({ immediately: true });
    await storage.flush();
    window.Auth.logout();
  }

  /* Клик мимо меню или Escape — закрыть */
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".user-menu")) closeUserMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && closeUserMenu()) {
      $(".user-menu__button")?.focus();
    }
  });

  /* ========================================================================
     12. Запуск
     ====================================================================== */

  async function init() {
    if (!currentUser) return; // нет входа — страница уже перенаправляет на auth.html

    renderApp(); // «Открываю ваш день…», пока читаем хранилище

    storage.clearLegacyData();

    try {
      const [savedSettings, savedDays] = await Promise.all([
        storage.loadSettings(),
        storage.loadDays(),
      ]);

      state.settings = { ...state.settings, ...(savedSettings || {}) };
      delete state.settings.ritual; // остался от прежней версии
      state.days = savedDays.days;
      state.board = savedDays.board;
      state.isLoaded = true;
      carryOverIntoToday();
    } catch (error) {
      // Не рисуем пустой день: сохранение поверх него могло бы создать дубли
      console.error("Ошибка загрузки данных:", error);
      appElement.innerHTML =
        '<p class="page__loading">Не удалось загрузить данные. <button class="button" data-action="reload">Повторить</button></p>';
      return;
    }

    renderApp();
    loadWeather();
  }

  window.addEventListener("resize", applyBoardView);

  /* Вкладка простояла открытой за полночь: при возврате на неё открываем новый «сегодня» */
  let knownToday = getTodayKey();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !state.isLoaded) return;

    const today = getTodayKey();
    if (today === knownToday) return;

    const wasOnToday = state.currentDate === knownToday;
    knownToday = today;
    if (wasOnToday) showDay(today);
  });

  init();
})();