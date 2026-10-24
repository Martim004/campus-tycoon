export const STARTING_CASH = 10_000;
export const DAYS_IN_RUN = 5;
export const STORAGE_KEY = "campus-tycoon-run-v2";
export const LEGACY_STORAGE_KEY = "campus-tycoon-run-v1";

export const PRODUCTS = [
  { id: "coffee", name: "House coffee", icon: "☕", unitCost: 200, referencePrice: 400 },
  { id: "toastie", name: "Cheese toastie", icon: "🥪", unitCost: 300, referencePrice: 600 },
  { id: "cookie", name: "Campus cookie", icon: "🍪", unitCost: 100, referencePrice: 200 },
];

export function createNewRun() {
  return {
    version: 2,
    cash: STARTING_CASH,
    currentDay: 1,
    stock: Object.fromEntries(PRODUCTS.map(({ id }) => [id, 0])),
    prices: Object.fromEntries(PRODUCTS.map(({ id, referencePrice }) => [id, referencePrice])),
    purchases: [],
    history: [],
  };
}

export function demandFor(price, referencePrice) {
  if (!Number.isSafeInteger(price) || price <= 0) throw new RangeError("Selling price must be a positive amount in cents.");
  if (!Number.isSafeInteger(referencePrice) || referencePrice <= 0) throw new RangeError("Reference price must be a positive amount in cents.");
  if (price <= referencePrice) return 10;
  if (price <= referencePrice * 2) return 5;
  return 0;
}

export function previewProduct(productId, price, stock) {
  const product = PRODUCTS.find(({ id }) => id === productId);
  if (!product) throw new RangeError("Choose a product from the menu.");
  const demand = demandFor(price, product.referencePrice);
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
    const demand = demandFor(run.prices[product.id], product.referencePrice);
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
  if (run?.version === 2) return run;
  if (run?.version !== 1 || !Array.isArray(run.history) || !Array.isArray(run.purchases)) return null;

  const stock = Object.fromEntries(PRODUCTS.map(({ id }) => [id, 0]));
  const history = run.history.map((day) => {
    const purchases = Object.fromEntries(PRODUCTS.map(({ id }) => [id, 0]));
    for (const purchase of run.purchases.filter((entry) => entry.day === day.day)) {
      if (Object.hasOwn(purchases, purchase.productId)) purchases[purchase.productId] += purchase.quantity;
    }

    let revenue = 0;
    let costOfGoodsSold = 0;
    const items = PRODUCTS.map((product) => {
      const previousItem = day.items.find((item) => item.productId === product.id);
      const stockBefore = stock[product.id] + purchases[product.id];
      const sold = previousItem?.sold ?? 0;
      const stockAfter = stockBefore - sold;
      stock[product.id] = stockAfter;
      const itemRevenue = previousItem?.revenue ?? 0;
      const itemCost = previousItem?.costOfGoodsSold ?? sold * product.unitCost;
      revenue += itemRevenue;
      costOfGoodsSold += itemCost;
      return {
        productId: product.id,
        sellingPrice: sold > 0 ? itemRevenue / sold : run.prices[product.id],
        demand: previousItem?.demand ?? 0,
        stockBefore,
        sold,
        stockAfter,
        revenue: itemRevenue,
        costOfGoodsSold: itemCost,
        grossProfit: previousItem?.grossProfit ?? itemRevenue - itemCost,
      };
    });

    return {
      ...day,
      items,
      revenue: day.revenue ?? revenue,
      costOfGoodsSold: day.costOfGoodsSold ?? costOfGoodsSold,
      grossProfit: day.grossProfit ?? revenue - costOfGoodsSold,
    };
  });

  return { ...run, version: 2, history };
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
