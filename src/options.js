(function () {
  const currentShortcutEl = document.getElementById("current-shortcut");
  const openShortcutsBtn = document.getElementById("open-shortcuts");

  chrome.commands.getAll((commands) => {
    const cmd = commands.find((c) => c.name === "_execute_action");
    currentShortcutEl.textContent = cmd && cmd.shortcut ? cmd.shortcut : "未設定";
  });

  openShortcutsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
})();
