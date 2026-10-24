# Campus Tycoon: Campus Fuel

A five-day sports nutrition store simulation built with plain HTML, CSS, and JavaScript. Buy protein shakes, energy bars, and reusable shakers; read the changing campus forecast; choose prices; and review how your decisions affect cash and inventory.

## Play locally

Open `index.html` in a modern browser. The current catalogue, event order, and run progress are saved in that browser's local storage, so progress stays on the same device and browser.

## Rules

- Start with €100 and no stock.
- Each new run shuffles five campus events. The event order is saved, so a refresh never changes today's forecast or lets a day be replayed.
- Every event has a product-specific full-price demand baseline. Expected demand responds gradually to price using a constant-elasticity curve: baseline × (reference price ÷ selling price)². Discounts can increase demand up to twice the event baseline, and each day's expected demand rounds to a whole unit for trading.
- Sales cannot exceed stock. Unsold items carry over to the next day.
- The five-day final result is cash plus remaining stock at purchase cost, minus the starting €100.
- Existing café saves are kept in their old browser storage keys; the new store starts with a fresh run because its products and event rules use a different catalogue.

## Check the business rules

Run `node --test` with Node.js 18 or newer.

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow that publishes the root of the default branch to GitHub Pages. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
