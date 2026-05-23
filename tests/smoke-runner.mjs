/**
 * Comprehensive smoke test — no browser needed.
 * Tests every page and API endpoint for crashes, 500s, and response issues.
 *
 * Usage: node tests/smoke-runner.mjs
 * Requires the server to be running on localhost:5000
 */

const BASE = process.env.BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = "admin@wefixtrades.com";
const ADMIN_PASS = "TestAdmin123!";

const results = { tested: 0, passed: 0, failed: 0, errors: [] };

async function testPage(url, name, opts = {}) {
  results.tested++;
  try {
    const headers = opts.cookie ? { Cookie: opts.cookie } : {};
    const res = await fetch(`${BASE}${url}`, { headers, redirect: "follow" });

    if (res.status >= 500) {
      results.failed++;
      results.errors.push({ name, url, status: res.status, type: "server_error" });
      console.log(`  ✗ ${name} (${url}) → ${res.status}`);
      return false;
    }

    const body = await res.text();

    // Check for React error boundaries
    if (body.includes("Unhandled Runtime Error") || body.includes("Application error")) {
      results.failed++;
      results.errors.push({ name, url, status: res.status, type: "react_crash" });
      console.log(`  ✗ ${name} (${url}) → React crash detected`);
      return false;
    }

    // Check for completely empty responses
    if (body.length < 50 && res.status === 200) {
      results.failed++;
      results.errors.push({ name, url, status: res.status, type: "empty_response" });
      console.log(`  ✗ ${name} (${url}) → Empty response`);
      return false;
    }

    results.passed++;
    console.log(`  ✓ ${name} (${url}) → ${res.status}`);
    return true;
  } catch (err) {
    results.failed++;
    results.errors.push({ name, url, status: 0, type: "network_error", message: err.message });
    console.log(`  ✗ ${name} (${url}) → ${err.message}`);
    return false;
  }
}

async function testAPI(url, name, opts = {}) {
  results.tested++;
  try {
    const headers = { "Content-Type": "application/json", ...(opts.cookie ? { Cookie: opts.cookie } : {}) };
    const fetchOpts = { headers, method: opts.method || "GET" };
    if (opts.body) fetchOpts.body = JSON.stringify(opts.body);

    const res = await fetch(`${BASE}${url}`, fetchOpts);

    if (res.status >= 500) {
      results.failed++;
      results.errors.push({ name, url, status: res.status, type: "api_error" });
      console.log(`  ✗ API: ${name} (${url}) → ${res.status}`);
      return false;
    }

    // Strict status assertion — opts.expect=200 catches param-route shadowing
    // bugs where a static endpoint silently returns 400 because a sibling
    // parameterized route swallowed the request first.
    if (opts.expect != null && res.status !== opts.expect) {
      results.failed++;
      let body = "";
      try { body = (await res.text()).slice(0, 200); } catch {}
      results.errors.push({ name, url, status: res.status, type: "unexpected_status", message: `expected ${opts.expect}, got ${res.status}: ${body}` });
      console.log(`  ✗ API: ${name} (${url}) → ${res.status} (expected ${opts.expect})`);
      return false;
    }

    results.passed++;
    console.log(`  ✓ API: ${name} (${url}) → ${res.status}`);
    return true;
  } catch (err) {
    results.failed++;
    results.errors.push({ name, url, status: 0, type: "network_error", message: err.message });
    console.log(`  ✗ API: ${name} (${url}) → ${err.message}`);
    return false;
  }
}

