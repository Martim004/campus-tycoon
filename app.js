import { DAYS_IN_RUN, PRODUCTS, STORAGE_KEY, buyStock, createNewRun, formatEuro, overallResult, parseEuroAmount, setPrice, tradeDay } from "./rules.js";

const $ = (selector) => document.querySelector(selector);
const productList = $("#product-list");
let toastTimer;
let tradePending = false;

function loadRun() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createNewRun();
    const run = JSON.parse(saved);
    const valid = run?.version === 1 && Number.isSafeInteger(run.cash) && run.cash >= 0 && Number.isInteger(run.currentDay) && run.currentDay >= 1 && run.currentDay <= DAYS_IN_RUN + 1 && Array.isArray(run.history) && run.history.length === run.currentDay - 1 && PRODUCTS.every(({ id }) => Number.isSafeInteger(run.stock?.[id]) && run.stock[id] >= 0 && Number.isSafeInteger(run.prices?.[id]) && run.prices[id] > 0);
    return valid ? run : createNewRun();
  } catch {
    return createNewRun();
  }
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
  productList.innerHTML = PRODUCTS.map((product) => `
    <article class="product">
      <div class="product-info">
        <span class="product-icon" aria-hidden="true">${product.icon}</span>
        <div><div class="product-name">${product.name}</div><div class="product-meta">Cost ${formatEuro(product.unitCost)} each</div><span class="stock-pill"><b>${run.stock[product.id]}</b> in stock</span></div>
      </div>
      <label><span class="control-label">SELL FOR</span><input class="price-input" data-price="${product.id}" type="text" inputmode="decimal" value="${(run.prices[product.id] / 100).toFixed(2)}" aria-label="Selling price for ${product.name}" ${completed ? "disabled" : ""}></label>
      <div><label class="control-label" for="quantity-${product.id}">BUY STOCK</label><div class="buy-control"><input class="quantity-input" id="quantity-${product.id}" data-quantity="${product.id}" type="number" min="1" step="1" value="1" aria-label="Quantity of ${product.name} to buy" ${completed ? "disabled" : ""}><button class="buy-button" data-buy="${product.id}" type="button" ${completed ? "disabled" : ""}>Buy ${formatEuro(product.unitCost)}</button></div></div>
    </article>`).join("");

  productList.querySelectorAll("[data-price]").forEach((input) => {
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
    const sign = day.grossProfit >= 0 ? "+" : "−";
    return `<div class="history-row"><span class="history-day">DAY ${day.day}</span><div class="history-detail"><strong>${sold} ${sold === 1 ? "item" : "items"} sold</strong>${formatEuro(day.revenue)} revenue · ${formatEuro(day.costOfGoodsSold)} cost</div><span class="history-total ${day.grossProfit >= 0 ? "positive" : "negative"}">${sign}${formatEuro(Math.abs(day.grossProfit))}</span></div>`;
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
  resultElement.textContent = `${result < 0 ? "−" : ""}${formatEuro(Math.abs(result))}`;
  resultElement.classList.toggle("negative", result < 0);
  resultElement.classList.toggle("positive", result >= 0);
  $("#open-badge").innerHTML = completed ? "<i></i> RUN COMPLETE" : "<i></i> NOT TRADING";
  $("#trade-heading").textContent = completed ? "The café is closed." : "Open for the day?";
  $("#trade-copy").textContent = completed ? "Your five trading days are complete. Check the final result or start a fresh run." : "Your prices are set and your stock is ready. See how the day goes.";
  const tradeButton = $("#trade-button");
  tradeButton.disabled = completed || tradePending;
  tradeButton.innerHTML = completed ? "Five-day run complete" : 'Open for today <span aria-hidden="true">→</span>';
  $("#final-panel").hidden = !completed;
  if (completed) {
    const finalResult = overallResult(run);
    $("#final-result").textContent = `${finalResult < 0 ? "−" : ""}${formatEuro(Math.abs(finalResult))}`;
    $("#final-result").classList.toggle("negative", finalResult < 0);
    $("#final-result").classList.toggle("positive", finalResult >= 0);
    $("#final-copy").textContent = `Final cash is ${formatEuro(run.cash)} with ${formatEuro(run.stock ? PRODUCTS.reduce((sum, product) => sum + run.stock[product.id] * product.unitCost, 0) : 0)} of stock at purchase cost.`;
  }
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
      showToast(`Day ${day.day} complete · ${formatEuro(day.revenue)} revenue · ${formatEuro(day.grossProfit)} gross profit`);
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
