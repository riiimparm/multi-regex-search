(function () {
  const MAX_PATTERNS = window.REGEX_MAX_PATTERNS;
  const textarea = document.getElementById("patterns");
  const warningEl = document.getElementById("warning");
  const unavailableEl = document.getElementById("unavailable");
  const resultsEl = document.getElementById("results");

  let tabId = null;
  let hostname = null;
  let debounceTimer = null;

  function parseLines(raw) {
    const allLines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const truncated = allLines.length > MAX_PATTERNS;
    return { patterns: allLines.slice(0, MAX_PATTERNS), truncated };
  }

  function renderResults(patterns, result) {
    resultsEl.innerHTML = "";
    if (!result) return;
    patterns.forEach((pattern, i) => {
      const li = document.createElement("li");

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.backgroundColor = window.REGEX_COLORS[i];

      const patternText = document.createElement("span");
      patternText.className = "pattern-text";
      patternText.textContent = pattern;
      patternText.title = pattern;

      const count = document.createElement("span");
      const hasMatches = !result.errors[i] && result.counts[i] > 0;
      if (result.errors[i]) {
        count.className = "count error";
        count.textContent = "無効な正規表現";
      } else {
        count.className = "count";
        count.textContent = String(result.counts[i]);
      }

      li.append(swatch, patternText, count);

      if (hasMatches) {
        li.classList.add("clickable");
        li.title = `クリックで該当箇所へ移動 (${pattern})`;
        li.addEventListener("click", () => {
          chrome.tabs.sendMessage(tabId, { type: "JUMP_TO_MATCH", idx: i }, (response) => {
            if (chrome.runtime.lastError || !response || response.count === 0) return;
            count.textContent = `${response.index}/${response.count}`;
            clearTimeout(count._resetTimer);
            count._resetTimer = setTimeout(() => {
              count.textContent = String(result.counts[i]);
            }, 1500);
          });
        });
      }

      resultsEl.appendChild(li);
    });
  }

  function sendToContent(patterns) {
    chrome.tabs.sendMessage(tabId, { type: "APPLY_PATTERNS", patterns }, (response) => {
      if (chrome.runtime.lastError) {
        renderResults([], null);
        return;
      }
      renderResults(patterns, response);
    });
  }

  function handleInput() {
    const { patterns, truncated } = parseLines(textarea.value);
    warningEl.hidden = !truncated;
    if (truncated) {
      warningEl.textContent = `最大${MAX_PATTERNS}件までです。${MAX_PATTERNS}件目以降は無視されます。`;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      chrome.storage.local.set({ [hostname]: patterns });
      sendToContent(patterns);
    }, 300);
  }

  function init() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url || !/^https?:\/\//.test(tab.url)) {
        unavailableEl.hidden = false;
        textarea.disabled = true;
        return;
      }

      tabId = tab.id;
      hostname = new URL(tab.url).hostname;

      chrome.storage.local.get([hostname], (stored) => {
        const patterns = Array.isArray(stored[hostname]) ? stored[hostname] : [];
        textarea.value = patterns.join("\n");
        if (patterns.length > 0) {
          sendToContent(patterns);
        }
      });

      textarea.addEventListener("input", handleInput);
    });
  }

  init();
})();
