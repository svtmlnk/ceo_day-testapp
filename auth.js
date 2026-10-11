/* ==========================================================================
   День коммерсанта — страница входа и регистрации
   Логика проверки и хранения данных — в auth-store.js (window.Auth)
   ========================================================================== */

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const MODES = {
    login: {
      title: "С возвращением",
      subtitle: "Войдите, чтобы открыть свой день",
      submit: "Войти",
      passwordAutocomplete: "current-password",
    },
    register: {
      title: "Создайте аккаунт",
      subtitle: "Это займёт меньше минуты",
      submit: "Зарегистрироваться",
      passwordAutocomplete: "new-password",
    },
  };

  const form = $("#auth-form");
  const errorElement = $("#auth-error");
  const submitButton = $("#auth-submit");
  const nicknameField = $("#auth-nickname-field");
  const inputs = {
    nickname: $("#auth-nickname"),
    email: $("#auth-email"),
    password: $("#auth-password"),
  };

  let mode = "login";

  function showError(message) {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function setMode(nextMode) {
    mode = nextMode;
    const config = MODES[mode];

    $$("#auth-mode button").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.mode === mode);
    });

    $("#auth-title").textContent = config.title;
    $("#auth-subtitle").textContent = config.subtitle;
    submitButton.textContent = config.submit;

    nicknameField.hidden = mode !== "register";
    inputs.nickname.disabled = mode !== "register";
    inputs.password.autocomplete = config.passwordAutocomplete;

    showError("");
  }

  $$("#auth-mode button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");
    submitButton.disabled = true;

    const credentials = {
      nickname: inputs.nickname.value,
      email: inputs.email.value,
      password: inputs.password.value,
    };

    try {
      const result =
        mode === "login"
          ? await window.Auth.login(credentials)
          : await window.Auth.register(credentials);

      if (result.ok) {
        window.location.replace(window.Auth.APP_PAGE);
        return;
      }

      showError(result.error);
      inputs[result.field]?.focus();
    } catch (error) {
      showError("Что-то пошло не так. Попробуйте ещё раз");
    }

    submitButton.disabled = false;
  });

  setMode("login");
})();
