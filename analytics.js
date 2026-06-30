(function (root, factory) {
  "use strict";

  const analytics = factory(root);
  if (root) root.GoodJobAnalytics = analytics;
  if (typeof module !== "undefined" && module.exports) module.exports = analytics;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const APP_NAME = "GoodJob";

  function getAppVersion(target) {
    const configuredVersion = target?.GOODJOB_VERSION;
    if (typeof configuredVersion === "string" && configuredVersion.trim()) {
      return configuredVersion.trim();
    }

    const metaVersion = target?.document?.querySelector?.('meta[name="app-version"]')?.content;
    return typeof metaVersion === "string" && metaVersion.trim() ? metaVersion.trim() : "unknown";
  }

  function createAnalytics(target = root) {
    function debugLog(status, eventName, detail) {
      if (target?.DEBUG_ANALYTICS === true && typeof target?.console?.debug === "function") {
        let serializedDetail = "";
        try {
          serializedDetail = JSON.stringify(detail);
        } catch {
          serializedDetail = String(detail);
        }
        target.console.debug(`[GoodJob analytics] ${status} ${eventName}`, serializedDetail);
      }
    }

    function trackEvent(eventName, params = {}) {
      if (typeof eventName !== "string" || !eventName.trim()) return false;

      const payload = {
        ...params,
        app_name: APP_NAME,
        app_version: getAppVersion(target),
      };

      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined || payload[key] === null) delete payload[key];
      });

      if (typeof target?.gtag !== "function") {
        debugLog("skipped", eventName, payload);
        return false;
      }

      try {
        target.gtag("event", eventName, payload);
        debugLog("sent", eventName, payload);
        return true;
      } catch (error) {
        debugLog("failed", eventName, { message: error?.message || String(error) });
        return false;
      }
    }

    return { trackEvent };
  }

  return {
    ...createAnalytics(root),
    createAnalytics,
  };
});
