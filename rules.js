export const STARTING_CASH = 10_000;
export const DAYS_IN_RUN = 5;
export const STORAGE_KEY = "campus-tycoon-run-v3";
export const LEGACY_STORAGE_KEYS = ["campus-tycoon-run-v2", "campus-tycoon-run-v1"];

export const PRODUCTS = [
  { id: "shake", name: "Protein shake", icon: "🥤", unitCost: 250, referencePrice: 500 },
  { id: "bar", name: "Energy bar", icon: "🍫", unitCost: 100, referencePrice: 250 },
  { id: "shaker", name: "Reusable shaker", icon: "🏋️", unitCost: 600, referencePrice: 1_200 },
];

export const CAMPUS_EVENTS = [
  { id: "gym-rush", name: "Gym rush", description: "The campus gym is packed after a group fitness challenge.", demand: { shake: 16, bar: 8, shaker: 6 } },
  { id: "tournament", name: "Campus tournament", description: "Teams and spectators are stocking up before the big matches.", demand: { shake: 12, bar: 16, shaker: 12 } },
  { id: "exam-week", name: "Exam-week reset", description: "Long library sessions make quick fuel more popular than gear.", demand: { shake: 6, bar: 18, shaker: 3 } },
  { id: "wellness-fair", name: "Wellness fair", description: "A healthy-living fair brings new faces to the store.", demand: { shake: 18, bar: 12, shaker: 15 } },
  { id: "rainy-day", name: "Rainy training day", description: "Indoor workouts draw a smaller but focused crowd.", demand: { shake: 10, bar: 6, shaker: 3 } },
];

export function createNewRun(random = Math.random) {
  const eventOrder = CAMPUS_EVENTS.map(({ id }) => id);
  for (let index = eventOrder.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [eventOrder[index], eventOrder[swapIndex]] = [eventOrder[swapIndex], eventOrder[index]];
  }
  return {
    version: 3,
    catalogue: PRODUCTS.map((product) => ({ ...product })),
    eventOrder,
    cash: STARTING_CASH,
    currentDay: 1,
    stock: Object.fromEntries(PRODUCTS.map(({ id }) => [id, 0])),
    prices: Object.fromEntries(PRODUCTS.map(({ id, referencePrice }) => [id, referencePrice])),
    purchases: [],
    history: [],
  };
}

export function demandFor(price, referencePrice, fullPriceDemand = 10) {
  if (!Number.isSafeInteger(price) || price <= 0) throw new RangeError("Selling price must be a positive amount in cents.");
  if (!Number.isSafeInteger(referencePrice) || referencePrice <= 0) throw new RangeError("Reference price must be a positive amount in cents.");
  if (!Number.isSafeInteger(fullPriceDemand) || fullPriceDemand < 0) throw new RangeError("Daily demand must be a non-negative whole number.");
  if (price <= referencePrice) return fullPriceDemand;
  if (price <= referencePrice * 2) return Math.ceil(fullPriceDemand / 2);
  return 0;
}

export function campusEventFor(run, day = run.currentDay) {
  const eventId = run.eventOrder?.[day - 1];
  return CAMPUS_EVENTS.find(({ id }) => id === eventId) ?? null;
}

export function previewProduct(productId, price, stock, campusEvent = null) {
  const product = PRODUCTS.find(({ id }) => id === productId);
  if (!product) throw new RangeError("Choose a product from the menu.");
  const demand = demandFor(price, product.referencePrice, campusEvent?.demand[productId] ?? 10);
  const sellable = Math.min(demand, stock);
  const revenue = sellable * price;
  const grossProfit = revenue - sellable * product.unitCost;
  return { demand, sellable, revenue, grossProfit };
}

export function buyStock(run, productId, quantity) {
  const product = PRODUCTS.find(({ id }) => id === productId);
  if (!product) throw new RangeError("Choose a product from the menu.");
  if (run.currentDay > DAYS_IN_RUN) throw new Error("This run is complete. Start a new run to keep playing.");
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new RangeError("Quantity must be a positive whole number.");
  const totalCost = product.unitCost * quantity;
  if (!Number.isSafeInteger(totalCost) || totalCost > run.cash) throw new Error("There isn’t enough cash for that purchase.");

  return {
    ...run,
    cash: run.cash - totalCost,
    stock: { ...run.stock, [productId]: run.stock[productId] + quantity },
    purchases: [...run.purchases, { day: run.currentDay, productId, quantity, totalCost }],
  };
}

export function setPrice(run, productId, price) {
  const product = PRODUCTS.find(({ id }) => id === productId);
  if (!product) throw new RangeError("Choose a product from the menu.");
  if (run.currentDay > DAYS_IN_RUN) throw new Error("This run is complete.");
  if (!Number.isSafeInteger(price) || price <= 0) throw new RangeError("Selling price must be a positive amount with up to two decimal places.");
  return { ...run, prices: { ...run.prices, [productId]: price } };
}

export function tradeDay(run) {
  if (run.currentDay > DAYS_IN_RUN) throw new Error("This run is complete. Start a new run to keep playing.");
  if (run.history.some(({ day }) => day === run.currentDay)) throw new Error("This day has already been recorded.");

  let revenue = 0;
  let costOfGoodsSold = 0;
  const items = PRODUCTS.map((product) => {
    const campusEvent = campusEventFor(run);
    const demand = demandFor(run.prices[product.id], product.referencePrice, campusEvent?.demand[product.id] ?? 10);
    const stockBefore = run.stock[product.id];
    const sold = Math.min(demand, stockBefore);
    const sellingPrice = run.prices[product.id];
    const itemRevenue = sold * sellingPrice;
    const itemCost = sold * product.unitCost;
    revenue += itemRevenue;
    costOfGoodsSold += itemCost;
    return {
      productId: product.id,
      sellingPrice,
      demand,
      stockBefore,
      sold,
      stockAfter: stockBefore - sold,
      revenue: itemRevenue,
      costOfGoodsSold: itemCost,
      grossProfit: itemRevenue - itemCost,
    };
  });

  const result = {
    day: run.currentDay,
    eventId: campusEventFor(run)?.id,
    items,
    revenue,
    costOfGoodsSold,
    grossProfit: revenue - costOfGoodsSold,
  };

  return {
    ...run,
    cash: run.cash + revenue,
    currentDay: run.currentDay + 1,
    stock: Object.fromEntries(PRODUCTS.map((product) => {
      const sold = result.items.find((item) => item.productId === product.id).sold;
      return [product.id, run.stock[product.id] - sold];
    })),
    history: [...run.history, result],
  };
}

export function migrateRun(run) {
  if (run?.version === 3) return run;
  // A café run cannot be faithfully translated to the new store's stock costs and events.
  // Preserve the old browser save under its old key and begin a clean sports-store run.
  if (run?.version === 1 || run?.version === 2) return createNewRun();
  return null;
}

export function stockValueAtCost(run) {
  return PRODUCTS.reduce((total, product) => total + run.stock[product.id] * product.unitCost, 0);
}

export function overallResult(run) {
  return run.cash + stockValueAtCost(run) - STARTING_CASH;
}

export function parseEuroAmount(value) {
  const normalized = String(value).trim().replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [euros, cents = ""] = normalized.split(".");
  const amount = Number(euros) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function formatEuro(cents) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100);
}
