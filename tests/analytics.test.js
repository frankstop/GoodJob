const test = require("node:test");
const assert = require("node:assert/strict");

const { createAnalytics } = require("../analytics.js");

test("trackEvent adds app context and sends GA4 event", () => {
  const calls = [];
  const analytics = createAnalytics({
    GOODJOB_VERSION: "1.0.0",
    gtag: (...args) => calls.push(args),
  });

  assert.equal(analytics.trackEvent("job_search", { search_length: 4, app_name: "wrong" }), true);
  assert.deepEqual(calls, [
    [
      "event",
      "job_search",
      {
        search_length: 4,
        app_name: "GoodJob",
        app_version: "1.0.0",
      },
    ],
  ]);
});

test("trackEvent safely skips missing or blocked gtag", () => {
  assert.equal(createAnalytics({}).trackEvent("app_loaded"), false);
  assert.equal(
    createAnalytics({
      gtag: () => {
        throw new Error("blocked");
      },
    }).trackEvent("app_loaded"),
    false,
  );
});

test("debug logging requires DEBUG_ANALYTICS flag", () => {
  const logs = [];
  const target = {
    console: { debug: (...args) => logs.push(args) },
  };
  const analytics = createAnalytics(target);

  analytics.trackEvent("app_loaded");
  assert.equal(logs.length, 0);

  target.DEBUG_ANALYTICS = true;
  analytics.trackEvent("app_loaded");
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[GoodJob analytics] skipped app_loaded");
  assert.match(logs[0][1], /"app_name":"GoodJob"/);
});

test("trackEvent omits unavailable optional values", () => {
  const calls = [];
  const analytics = createAnalytics({
    gtag: (...args) => calls.push(args),
  });

  analytics.trackEvent("job_card_opened", {
    salary_min: null,
    salary_max: undefined,
  });

  assert.deepEqual(calls[0][2], {
    app_name: "GoodJob",
    app_version: "unknown",
  });
});
