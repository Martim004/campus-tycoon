# Campus Tycoon: Campus Café

A small five-day business simulation built with plain HTML, CSS, and JavaScript. Buy stock, set prices, and see how your decisions affect cash and inventory.

The first-run guide explains the loop, live price previews make the deterministic demand rule visible, and each completed day has an expandable product-by-product breakdown. Finish the five days for a gross-profit chart and a short performance debrief.

## Play locally

Open `index.html` in a modern browser. The game stores the current run in that browser's local storage, so your progress stays on the same device and browser.

## Rules

- Start with €100 and no stock.
- Demand is 10 units at or below the reference price, 5 units above reference and up to twice reference, and 0 above twice reference.
- Sales cannot exceed stock. Unsold items carry over to the next day.
- The five-day final result is cash plus remaining stock at purchase cost, minus the starting €100.
- Version 1 browser saves are upgraded in place when the newer detailed day history is first loaded.

## Check the business rules

Run `node --test` with Node.js 18 or newer.

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow that publishes the root of the default branch to GitHub Pages. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
