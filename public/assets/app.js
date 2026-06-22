const DATA_URL = "data/latest.enc.json";
const MOCK_DATA_URL = "mock/latest.enc.json";
const REFRESH_INTERVAL_MS = 60000;

const state = {
  authenticated: false,
  password: "",
  mockMode: false,
  latest: null,
  refreshTimer: null,
  buyView: "realtime",
};

const els = {
  subtitle: document.querySelector("#subtitle"),
  statusPill: document.querySelector("#statusPill"),
  refreshButton: document.querySelector("#refreshButton"),
  logoutButton: document.querySelector("#logoutButton"),
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  passwordInput: document.querySelector("#passwordInput"),
  loginError: document.querySelector("#loginError"),
  dashboardPanel: document.querySelector("#dashboardPanel"),
  buyCount: document.querySelector("#buyCount"),
  sellCount: document.querySelector("#sellCount"),
  holdingCount: document.querySelector("#holdingCount"),
  latestSignal: document.querySelector("#latestSignal"),
  buyMeta: document.querySelector("#buyMeta"),
  buyRealtimeTab: document.querySelector("#buyRealtimeTab"),
  buyFixedTab: document.querySelector("#buyFixedTab"),
  sellMeta: document.querySelector("#sellMeta"),
  holdingsMeta: document.querySelector("#holdingsMeta"),
  buyTable: document.querySelector("#buyTable"),
  sellTable: document.querySelector("#sellTable"),
  holdingsList: document.querySelector("#holdingsList"),
};

const localMockAllowed = ["localhost", "127.0.0.1"].includes(window.location.hostname) || window.location.protocol === "file:";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function setStatus(text, kind = "") {
  els.statusPill.textContent = text;
  els.statusPill.className = `status-pill ${kind}`.trim();
}

function showLogin(message = "") {
  state.authenticated = false;
  state.password = "";
  els.loginPanel.hidden = false;
  els.dashboardPanel.hidden = true;
  els.logoutButton.hidden = true;
  els.refreshButton.hidden = true;
  els.subtitle.textContent = "输入密码后在浏览器本地解密";
  els.loginError.textContent = message;
  setStatus("未解密");
}

function showDashboard() {
  state.authenticated = true;
  els.loginPanel.hidden = true;
  els.dashboardPanel.hidden = false;
  els.logoutButton.hidden = false;
  els.refreshButton.hidden = false;
}

