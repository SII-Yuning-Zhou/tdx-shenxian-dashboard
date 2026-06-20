const DATA_URL = "data/latest.enc.json";
const MOCK_DATA_URL = "mock/latest.enc.json";
const REFRESH_INTERVAL_MS = 60000;

const state = {
  authenticated: false,
  password: "",
  mockMode: false,
  latest: null,
  refreshTimer: null,
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

function createSparkline(chart) {
  const points = Array.isArray(chart?.points) ? chart.points.slice(-42) : [];
  if (points.length < 2) return "";

  const width = 820;
  const height = 92;
  const pad = 12;
  const keys = ["close", "var1", "var4", "ma60"];
  const values = points.flatMap((point) => keys.map((key) => Number(point[key]))).filter(Number.isFinite);
  if (!values.length) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index) => pad + (index * (width - pad * 2)) / (points.length - 1);
  const y = (value) => height - pad - ((Number(value) - min) * (height - pad * 2)) / span;
  const line = (key) => points.map((point, index) => `${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");

  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="信号走势">
      <polyline points="${line("close")}" fill="none" stroke="#f8fafc" stroke-width="1.6" vector-effect="non-scaling-stroke" />
      <polyline points="${line("var1")}" fill="none" stroke="#ef4444" stroke-width="1.4" vector-effect="non-scaling-stroke" />
      <polyline points="${line("var4")}" fill="none" stroke="#22c55e" stroke-width="1.2" vector-effect="non-scaling-stroke" />
      <polyline points="${line("ma60")}" fill="none" stroke="#60a5fa" stroke-width="1.2" vector-effect="non-scaling-stroke" />
      <text x="12" y="17">close / VAR1 / VAR4 / MA60</text>
    </svg>
  `;
}

function renderSignalRows(items, type) {
  if (!items.length) {
    const colspan = type === "buy" ? 7 : 4;
    return `<tr><td class="empty-cell" colspan="${colspan}">暂无信号</td></tr>`;
  }

  return items.map((item, index) => {
    const stock = escapeHtml(item.stock || "");
    const stockName = escapeHtml(item.stock_name || item.stock || "");
    const reason = escapeHtml(item.reason || item.signal_type || "");

    if (type === "sell") {
      return `
        <tr>
          <td class="time" title="${escapeHtml(item.signal_time || "")}">${escapeHtml(compactTime(item.signal_time))}</td>
          <td class="stock"><span class="stock-code">${stock}</span><span class="stock-name">${stockName}</span></td>
          <td class="reason"><span class="tag">${reason}</span></td>
          <td class="num strong">${escapeHtml(displayNumber(item.score))}</td>
        </tr>
      `;
    }

    const chart = createSparkline(item.chart);
    return `
      <tr>
        <td class="rank">${escapeHtml(item.rank || index + 1)}</td>
        <td class="time" title="${escapeHtml(item.signal_time || "")}">${escapeHtml(compactTime(item.signal_time))}</td>
        <td class="stock"><span class="stock-code">${stock}</span><span class="stock-name">${stockName}</span></td>
        <td class="reason"><span class="tag">${reason}</span></td>
        <td class="num">${escapeHtml(displayNumber(item.price))}</td>
        <td class="num">${escapeHtml(displayNumber(item.daily_ma))}</td>
        <td class="num strong">${escapeHtml(displayNumber(item.score))}</td>
      </tr>
      ${chart ? `<tr class="chart-row"><td colspan="7">${chart}</td></tr>` : ""}
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
  const metadata = payload.metadata || {};
  const buyAlerts = payload.buy_alerts || payload.alerts || [];
  const sellAlerts = payload.sell_alerts || [];
  const holdingCodes = payload.holding_codes || [];
  const latestTime = newestSignalTime([...buyAlerts, ...sellAlerts]);
  const generatedAt = metadata.generated_at || metadata.encrypted_at || "-";
  const period = metadata.period || "60m";

  els.buyCount.textContent = String(buyAlerts.length);
  els.sellCount.textContent = String(sellAlerts.length);
  els.holdingCount.textContent = String(holdingCodes.length);
  els.latestSignal.textContent = compactTime(latestTime);
  els.buyMeta.textContent = `${period} · ${metadata.sector || "QMTREP"}`;
  els.sellMeta.textContent = `${sellAlerts.length} 条`;
  els.holdingsMeta.textContent = `${holdingCodes.length} 只`;
  els.buyTable.innerHTML = renderSignalRows(buyAlerts, "buy");
  els.sellTable.innerHTML = renderSignalRows(sellAlerts, "sell");
  els.holdingsList.innerHTML = renderHoldings(holdingCodes);
  els.subtitle.textContent = `生成时间 ${generatedAt}${state.mockMode ? " · 本地预览" : ""}`;
  setStatus(state.mockMode ? "本地预览" : "已解密", "ok");
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
