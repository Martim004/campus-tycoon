import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCTS, STARTING_CASH, buyStock, createNewRun, demandFor, overallResult, parseEuroAmount, setPrice, tradeDay } from "../rules.js";

const byId = (name) => PRODUCTS.find((product) => product.id === name);

test("A1: purchases update cash and stock together and reject unaffordable purchases", () => {
  let run = createNewRun();
  run = buyStock(run, "coffee", 10);
  assert.equal(run.cash, 8_000);
  assert.equal(run.stock.coffee, 10);
  assert.throws(() => buyStock(run, "coffee", 41), /isn’t enough cash/);
  assert.equal(run.cash, 8_000);
  assert.equal(run.stock.toastie, 0);
});

test("A2: reference price and twice-reference boundaries produce 10, 5, 5, and 0 demand", () => {
  const reference = 400;
  assert.deepEqual([400, 401, 800, 801].map((price) => demandFor(price, reference)), [10, 5, 5, 0]);
  assert.equal(parseEuroAmount("0"), null);
  assert.equal(parseEuroAmount("-1"), null);
  assert.equal(parseEuroAmount("4.001"), null);
  assert.equal(parseEuroAmount("4,01"), 401);
});

test("A3: daily revenue, cost of goods sold, profit, cash, and stock reconcile", () => {
  let run = createNewRun();
  run = buyStock(run, "coffee", 10);
  run = setPrice(run, "coffee", byId("coffee").referencePrice);
  run = tradeDay(run);
  const result = run.history[0];
  assert.equal(result.revenue, 4_000);
  assert.equal(result.costOfGoodsSold, 2_000);
  assert.equal(result.grossProfit, 2_000);
  assert.equal(run.cash, 12_000);
  assert.equal(run.stock.coffee, 0);
});

test("A4: sales are limited by stock, including zero stock", () => {
  let run = createNewRun();
  run = buyStock(run, "coffee", 3);
  run = tradeDay(run);
  assert.equal(run.history[0].items.find((item) => item.productId === "coffee").sold, 3);
  assert.equal(run.stock.coffee, 0);
  run = tradeDay(run);
  assert.equal(run.history[1].items.find((item) => item.productId === "coffee").sold, 0);
  assert.ok(Object.values(run.stock).every((quantity) => quantity >= 0));
});

test("A5: recorded days cannot replay and saved state contains a single completed-day record", () => {
  let run = buyStock(createNewRun(), "coffee", 10);
  run = tradeDay(run);
  const serialized = JSON.stringify(run);
  assert.equal(JSON.parse(serialized).history.length, 1);
  assert.throws(() => tradeDay({ ...run, currentDay: 1 }), /already been recorded/);
  assert.equal(JSON.parse(serialized).cash, run.cash);
  assert.equal(JSON.parse(serialized).stock.coffee, run.stock.coffee);
});

test("A6: trading and buying stop after day five and a new run resets all balances and history", () => {
  let run = createNewRun();
  for (let day = 0; day < 5; day += 1) run = tradeDay(run);
  assert.equal(run.currentDay, 6);
  assert.equal(run.history.length, 5);
  assert.throws(() => tradeDay(run), /run is complete/);
  assert.throws(() => buyStock(run, "coffee", 1), /run is complete/);
  const restarted = createNewRun();
  assert.equal(restarted.cash, STARTING_CASH);
  assert.equal(restarted.currentDay, 1);
  assert.deepEqual(Object.values(restarted.stock), [0, 0, 0]);
  assert.deepEqual(restarted.history, []);
});

test("overall gain includes remaining stock at cost, without deducting purchases twice", () => {
  let run = buyStock(createNewRun(), "coffee", 2);
  run = tradeDay(run);
  assert.equal(overallResult(run), 400);
});