function base64UrlToBytes(value) {
  const base64 = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decryptEnvelope(envelope, password) {
  if (!envelope || envelope.version !== 1 || envelope.alg !== "AES-GCM" || envelope.kdf !== "PBKDF2-SHA256") {
    throw new Error("加密数据格式不支持");
  }

  const salt = base64UrlToBytes(envelope.salt);
  const iv = base64UrlToBytes(envelope.iv);
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  const iterations = Number(envelope.iterations || 250000);
  const key = await deriveKey(password, salt, iterations);

  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch {
    throw new Error("密码不正确，或加密数据已损坏");
  }
  return JSON.parse(textDecoder.decode(plaintext));
}

async function requestJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function loadEncryptedEnvelope() {
  try {
    state.mockMode = false;
    return await requestJson(DATA_URL);
  } catch (error) {
    if (localMockAllowed) {
      state.mockMode = true;
      return requestJson(MOCK_DATA_URL);
    }
    throw new Error(error.message === "HTTP 404" ? "未找到加密数据文件" : error.message);
  }
}

async function loadLatest(password) {
  const envelope = await loadEncryptedEnvelope();
  const payload = await decryptEnvelope(envelope, password);
  state.latest = payload;
  renderDashboard(payload);
}

function compactTime(value) {
  if (!value) return "-";
  const text = String(value);
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return text;
  return `${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
}

function displayNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toFixed(2);
}

function latestChartMa60(item) {
  const points = Array.isArray(item?.chart?.points) ? item.chart.points : [];
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = Number(points[index]?.ma60);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function displayMa60(item) {
  const dailyMa = Number(item?.daily_ma);
  if (Number.isFinite(dailyMa) && dailyMa > 0) return displayNumber(dailyMa);
  return displayNumber(latestChartMa60(item));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function newestSignalTime(items) {
  return items
    .map((item) => item.signal_time)
    .filter(Boolean)
    .sort()
    .at(-1) || "-";
}

function signalSortTime(item) {
  return String(item?.signal_time || item?.scan_time || "");
}

function signalSortRank(item, fallbackIndex) {
  const rank = Number(item?.rank);
  return Number.isFinite(rank) ? rank : fallbackIndex + 1;
}

function newestSignalsFirst(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const timeOrder = signalSortTime(right.item).localeCompare(signalSortTime(left.item));
      if (timeOrder !== 0) return timeOrder;

      const rankOrder = signalSortRank(left.item, left.index) - signalSortRank(right.item, right.index);
      if (rankOrder !== 0) return rankOrder;

      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

function isRealtimeAlert(item) {
  const reason = String(item?.reason || "").trim();
  return item?.is_realtime === true || reason.includes("实时");
}

function splitBuyAlerts(items) {
  const realtime = [];
  const fixed = [];
  for (const item of items || []) {
    if (isRealtimeAlert(item)) {
      realtime.push(item);
    } else {
      fixed.push(item);
    }
  }
  return { realtime, fixed };
}

function activeBuyAlerts(split) {
  return state.buyView === "fixed" ? split.fixed : split.realtime;
}

function updateBuyTabs(split) {
  const realtimeActive = state.buyView === "realtime";
  const fixedActive = state.buyView === "fixed";
  els.buyRealtimeTab.textContent = `实时检测 ${split.realtime.length}`;
  els.buyFixedTab.textContent = `固定时间 ${split.fixed.length}`;
  els.buyRealtimeTab.className = `signal-tab realtime${realtimeActive ? " active" : ""}`;
  els.buyFixedTab.className = `signal-tab fixed${fixedActive ? " active" : ""}`;
  els.buyRealtimeTab.setAttribute("aria-pressed", String(realtimeActive));
  els.buyFixedTab.setAttribute("aria-pressed", String(fixedActive));
}

const INDUSTRY_COLORS = [
  "#b42318",
  "#026aa2",
  "#087443",
  "#854a0e",
  "#6941c6",
  "#c11574",
  "#0e7090",
  "#4e5ba6",
  "#b54708",
  "#3f621a",
  "#175cd3",
  "#5925dc",
];

function sanitizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "";
}

function hashText(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function industryColor(industry) {
  const text = String(industry || "").trim();
  if (!text) return "#667085";
  return INDUSTRY_COLORS[hashText(text) % INDUSTRY_COLORS.length];
}

function compactSignalLabel(item, type) {
  const signalType = String(item.signal_type || "").toLowerCase();
  const reason = String(item.reason || item.signal_type || "").trim();
  const period = String(item.period || "60m").trim();
  const realtime = item.is_realtime || reason.includes("实时") ? "实时" : "";
  if (type === "buy" || signalType.includes("turn_red") || reason.includes("转红")) {
    return `${period}${realtime}转红`;
  }
  if (type === "sell" || signalType.includes("turn_green") || reason.includes("转绿") || reason.includes("变绿")) {
    return `${period}${realtime}转绿`;
  }
  return reason || "-";
}

function renderStockCell(item) {
  const stock = escapeHtml(item.stock || "");
  const stockName = escapeHtml(item.stock_name || item.stock || "");
  const rawIndustry = String(item.industry || (Array.isArray(item.boards) ? item.boards[0] : "") || "").trim();
  const industry = escapeHtml(rawIndustry);
  const color = sanitizeColor(item.industry_color) || industryColor(rawIndustry);
  const industryChip = industry
    ? `<span class="industry-chip" style="--industry-color: ${color};">${industry}</span>`
    : "";
  return `<td class="stock"><span class="stock-code">${stock}</span><span class="stock-name">${stockName}</span>${industryChip}</td>`;
}

function renderStoryCell(item) {
  const boards = Array.isArray(item.boards) ? item.boards.filter(Boolean).join(" / ") : "";
  const boardsText = String(item.boards_text || boards || "").trim();
  const rawBusiness = String(item.business || item.main_business || "").trim();
  const businessWithoutBoardPrefix = rawBusiness.replace(/^板块[:：]\s*/, "").trim();
  const displayBusiness = boardsText && businessWithoutBoardPrefix === boardsText ? "" : rawBusiness;
  const visibleBusiness = escapeHtml(displayBusiness);
  const rawThemeLine = String(item.theme_line || item.research_theme || item.concept_line || "").trim();
  const themeLine = escapeHtml(rawThemeLine);
  const rawSummary = String(item.research_summary || item.catalyst || "").trim();
  const summary = escapeHtml(rawSummary);
  const conceptTags = Array.isArray(item.concept_tags) ? item.concept_tags.filter(Boolean).slice(0, 5) : [];
  const themeLineHtml = themeLine
    ? `<span class="theme-line" title="${escapeHtml(rawSummary || rawThemeLine)}">${themeLine}</span>`
    : "";
  const conceptRow = conceptTags.length
    ? `<span class="concept-row">${conceptTags.map((tag) => `<span class="concept-chip">${escapeHtml(tag)}</span>`).join("")}</span>`
    : "";
  const summaryLine = summary && summary !== themeLine
    ? `<span class="research-summary" title="${summary}">${summary}</span>`
    : "";
  const businessLine = visibleBusiness
    ? `<span class="business-line" title="${visibleBusiness}">${visibleBusiness}</span>`
    : "";
  const boardsLine = boardsText
    ? `<span class="boards-line" title="${escapeHtml(boardsText)}">板块：${escapeHtml(boardsText)}</span>`
    : "";
  return `<td class="story">${themeLineHtml}${conceptRow}${summaryLine}${businessLine}${boardsLine}</td>`;
}

function renderTimeCell(value) {
  const raw = String(value || "");
  const compact = compactTime(raw);
  const parts = compact.split(/\s+/).filter(Boolean);
  const date = parts[0] || compact;
  const clock = parts[1] || "";
  return `<td class="time" title="${escapeHtml(raw)}"><span class="time-date">${escapeHtml(date)}</span><span class="time-clock">${escapeHtml(clock)}</span></td>`;
}

function renderTradeCell(item, type) {
  const reason = escapeHtml(item.reason || item.signal_type || "");
  const signalLabel = escapeHtml(compactSignalLabel(item, type));
  const metrics = [
    ["现价", displayNumber(item.price)],
    ["MA60", displayMa60(item)],
    ["得分", displayNumber(item.score)],
  ].filter((entry) => entry[1]);
  const indicators = metrics.map(([label, value]) => `
    <span class="indicator">
      <span class="indicator-label">${escapeHtml(label)}</span>
      <span class="indicator-value">${escapeHtml(value)}</span>
    </span>
  `).join("");
  return `
    <td class="trade-cell">
      <div class="trade-stack">
        <span class="tag signal-chip" title="${reason}">${signalLabel}</span>
        <span class="indicator-grid">${indicators}</span>
      </div>
    </td>
  `;
}

function renderSignalRows(items, type) {
  if (!items.length) {
    const colspan = type === "buy" ? 5 : 3;
    return `<tr><td class="empty-cell" colspan="${colspan}">暂无信号</td></tr>`;
  }

  return newestSignalsFirst(items).map((item, index) => {
    const timeCell = renderTimeCell(item.signal_time);
    const stockCell = renderStockCell(item);
    const tradeCell = renderTradeCell(item, type);

    if (type === "sell") {
      return `
        <tr>
          ${timeCell}
          ${stockCell}
          ${tradeCell}
        </tr>
      `;
    }

    const storyCell = renderStoryCell(item);
    return `
      <tr>
        <td class="rank">${escapeHtml(item.rank || index + 1)}</td>
        ${timeCell}
        ${stockCell}
        ${storyCell}
        ${tradeCell}
      </tr>
    `;
  }).join("");
}

function renderHoldings(codes) {
  if (!codes.length) {
    return '<span class="holding-chip">暂无持仓</span>';
  }
  return codes.map((code) => `<span class="holding-chip">${escapeHtml(code)}</span>`).join("");
}

function renderDashboard(payload) {
  state.latest = payload;
  const metadata = payload.metadata || {};
  const buyAlerts = payload.buy_alerts || payload.alerts || [];
  const buySplit = splitBuyAlerts(buyAlerts);
  const visibleBuyAlerts = activeBuyAlerts(buySplit);
  const sellAlerts = payload.sell_alerts || [];
  const holdingCodes = payload.holding_codes || [];
  const latestTime = newestSignalTime([...buyAlerts, ...sellAlerts]);
  const generatedAt = metadata.generated_at || metadata.encrypted_at || "-";
  const period = metadata.period || "60m";
  const buyViewLabel = state.buyView === "fixed" ? "固定时间" : "实时检测";

  els.buyCount.textContent = String(buyAlerts.length);
  els.sellCount.textContent = String(sellAlerts.length);
  els.holdingCount.textContent = String(holdingCodes.length);
  els.latestSignal.textContent = compactTime(latestTime);
  updateBuyTabs(buySplit);
  els.buyMeta.textContent = `${buyViewLabel} ${visibleBuyAlerts.length} 条 · ${period} · ${metadata.sector || "QMTREP"}`;
  els.sellMeta.textContent = `${sellAlerts.length} 条`;
  els.holdingsMeta.textContent = `${holdingCodes.length} 只`;
  els.buyTable.innerHTML = renderSignalRows(visibleBuyAlerts, "buy");
  els.sellTable.innerHTML = renderSignalRows(sellAlerts, "sell");
  els.holdingsList.innerHTML = renderHoldings(holdingCodes);
  els.subtitle.textContent = `生成时间 ${generatedAt}${state.mockMode ? " · 本地预览" : ""}`;
  setStatus(state.mockMode ? "本地预览" : "已解密", "ok");
}

function setBuyView(view) {
  if (view !== "realtime" && view !== "fixed") {
    return;
  }
  state.buyView = view;
  if (state.latest) {
    renderDashboard(state.latest);
  }
}

function startRefreshLoop() {
  window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(async () => {
    if (!state.authenticated || !state.password) {
      return;
    }
    try {
      await loadLatest(state.password);
    } catch (error) {
      setStatus("刷新失败", "error");
      els.subtitle.textContent = error.message;
    }
  }, REFRESH_INTERVAL_MS);
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = els.passwordInput.value;
  if (!password) {
    showLogin("请输入访问密码");
    return;
  }

  els.loginError.textContent = "";
  setStatus("解密中");

  try {
    await loadLatest(password);
    state.password = password;
    els.passwordInput.value = "";
    showDashboard();
    startRefreshLoop();
  } catch (error) {
    showLogin(error.message || "解密失败");
  }
});

els.logoutButton.addEventListener("click", () => {
  window.clearInterval(state.refreshTimer);
  showLogin();
});

els.refreshButton.addEventListener("click", async () => {
  if (!state.authenticated || !state.password) {
    return;
  }
  setStatus("刷新中");
  try {
    await loadLatest(state.password);
  } catch (error) {
    setStatus("刷新失败", "error");
    els.subtitle.textContent = error.message;
  }
});

els.buyRealtimeTab.addEventListener("click", () => setBuyView("realtime"));
els.buyFixedTab.addEventListener("click", () => setBuyView("fixed"));

async function boot() {
  if (localMockAllowed && window.location.hash === "#demo") {
    try {
      await loadLatest("demo-password");
      state.password = "demo-password";
      showDashboard();
      startRefreshLoop();
      return;
    } catch {
      // Fall back to the normal password form if the local demo file is missing.
    }
  }
  showLogin();
}

boot();
