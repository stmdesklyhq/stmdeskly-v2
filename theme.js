(function () {
  const STORAGE_KEY = "stmDeskly-theme";
  const root = document.documentElement;

  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    const selectedTheme = theme === "dark" ? "dark" : "light";

    root.dataset.theme = selectedTheme;
    root.style.colorScheme = selectedTheme;

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute(
        "aria-label",
        selectedTheme === "dark"
          ? "Switch to light theme"
          : "Switch to dark theme"
      );

      button.setAttribute("aria-pressed", String(selectedTheme === "dark"));

      const lightIcon = button.querySelector('[data-theme-icon="light"]');
      const darkIcon = button.querySelector('[data-theme-icon="dark"]');

      if (lightIcon) lightIcon.hidden = selectedTheme === "dark";
      if (darkIcon) darkIcon.hidden = selectedTheme !== "dark";
    });
  }

  const savedTheme = getSavedTheme();
  const systemPrefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  applyTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;

    const nextTheme =
      root.dataset.theme === "dark" ? "light" : "dark";

    applyTheme(nextTheme);

    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Theme switching still works if storage is unavailable.
    }
  });
})();