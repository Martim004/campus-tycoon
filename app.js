import { DAYS_IN_RUN, LEGACY_STORAGE_KEY, PRODUCTS, STARTING_CASH, STORAGE_KEY, buyStock, createNewRun, formatEuro, migrateRun, overallResult, parseEuroAmount, previewProduct, setPrice, stockValueAtCost, tradeDay } from "./rules.js";

const $ = (selector) => document.querySelector(selector);
const productList = $("#product-list");
let toastTimer;
let tradePending = false;

function isValidRun(run) {
  return run?.version === 2
    && Number.isSafeInteger(run.cash)
    && run.cash >= 0
    && Number.isInteger(run.currentDay)
    && run.currentDay >= 1
    && run.currentDay <= DAYS_IN_RUN + 1
    && Array.isArray(run.purchases)
    && Array.isArray(run.history)
    && run.history.length === run.currentDay - 1
    && PRODUCTS.every(({ id }) => Number.isSafeInteger(run.stock?.[id]) && run.stock[id] >= 0 && Number.isSafeInteger(run.prices?.[id]) && run.prices[id] > 0)
    && run.history.every((day, index) => day.day === index + 1
      && Array.isArray(day.items)
      && PRODUCTS.every(({ id }) => {
        const item = day.items.find((entry) => entry.productId === id);
        return item
          && Number.isSafeInteger(item.demand) && item.demand >= 0
          && Number.isSafeInteger(item.stockBefore) && item.stockBefore >= 0
          && Number.isSafeInteger(item.sold) && item.sold >= 0
          && Number.isSafeInteger(item.stockAfter) && item.stockAfter >= 0
          && Number.isSafeInteger(item.revenue)
          && Number.isSafeInteger(item.costOfGoodsSold)
          && Number.isSafeInteger(item.grossProfit);
      }));
}

function loadRun() {
  try {
    for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
      const saved = localStorage.getItem(key);
      if (!saved) continue;
      const parsed = JSON.parse(saved);
      const run = migrateRun(parsed);
      if (!isValidRun(run)) continue;
      if (key !== STORAGE_KEY) localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
      return run;
    }
  } catch {
    return createNewRun();
  }
  return createNewRun();
}

let run = loadRun();

function persist(nextRun) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRun));
    run = nextRun;
    return true;
  } catch {
    showToast("Couldn’t save this change. Check your browser storage.");
    return false;
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function formatSignedEuro(cents) {
  return `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${formatEuro(Math.abs(cents))}`;
}

function priceForecast(productId, inputValue) {
  const price = parseEuroAmount(inputValue);
  if (price === null) return { text: "Enter a positive price to preview demand.", invalid: true };
  const product = PRODUCTS.find(({ id }) => id === productId);
  const forecast = previewProduct(productId, price, run.stock[productId]);
  if (forecast.demand === 0) {
    return { text: `0 wanted at this price · demand returns at ${formatEuro(product.referencePrice * 2)} or below`, invalid: false };
  }
  if (forecast.sellable === 0) {
    return { text: `${forecast.demand} wanted · no stock available to sell`, invalid: false };
  }
  return { text: `${forecast.demand} wanted · ${forecast.sellable} sellable · ${formatSignedEuro(forecast.grossProfit)} gross`, invalid: false };
}

function updatePricePreview(productId, input) {
  const preview = productList.querySelector(`[data-forecast="${productId}"]`);
  if (!preview) return;
  const forecast = priceForecast(productId, input.value);
  preview.textContent = forecast.text;
  preview.classList.toggle("invalid", forecast.invalid);
}

function updatePrice(productId, input) {
  const amount = parseEuroAmount(input.value);
  if (amount === null) {
    input.setAttribute("aria-invalid", "true");
    showToast("Enter a positive price with up to two decimal places.");
    render();
    const focused = $(`[data-price="${productId}"]`);
    focused?.focus();
    focused?.select();
    return;
  }
  input.removeAttribute("aria-invalid");
  try {
    const nextRun = setPrice(run, productId, amount);
    if (persist(nextRun)) showToast("Selling price saved.");
  } catch (error) {
    showToast(error.message);
  }
  render();
}

function renderProducts() {
  const completed = run.currentDay > DAYS_IN_RUN;
  productList.innerHTML = PRODUCTS.map((product) => {
    const forecast = priceForecast(product.id, (run.prices[product.id] / 100).toFixed(2));
    return `
    <article class="product">
      <div class="product-info">
        <span class="product-icon" aria-hidden="true">${product.icon}</span>
        <div><div class="product-name">${product.name}</div><div class="product-meta">Cost ${formatEuro(product.unitCost)} · ref. ${formatEuro(product.referencePrice)}</div><span class="stock-pill"><b>${run.stock[product.id]}</b> in stock</span></div>
      </div>
      <label class="price-control"><span class="control-label">SELL FOR</span><input class="price-input" data-price="${product.id}" type="text" inputmode="decimal" value="${(run.prices[product.id] / 100).toFixed(2)}" aria-label="Selling price for ${product.name}" ${completed ? "disabled" : ""}><span class="price-preview" data-forecast="${product.id}" aria-live="polite">${forecast.text}</span></label>
      <div class="buy-stock-control"><label class="control-label" for="quantity-${product.id}">BUY STOCK</label><div class="buy-control"><input class="quantity-input" id="quantity-${product.id}" data-quantity="${product.id}" type="number" min="1" step="1" value="1" aria-label="Quantity of ${product.name} to buy" ${completed ? "disabled" : ""}><button class="buy-button" data-buy="${product.id}" type="button" ${completed ? "disabled" : ""}>Buy ${formatEuro(product.unitCost)}</button></div></div>
    </article>`;
  }).join("");

  productList.querySelectorAll("[data-price]").forEach((input) => {
    input.addEventListener("input", () => updatePricePreview(input.dataset.price, input));
    input.addEventListener("change", () => updatePrice(input.dataset.price, input));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });
  });
  productList.querySelectorAll("[data-buy]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.dataset.buy;
      const quantityInput = $(`[data-quantity="${productId}"]`);
      const quantity = Number(quantityInput.value);
      try {
        const nextRun = buyStock(run, productId, quantity);
        if (persist(nextRun)) showToast(`${quantity} ${quantity === 1 ? "unit" : "units"} added to stock.`);
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });
}

