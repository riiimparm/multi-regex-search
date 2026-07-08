// 複数正規表現ハイライトのcontent script。
// popupからのメッセージでハイライトを再適用し、行ごとのヒット件数を返す。
(function () {
  const HIGHLIGHT_CLASS = "ext-regex-hl";
  const FLASH_CLASS = "ext-regex-hl-flash";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);

  // ジャンプ機能: 直近のapplyPatternsで生成されたスパンをindexごとに保持し、
  // クリックのたびに次の出現箇所へ巡回する。
  let spansByIdx = [];
  let jumpCursor = {};

  function ensureFlashStyle() {
    if (document.getElementById("ext-regex-hl-style")) return;
    const style = document.createElement("style");
    style.id = "ext-regex-hl-style";
    style.textContent = `.${FLASH_CLASS} { outline: 2px solid #ff2d55; outline-offset: 1px; }`;
    document.head.appendChild(style);
  }

  function clearHighlights() {
    document.querySelectorAll(`span.${HIGHLIGHT_CLASS}`).forEach((span) => {
      span.replaceWith(document.createTextNode(span.textContent));
    });
    document.body.normalize();
  }

  // display:noneやvisibility:hiddenは祖先要素・メディアクエリ・[hidden]属性など
  // 手段が多岐にわたるため、ブラウザネイティブのcheckVisibility()に判定を委ねる
  // （祖先チェーン全体を含めて正しく解決してくれる）。
  function isVisible(el, cache) {
    if (cache.has(el)) return cache.get(el);
    let visible;
    if (typeof el.checkVisibility === "function") {
      visible = el.checkVisibility({ checkVisibilityCSS: true });
    } else {
      const style = window.getComputedStyle(el);
      visible = style.display !== "none" && style.visibility !== "hidden";
    }

    // checkVisibilityCSSはvisibility:collapseまでは拾わないため個別に確認
    if (visible && window.getComputedStyle(el).visibility === "collapse") {
      visible = false;
    }

    // sr-only等「1px×1pxに潰してoverflow:hiddenでクリップする」スクリーンリーダー用
    // 視覚的非表示テクニックはdisplay/visibilityでは検出できないため、実際の描画サイズで判定する。
    if (visible) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 && rect.height <= 1) visible = false;
    }

    cache.set(el, visible);
    return visible;
  }

  function collectTextNodes() {
    const nodes = [];
    const visibilityCache = new WeakMap();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`.${HIGHLIGHT_CLASS}`)) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent, visibilityCache)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function compilePatterns(patterns) {
    const errors = new Array(patterns.length).fill(false);
    const regexes = patterns.map((pattern, i) => {
      try {
        return new RegExp(pattern, "g");
      } catch (e) {
        errors[i] = true;
        return null;
      }
    });
    return { regexes, errors };
  }

  function highlightTextNode(node, regexes, counts) {
    const text = node.nodeValue;
    const taken = [];

    regexes.forEach((regex, idx) => {
      if (!regex) return;
      regex.lastIndex = 0;
      for (const m of text.matchAll(regex)) {
        if (m[0].length === 0) continue;
        const start = m.index;
        const end = start + m[0].length;
        const overlaps = taken.some(([ts, te]) => start < te && end > ts);
        if (overlaps) continue;
        taken.push([start, end, idx]);
        counts[idx]++;
      }
    });

    if (taken.length === 0) return;

    taken.sort((a, b) => a[0] - b[0]);
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const [start, end, idx] of taken) {
      if (start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
      const span = document.createElement("span");
      span.className = HIGHLIGHT_CLASS;
      span.dataset.regexIdx = String(idx);
      span.style.backgroundColor = window.REGEX_COLORS[idx];
      span.textContent = text.slice(start, end);
      fragment.appendChild(span);
      spansByIdx[idx].push(span);
      cursor = end;
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  }

  function applyPatterns(patterns) {
    ensureFlashStyle();
    clearHighlights();
    const { regexes, errors } = compilePatterns(patterns);
    const counts = new Array(patterns.length).fill(0);
    spansByIdx = patterns.map(() => []);
    jumpCursor = {};
    if (regexes.some(Boolean)) {
      const nodes = collectTextNodes();
      for (const node of nodes) highlightTextNode(node, regexes, counts);
    }
    return { counts, errors };
  }

  function jumpToMatch(idx) {
    const spans = spansByIdx[idx] || [];
    if (spans.length === 0) return { count: 0, index: 0 };
    const cur = ((jumpCursor[idx] ?? -1) + 1) % spans.length;
    jumpCursor[idx] = cur;
    const span = spans[cur];
    span.scrollIntoView({ behavior: "smooth", block: "center" });
    span.classList.add(FLASH_CLASS);
    setTimeout(() => span.classList.remove(FLASH_CLASS), 1000);
    return { count: spans.length, index: cur + 1 };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "APPLY_PATTERNS") {
      const result = applyPatterns(message.patterns || []);
      sendResponse(result);
    } else if (message && message.type === "JUMP_TO_MATCH") {
      sendResponse(jumpToMatch(message.idx));
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const key = location.hostname;
    if (changes[key]) {
      applyPatterns(changes[key].newValue || []);
    }
  });

  chrome.storage.local.get([location.hostname], (result) => {
    const patterns = result[location.hostname];
    if (Array.isArray(patterns) && patterns.length > 0) {
      applyPatterns(patterns);
    }
  });
})();
