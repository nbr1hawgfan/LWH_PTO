/* ==========================================================================
   LWH PTO — CONFIG  (the only file you normally need to edit)
   ========================================================================== */
window.PTO_CONFIG = {
  // Paste your Apps Script web app URL here (ends in /exec).
  // Deploy → Manage deployments → copy "Web app URL".
  API_URL: 'https://script.google.com/macros/s/AKfycbwXblseav0VCgynTXxL6BYTLniZ4xJAiYholbDgnFPXBqL46_sxP1Rc49MWMga52QsV/exec',

  // Weather card (Open-Meteo, free, no key). Fort Smith HQ by default.
  WEATHER: { name: 'Fort Smith, AR', lat: 35.3859, lon: -94.3985 },

  // Top utility bar — same as the company portal.
  COMPANY: {
    name: 'Logistics Warehouse',
    phone: '1-479-410-2611',
    address: '700 Fresno Street, HQ',
    hours: 'Mon–Fri: 8AM–5PM'
  },

  // Default recipients offered for the HR Detailed Report email (manager app).
  HR_REPORT_DEFAULT_EMAILS: 'administrator@logisticswarehouse.net, tjennings@logistics-warehouse.com',

  // Employee app: how far back people may submit (matches the old portal).
  PAST_DAYS_ALLOWED: 180,

  // Manager "Record" defaults for asks: a "leave early" ask fills end time
  // with WORKDAY_END, a "come in late" ask fills start time with WORKDAY_START.
  WORKDAY_START: '08:00',
  WORKDAY_END: '17:00',

  // Highlight balances at or below this many days in red.
  LOW_BALANCE_DAYS: 2
};
