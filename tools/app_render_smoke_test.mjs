import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { TextDecoder, TextEncoder } from "node:util";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "public", "assets", "app.js"), "utf8").replace(/\nboot\(\);\s*$/, "\n");

function makeElement() {
  return {
    hidden: false,
    textContent: "",
    className: "",
    value: "",
    innerHTML: "",
    addEventListener() {},
  };
}

const sandbox = {
  TextDecoder,
  TextEncoder,
  atob(value) {
    return Buffer.from(value, "base64").toString("binary");
  },
  crypto: { subtle: {} },
  document: { querySelector: () => makeElement() },
  fetch() {
    throw new Error("fetch is not used in render smoke tests");
  },
  window: {
    location: { hostname: "localhost", protocol: "http:", hash: "" },
    clearInterval() {},
    setInterval() {},
  },
};

vm.runInNewContext(source, sandbox, { filename: "app.js" });

const rows = sandbox.renderSignalRows(
  [
    {
      stock: "600000.SH",
      stock_name: "浦发银行",
      signal_time: "2026-06-20 10:30:00",
      reason: "60m绿转红",
      industry: "银行",
      industry_color: "#026aa2",
      business: "商业银行与金融服务",
      theme_line: "AI硬件>材料>前驱体/光刻胶 · ALD/CVD前驱体/光刻胶",
      concept_tags: ["光刻胶", "ALD/CVD前驱体", "电子特气"],
      research_summary: "先进制程和存储扩产映射",
      price: 10.5,
      daily_ma: 9.6,
      score: 8.8,
      chart: {
        points: [
          { time: "06-20 09:30", open: 9.8, high: 10.2, low: 9.6, close: 10.0, var1: 9.9, var4: 10.1, ma60: 9.5 },
          { time: "06-20 10:30", open: 10.0, high: 10.7, low: 9.9, close: 10.5, var1: 10.2, var4: 10.0, ma60: 9.6 },
        ],
      },
    },
  ],
  "buy",
);

assert.match(rows, /industry-chip/);
assert.match(rows, /business-line/);
assert.match(rows, /商业银行与金融服务/);
assert.match(rows, /theme-line/);
assert.match(rows, /concept-chip/);
assert.match(rows, /光刻胶/);
assert.match(rows, />60m转红</);
assert.match(rows, /time-date/);
assert.match(rows, /time-clock/);
assert.match(rows, /story/);
assert.match(rows, /trade-cell/);
assert.match(rows, /indicator-grid/);
assert.doesNotMatch(rows, /chart-row|sparkline|K线信号走势/);

const dedupedBoardRows = sandbox.renderSignalRows(
  [
    {
      stock: "300346.SZ",
      stock_name: "南大光电",
      signal_time: "2026-06-18 15:00:00",
      reason: "60m绿转红",
      industry: "半导体",
      business: "板块：半导体; TDX 信息",
      boards_text: "半导体; TDX 信息",
      price: 64.9,
      daily_ma: 52.68,
      score: 23.63,
      chart: { points: [] },
    },
  ],
  "buy",
);
assert.equal(dedupedBoardRows.match(/板块：半导体; TDX 信息/g)?.length, 1);

const sellRows = sandbox.renderSignalRows(
  [
    {
      stock: "300346.SZ",
      stock_name: "南大光电",
      signal_time: "2026-06-18 15:00:00",
      reason: "60m持仓变绿",
      industry: "半导体",
      business: "MO源、电子特气、光刻胶材料",
      theme_line: "AI硬件>材料>前驱体/光刻胶",
      concept_tags: ["光刻胶", "ALD/CVD前驱体"],
      research_summary: "先进制程和存储扩产映射",
      price: 64.9,
      daily_ma: 52.68,
      score: 23.63,
    },
  ],
  "sell",
);
assert.match(sellRows, /trade-cell/);
assert.doesNotMatch(sellRows, /class="story"|theme-line|concept-chip|光刻胶/);
assert.match(sellRows, />60m转绿</);

const sellRowsWithChartMa = sandbox.renderSignalRows(
  [
    {
      stock: "920981.BJ",
      stock_name: "晶赛科技",
      signal_time: "2026-06-18 15:00:00",
      reason: "60m持仓变绿",
      price: 41.26,
      daily_ma: 0,
      score: 0.1,
      chart: { points: [{ ma60: 40.12 }, { ma60: 41.88 }] },
    },
  ],
  "sell",
);
assert.match(sellRowsWithChartMa, /41\.88/);
assert.doesNotMatch(sellRowsWithChartMa, />0\.00</);

const orderedBuyRows = sandbox.renderSignalRows(
  [
    { rank: 1, stock: "OLD-BUY.SZ", signal_time: "2026-06-18 10:30:00", reason: "old", chart: { points: [] } },
    { rank: 2, stock: "NEW-BUY.SZ", signal_time: "2026-06-18 15:00:00", reason: "new", chart: { points: [] } },
  ],
  "buy",
);
assert.ok(orderedBuyRows.indexOf("NEW-BUY.SZ") < orderedBuyRows.indexOf("OLD-BUY.SZ"));

const orderedSellRows = sandbox.renderSignalRows(
  [
    { rank: 1, stock: "OLD-SELL.SZ", signal_time: "2026-06-18 10:30:00", reason: "old" },
    { rank: 2, stock: "NEW-SELL.SZ", signal_time: "2026-06-18 15:00:00", reason: "new" },
  ],
  "sell",
);
assert.ok(orderedSellRows.indexOf("NEW-SELL.SZ") < orderedSellRows.indexOf("OLD-SELL.SZ"));