function renderHistory() {
  $("#history-count").textContent = `${run.history.length} / ${DAYS_IN_RUN}`;
  const historyList = $("#history-list");
  if (!run.history.length) {
    historyList.innerHTML = '<p class="empty-state">Your first trading day is waiting.</p>';
    return;
  }
  historyList.innerHTML = run.history.slice().reverse().map((day) => {
    const sold = day.items.reduce((total, item) => total + item.sold, 0);
    const demand = day.items.reduce((total, item) => total + item.demand, 0);
    const rows = day.items.map((item) => {
      const product = PRODUCTS.find(({ id }) => id === item.productId);
      return `<tr>
        <th scope="row">${product.name}</th>
        <td>${formatEuro(item.sellingPrice)}</td>
        <td>${item.demand}</td>
        <td>${item.sold}</td>
        <td>${item.stockAfter}</td>
        <td>${formatEuro(item.revenue)}</td>
        <td>${formatEuro(item.costOfGoodsSold)}</td>
        <td class="${item.grossProfit >= 0 ? "positive" : "negative"}">${formatSignedEuro(item.grossProfit)}</td>
      </tr>`;
    }).join("");
    return `<details class="history-entry">
      <summary class="history-row">
        <span class="history-day">DAY ${day.day}</span>
        <span class="history-detail"><strong>${sold} of ${demand} wanted sold</strong>${formatEuro(day.revenue)} revenue · ${formatSignedEuro(day.grossProfit)} gross</span>
        <span class="history-total ${day.grossProfit >= 0 ? "positive" : "negative"}">${formatSignedEuro(day.grossProfit)}</span>
      </summary>
      <div class="daily-breakdown">
        <div class="table-scroll"><table aria-label="Day ${day.day} product results">
          <thead><tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Wanted</th><th scope="col">Sold</th><th scope="col">Left</th><th scope="col">Revenue</th><th scope="col">Cost</th><th scope="col">Gross</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    </details>`;
  }).join("");
}