async function login() {
  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
      redirect: "manual",
    });
    const cookies = res.headers.getSetCookie?.() || [];
    const sessionCookie = cookies.find(c => c.startsWith("connect.sid"));
    if (sessionCookie) {
      console.log("  ✓ Admin login successful\n");
      return sessionCookie.split(";")[0];
    }
    console.log("  ⚠ Login returned no session cookie (may need seed-admin)\n");
    return null;
  } catch (err) {
    console.log(`  ✗ Login failed: ${err.message}\n`);
    return null;
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  WeFixTrades Smoke Test Runner");
  console.log("  " + new Date().toISOString());
  console.log("═══════════════════════════════════════════════════\n");

  // ─── Group 1: Public Pages ───
  console.log("── Public Marketing Pages ──");
  const publicPages = [
    ["/", "Homepage"],
    ["/products", "Products Index"],
    ["/products/tradeline", "TradeLine"],
    ["/products/quickquotepro", "QuoteQuick"],
    ["/products/mapguard", "MapGuard"],
    ["/products/reputationshield", "ReputationShield"],
    ["/products/socialsync", "SocialSync"],
    ["/products/rankflow", "RankFlow"],
    ["/products/sitelaunch", "SiteLaunch"],
    ["/products/webcare", "WebCare"],
    ["/products/webfix", "WebFix"],
    ["/products/contentflow", "ContentFlow"],
    ["/products/adflow", "AdFlow"],
    ["/products/bookflow", "BookFlow"],
    ["/pricing", "Pricing"],
    ["/plans", "Plans"],
    ["/about", "About"],
    ["/blog", "Blog"],
    ["/case-studies", "Case Studies"],
    ["/contact", "Contact"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/resources", "Resources"],
    ["/login", "Login"],
    ["/signup", "Signup"],
    ["/tools/free-audit", "Free Audit"],
    ["/tools/quote-demo", "Quote Demo"],
    ["/tools/missed-call-calculator", "Missed Call Calc"],
    ["/demos", "Demo Center"],
    ["/demos/socialsync", "SocialSync Demo"],
    ["/demos/rankflow", "RankFlow Demo"],
    ["/demos/reputationshield", "ReputationShield Demo"],
    ["/demo", "Voice Demo"],
    ["/wizard", "QQ Wizard"],
    ["/compare/tradeline", "Compare TradeLine"],
    ["/compare/mapguard", "Compare MapGuard"],
    ["/compare/reputationshield", "Compare ReputationShield"],
    ["/compare/socialsync", "Compare SocialSync"],
    ["/compare/rankflow", "Compare RankFlow"],
    ["/compare/sitelaunch", "Compare SiteLaunch"],
    ["/compare/webcare", "Compare WebCare"],
    ["/compare/webfix", "Compare WebFix"],
    ["/compare/quotequick", "Compare QuoteQuick"],
  ];
  for (const [url, name] of publicPages) await testPage(url, name);

  // ─── Group 2: Public APIs ───
  console.log("\n── Public APIs ──");
  await testAPI("/api/auth/me", "Auth status");
  await testAPI("/api/admin/vapi/status", "Vapi status");

  // ─── Group 3: Admin login + pages ───
  console.log("\n── Admin Login ──");
  const cookie = await login();

  if (cookie) {
    console.log("── Admin Pages ──");
    const adminPages = [
      ["/admin/crm", "CRM Overview"],
      ["/admin/crm/clients", "Clients"],
      ["/admin/crm/inbox", "Inbox"],
      ["/admin/crm/billing", "Billing"],
      ["/admin/crm/services", "Services"],
      ["/admin/crm/suppliers", "Suppliers"],
      ["/admin/crm/support", "Support"],
      ["/admin/crm/mapguard", "MapGuard Ops"],
      ["/admin/crm/rankflow", "RankFlow Ops"],
      ["/admin/crm/reviews", "Reviews"],
      ["/admin/crm/socialsync", "SocialSync Ops"],
      ["/admin/crm/contentflow", "ContentFlow"],
      ["/admin/crm/tradeline-ops", "TradeLine Ops"],
      ["/admin/crm/adflow", "AdFlow Ops"],
      ["/admin/crm/quotequick", "QuoteQuick"],
      ["/admin/crm/sales", "Sales Pipeline"],
      ["/admin/crm/profile", "Profile"],
      ["/admin/crm/settings", "Settings"],
      ["/admin/crm/change-password", "Change Password"],
      ["/admin/ai", "AI Dashboard"],
      ["/admin/booking", "Booking Calendar"],
      ["/admin/system/jobs", "System Jobs"],
      ["/admin/system/workers", "System Workers"],
      ["/admin/system/alerts", "System Alerts"],
      ["/admin/outbound/prospects", "Outbound Prospects"],
      ["/admin/outbound/campaigns", "Outbound Campaigns"],
      ["/admin/outbound/pipeline", "Outbound Pipeline"],
    ];
    for (const [url, name] of adminPages) await testPage(url, name, { cookie });

    console.log("\n── Admin APIs ──");
    await testAPI("/api/admin/crm/clients", "List clients", { cookie, expect: 200 });
    await testAPI("/api/admin/crm/quotequick/overview", "QQ overview", { cookie, expect: 200 });
    await testAPI("/api/admin/crm/tradeline/fleet", "TradeLine fleet", { cookie, expect: 200 });
    await testAPI("/api/admin/crm/tradeline/calls?limit=50", "TradeLine calls list", { cookie, expect: 200 });
    await testAPI("/api/admin/crm/tradeline/webhook-events", "TradeLine webhook events", { cookie, expect: 200 });
    await testAPI("/api/admin/crm/tradeline/cost-reconciliation", "TradeLine cost reconciliation", { cookie, expect: 200 });
    await testAPI("/api/admin/system/jobs?limit=5", "Job logs", { cookie, expect: 200 });
    await testAPI("/api/admin/system/workers", "Workers status", { cookie, expect: 200 });
    await testAPI("/api/admin/profit-overview", "Profit overview", { cookie, expect: 200 });
  }

  // ─── Group 4: Portal pages (will redirect to login if no client session) ───
  console.log("\n── Portal Pages (redirect check) ──");
  const portalPages = [
    ["/portal", "Portal Dashboard"],
    ["/portal/services", "Portal Services"],
    ["/portal/billing", "Portal Billing"],
    ["/portal/settings", "Portal Settings"],
    ["/portal/help", "Portal Help"],
    ["/portal/reviews", "Portal Reviews"],
    ["/portal/articles", "Portal Articles"],
    ["/portal/dispatch", "Portal Dispatch"],
    ["/portal/invoices", "Portal Invoices"],
  ];
  for (const [url, name] of portalPages) await testPage(url, name);

  // ─── Report ───
  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  RESULTS: ${results.tested} tested | ${results.passed} passed | ${results.failed} failed`);
  console.log("═══════════════════════════════════════════════════");

  if (results.errors.length > 0) {
    console.log("\n  FAILURES:");
    for (const err of results.errors) {
      console.log(`    [${err.type}] ${err.name} (${err.url}) → ${err.status}${err.message ? " " + err.message : ""}`);
    }
  } else {
    console.log("\n  ✓ ALL PAGES PASSED — No server errors detected!");
  }

  console.log("\n═══════════════════════════════════════════════════\n");
}

main().catch(console.error);
