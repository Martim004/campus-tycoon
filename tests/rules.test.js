import test from "node:test";
import assert from "node:assert/strict";
import { CAMPUS_EVENTS, PRODUCTS, STARTING_CASH, buyStock, campusEventFor, createNewRun, demandFor, migrateRun, overallResult, parseEuroAmount, previewProduct, setPrice, tradeDay } from "../rules.js";

const byId = (name) => PRODUCTS.find((product) => product.id === name);

test("A1: the menu is a sports nutrition range with positive fixed euro costs and references", () => {
  assert.deepEqual(PRODUCTS.map(({ name }) => name), ["Protein shake", "Energy bar", "Reusable shaker"]);
  assert.ok(PRODUCTS.every(({ unitCost, referencePrice }) => unitCost > 0 && referencePrice > 0));
});

test("A2: purchases update cash and stock together and reject unaffordable purchases", () => {
  let run = createNewRun();
  run = buyStock(run, "shake", 10);
  assert.equal(run.cash, STARTING_CASH - 2_500);
  assert.equal(run.stock.shake, 10);
  assert.throws(() => buyStock(run, "shake", 31), /isn’t enough cash/);
  assert.equal(run.cash, 7_500);
  assert.equal(run.stock.bar, 0);
});

test("price tiers preserve full, half, and zero demand at their boundaries", () => {
  const reference = 400;
  assert.deepEqual([400, 401, 800, 801].map((price) => demandFor(price, reference)), [10, 5, 5, 0]);
  assert.equal(parseEuroAmount("0"), null);
  assert.equal(parseEuroAmount("-1"), null);
  assert.equal(parseEuroAmount("4.001"), null);
  assert.equal(parseEuroAmount("4,01"), 401);
});

test("live price preview reflects today's event, stock, and gross profit", () => {
  const gymRush = CAMPUS_EVENTS.find(({ id }) => id === "gym-rush");
  assert.deepEqual(previewProduct("shake", 500, 3, gymRush), { demand: 16, sellable: 3, revenue: 1_500, grossProfit: 750 });
  assert.deepEqual(previewProduct("shake", 501, 20, gymRush), { demand: 8, sellable: 8, revenue: 4_008, grossProfit: 2_008 });
  assert.deepEqual(previewProduct("shake", 1_001, 10, gymRush), { demand: 0, sellable: 0, revenue: 0, grossProfit: 0 });
});

test("every new run contains all five campus events in a stored shuffled order", () => {
  const first = createNewRun(() => 0);
  const second = createNewRun(() => 0.99);
  assert.equal(new Set(first.eventOrder).size, CAMPUS_EVENTS.length);
  assert.deepEqual(first.eventOrder.slice().sort(), CAMPUS_EVENTS.map(({ id }) => id).sort());
  assert.notDeepEqual(first.eventOrder, second.eventOrder);
  assert.equal(campusEventFor(first).id, first.eventOrder[0]);
});

test("A3: daily revenue, cost of goods sold, profit, cash, and stock reconcile", () => {
  let run = createNewRun();
  run = buyStock(run, "shake", 10);
  run = setPrice(run, "shake", byId("shake").referencePrice);
  run = tradeDay(run);
  const result = run.history[0];
  const demand = campusEventFor({ ...run, currentDay: 1 }, 1).demand.shake;
  const sold = Math.min(demand, 10);
  assert.equal(result.revenue, sold * byId("shake").referencePrice);
  assert.equal(result.costOfGoodsSold, sold * byId("shake").unitCost);
  assert.equal(result.grossProfit, result.revenue - result.costOfGoodsSold);
  assert.equal(run.cash, STARTING_CASH - 10 * byId("shake").unitCost + result.revenue);
  assert.equal(run.stock.shake, 10 - sold);
  assert.equal(result.eventId, run.eventOrder[0]);
});

test("A4: sales are limited by stock, including zero stock", () => {
  let run = createNewRun();
  run = buyStock(run, "shake", 3);
  run = tradeDay(run);
  assert.equal(run.history[0].items.find((item) => item.productId === "shake").sold, 3);
  assert.equal(run.stock.shake, 0);
  run = tradeDay(run);
  assert.equal(run.history[1].items.find((item) => item.productId === "shake").sold, 0);
  assert.ok(Object.values(run.stock).every((quantity) => quantity >= 0));
});

test("A5: recorded days cannot replay and saved state contains a single completed-day record", () => {
  let run = buyStock(createNewRun(), "shake", 10);
  run = tradeDay(run);
  const serialized = JSON.stringify(run);
  assert.equal(JSON.parse(serialized).history.length, 1);
  assert.throws(() => tradeDay({ ...run, currentDay: 1 }), /already been recorded/);
  assert.equal(JSON.parse(serialized).cash, run.cash);
  assert.equal(JSON.parse(serialized).stock.shake, run.stock.shake);
});

test("A6: trading and buying stop after day five and a new run resets all balances and history", () => {
  let run = createNewRun();
  for (let day = 0; day < 5; day += 1) run = tradeDay(run);
  assert.equal(run.currentDay, 6);
  assert.equal(run.history.length, 5);
  assert.throws(() => tradeDay(run), /run is complete/);
  assert.throws(() => buyStock(run, "shake", 1), /run is complete/);
  const restarted = createNewRun();
  assert.equal(restarted.cash, STARTING_CASH);
  assert.equal(restarted.currentDay, 1);
  assert.deepEqual(Object.values(restarted.stock), [0, 0, 0]);
  assert.deepEqual(restarted.history, []);
});

test("overall gain includes remaining stock at cost, without deducting purchases twice", () => {
  let run = buyStock(createNewRun(), "shake", 2);
  run = tradeDay(run);
  assert.equal(overallResult(run), 500);
});

test("old café saves start a clean nutrition-store run and remain available at their old storage key", () => {
  const legacy = { ...createNewRun(), version: 2, stock: { coffee: 2, toastie: 3, cookie: 1 } };
  const migrated = migrateRun(legacy);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.cash, STARTING_CASH);
  assert.equal(migrated.currentDay, 1);
  assert.deepEqual(Object.values(migrated.stock), [0, 0, 0]);
  assert.deepEqual(migrated.history, []);
  assert.deepEqual(migrated.catalogue.map(({ id }) => id), PRODUCTS.map(({ id }) => id));
});