function renderFinalReport() {
  const finalResult = overallResult(run);
  const stockValue = stockValueAtCost(run);
  $("#final-result").textContent = formatSignedEuro(finalResult);
  $("#final-result").classList.toggle("negative", finalResult < 0);
  $("#final-result").classList.toggle("positive", finalResult >= 0);
  $("#final-copy").textContent = "The final result counts your cash and remaining stock at purchase cost, then subtracts your €100 starting cash.";
  $("#final-breakdown").innerHTML = `
    <div><span>FINAL CASH</span><strong>${formatEuro(run.cash)}</strong></div>
    <div><span>REMAINING STOCK AT COST</span><strong>${formatEuro(stockValue)}</strong></div>
    <div><span>STARTING CASH</span><strong>−${formatEuro(STARTING_CASH)}</strong></div>`;

  const productTotals = PRODUCTS.map((product) => {
    const items = run.history.flatMap((day) => day.items.filter((item) => item.productId === product.id));
    return { ...product, grossProfit: items.reduce((total, item) => total + item.grossProfit, 0), sold: items.reduce((total, item) => total + item.sold, 0) };
  });
  const totalSold = productTotals.reduce((total, product) => total + product.sold, 0);
  const unmetUnits = run.history.reduce((total, day) => total + day.items.reduce((sum, item) => sum + Math.max(0, item.demand - item.sold), 0), 0);
  const stockoutDays = run.history.reduce((total, day) => total + day.items.filter((item) => item.demand > item.sold).length, 0);
  const noDemandDays = run.history.reduce((total, day) => total + day.items.filter((item) => item.demand === 0).length, 0);
  const leadingProduct = productTotals.slice().sort((a, b) => b.grossProfit - a.grossProfit)[0];
  const insights = [];
  if (leadingProduct.grossProfit > 0) {
    insights.push(`${leadingProduct.name} led the menu with ${formatSignedEuro(leadingProduct.grossProfit)} gross profit.`);
  } else if (totalSold === 0) {
    insights.push("No units sold this week. Try buying stock before opening, then price at or below the reference price to reach the highest demand tier.");
  } else {
    insights.push("Your sales did not produce a positive gross profit. Compare each selling price with its purchase cost before the next run.");
  }
  if (unmetUnits > 0) {
    insights.push(`There were ${unmetUnits} units of unmet demand across ${stockoutDays} product-days. More stock could have captured those sales.`);
  } else if (noDemandDays > 0) {
    insights.push(`${noDemandDays} product-days had no demand because the price was above twice its reference price.`);
  } else {
    insights.push("You had enough stock to meet all demand at your chosen prices.");
  }

  $("#debrief-metrics").innerHTML = `
    <div class="debrief-metric"><strong>${totalSold}</strong><span>UNITS SOLD</span></div>
    <div class="debrief-metric"><strong>${unmetUnits}</strong><span>UNMET UNITS</span></div>
    <div class="debrief-metric"><strong>${noDemandDays}</strong><span>ZERO-DEMAND DAYS</span></div>`;
  $("#debrief-insight").textContent = insights.join(" ");

  const largestDay = Math.max(1, ...run.history.map((day) => Math.abs(day.grossProfit)));
  $("#chart-rows").innerHTML = run.history.map((day) => {
    const value = day.grossProfit;
    const width = Math.max(value === 0 ? 0 : 5, Math.round(Math.abs(value) / largestDay * 100));
    return `<div class="chart-row"><span class="chart-day">DAY ${day.day}</span><div class="chart-track" aria-hidden="true"><i class="${value < 0 ? "loss" : ""}" style="width:${width}%"></i></div><strong class="${value < 0 ? "negative" : "positive"}">${formatSignedEuro(value)}</strong></div>`;
  }).join("");
}

function render() {
  const completedDays = run.history.length;
  const completed = run.currentDay > DAYS_IN_RUN;
  $("#day-label").textContent = completed ? "ALL DONE" : `DAY ${run.currentDay}`;
  $("#day-track").style.setProperty("--progress", `${(completedDays / DAYS_IN_RUN) * 100}%`);
  $("#day-track").setAttribute("aria-label", `${completedDays} of ${DAYS_IN_RUN} days completed`);
  $("#cash-value").textContent = formatEuro(run.cash);
  const totalStock = Object.values(run.stock).reduce((total, quantity) => total + quantity, 0);
  $("#stock-value").innerHTML = `${totalStock} <small>${totalStock === 1 ? "unit" : "units"}</small>`;
  const result = overallResult(run);
  const resultElement = $("#result-value");
  resultElement.textContent = formatSignedEuro(result);
  resultElement.classList.toggle("negative", result < 0);
  resultElement.classList.toggle("positive", result >= 0);
  $("#first-run-guide").hidden = completedDays > 0;
  $("#open-badge").innerHTML = completed ? "<i></i> RUN COMPLETE" : "<i></i> NOT TRADING";
  $("#trade-heading").textContent = completed ? "The café is closed." : "Open for the day?";
  $("#trade-copy").textContent = completed ? "Your five trading days are complete. Review your week, then start a fresh run when you’re ready." : "Your prices are set and your stock is ready. See how the day goes.";
  const tradeButton = $("#trade-button");
  tradeButton.disabled = completed || tradePending;
  tradeButton.innerHTML = completed ? "Five-day run complete" : 'Open for today <span aria-hidden="true">→</span>';
  $("#final-panel").hidden = !completed;
  if (completed) renderFinalReport();
  renderProducts();
  renderHistory();
}

$("#trade-button").addEventListener("click", () => {
  if (tradePending) return;
  tradePending = true;
  try {
    const nextRun = tradeDay(run);
    if (persist(nextRun)) {
      const day = nextRun.history[nextRun.history.length - 1];
      showToast(`Day ${day.day} complete · ${formatEuro(day.revenue)} revenue · ${formatSignedEuro(day.grossProfit)} gross profit`);
    }
  } catch (error) {
    showToast(error.message);
  }
  render();
  window.setTimeout(() => {
    tradePending = false;
    render();
  }, 250);
});

$("#new-run-button").addEventListener("click", () => {
  if (!window.confirm("Start a new run? Your current cash, stock, and daily results will be replaced.")) return;
  if (persist(createNewRun())) {
    render();
    showToast("A fresh café run is ready.");
  }
});

render();
