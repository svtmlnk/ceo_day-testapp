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
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
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
     в fulldata как JSON.
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
      rows.forEach((row) => {
        taskRowIds[row.date] = row.id;

        let saved = null;
        try {
          saved = JSON.parse(row.fulldata);
        } catch (parseError) {
          /* битая запись — покажем пустой день, при сохранении она перезапишется */
        }
        const day = { ...createEmptyDay(row.date), ...(saved || {}), date: row.date };
        day.plan = normalizePlan(day.plan);
        days[row.date] = day;
      });
      return days;
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
            const { error } = await db().from(TASKS_TABLE).delete().eq("id", rowId);
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
    settings: { role: DEFAULT_ROLE, targets: {} },
    days: {}, // { "ГГГГ-ММ-ДД": day }
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
    const saved = state.settings.targets?.[`${state.settings.role}:${counterKey}`];
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

  /* Не теряем введённое, если вкладку закрыли раньше срока задержки */
  window.addEventListener("pagehide", () => {
    Object.keys(saveTimers).forEach((date) =>
      saveDay(date, { immediately: true }),
    );
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
      appElement.innerHTML =
        '<p class="page__loading">Открываю ваш день…</p>';
      return;
    }

    const day = getDay();

    appElement.innerHTML = [
      renderHeader(day),
      renderWeek(),
      renderMorning(day),
      renderTasks(day),
      `<div class="grid grid--two">${renderFocus(day)}${renderTouches(day)}</div>`,
      renderEvening(day),
      renderFooter(),
    ].join("");

    renderTimer();
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
    const counters = getRole().counters.map((counter) => renderCounter(counter, day));

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
      progressElement.setAttribute("stroke-dashoffset", RING_LENGTH * (1 - score / 100));
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
      if (counter) counter.textContent = `${countPlanTasks(day.plan)}/${MAX_PLAN_TASKS}`;
    },
    improvement: (day, el) => (day.improvement = el.value),
    win: (day, el, index) => (day.wins[index] = el.value),
    "task-text": (day, el, index) => (day.tasks[index].text = el.value),
  };

  /* Переключатели: сохраняем сразу и перерисовываем */
  const CHANGE_HANDLERS = {
    "plan-done": (day, el, index) => (getPlanTask(day, index).done = el.checked),
    "task-done": (day, el, index) => (day.tasks[index].done = el.checked),
  };

  appElement.addEventListener("input", (event) => {
    const el = event.target;
    const handler = INPUT_HANDLERS[el.dataset.field];
    if (!handler) return;

    handler(getDay(), el, Number(el.dataset.index));
    saveDay();
    refreshScore();
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
      input.value.slice(0, input.selectionStart) + pasted + input.value.slice(input.selectionEnd);
    const texts = merged.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!texts.length) return;

    const room = MAX_PLAN_TASKS - (day.plan.length - 1);
    if (texts.length > room) showToast(`Не больше ${MAX_PLAN_TASKS} задач`);
    const added = texts.slice(0, Math.max(1, room));

    const [first, ...rest] = added;
    task.text = first;
    day.plan.splice(index + 1, 0, ...rest.map((text) => ({ text, done: false })));
    saveDay();
    focusPlanTask(index + added.length - 1);
  });

  /* Нажатия на кнопки: действие определяется по data-action */
  const CLICK_ACTIONS = {
    "shift-day": (button) => {
      state.currentDate = shiftDate(state.currentDate, Number(button.dataset.offset));
      renderApp();
    },

    "go-today": () => {
      state.currentDate = getTodayKey();
      renderApp();
    },

    "select-day": (button) => {
      state.currentDate = button.dataset.date;
      renderApp();
    },

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

  /** Переносит незавершённые задачи на следующий день */
  function carryOverUnfinishedTasks() {
    const day = getDay();
    const nextDate = shiftDate(state.currentDate, 1);
    const nextDay = getDay(nextDate);

    const unfinished = (list) =>
      list.filter((task) => task.text.trim() && !task.done).map((task) => task.text.trim());

    // «Мои задачи на сегодня» → в план следующего дня (в пределах лимита)
    const planThere = new Set(nextDay.plan.map((task) => task.text.trim()));
    const planRoom = Math.max(0, MAX_PLAN_TASKS - nextDay.plan.length);
    const planCandidates = unfinished(day.plan).filter((text) => !planThere.has(text));
    const planToCarry = planCandidates.slice(0, planRoom);

    // «Остальное» → в «Остальное» следующего дня
    const tasksThere = new Set(nextDay.tasks.map((task) => task.text));
    const tasksToCarry = unfinished(day.tasks).filter((text) => !tasksThere.has(text));

    const total = planToCarry.length + tasksToCarry.length;
    if (!total) {
      showToast(
        planCandidates.length ? `Не больше ${MAX_PLAN_TASKS} задач на день` : "Всё закрыто — переносить нечего",
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
    timer.secondsLeft = Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));

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
      if (!Number.isNaN(value)) targets[`${draftRole}:${input.dataset.target}`] = value;
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
      state.days = savedDays;
      state.isLoaded = true;
    } catch (error) {
      // Не рисуем пустой день: сохранение поверх него могло бы создать дубли
      console.error("Ошибка загрузки данных:", error);
      appElement.innerHTML =
        '<p class="page__loading">Не удалось загрузить данные. <button class="button" data-action="reload">Повторить</button></p>';
      return;
    }

    renderApp();
  }

  init();
})();