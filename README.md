# LWH PTO

Employee and manager PTO & absence portals for Logistics Warehouse, Inc., built as installable PWAs on GitHub Pages.

- `/` is the Employee app: balance, time-off requests, request history and withdrawals, messages to your manager, weather.
- `/manager/` is the Manager app: approvals, team calendar, absence recording, PTO balances, absence analytics, HR report.

The data comes from the existing PTO Google Sheet through the Apps Script web app (`Api.gs` → `doPost`). Set the URL in `assets/js/config.js`.
