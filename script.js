(function () {
  "use strict";

  const STORAGE_KEYS = {
    filters: "goodjob.filters.v1",
    sort: "goodjob.sort.v1",
    saved: "goodjob.saved.v1",
  };

  const EMPTY_FILTERS = {
    keyword: "",
    location: "",
    workMode: [],
    employmentType: [],
    seniority: [],
    category: [],
    salaryMin: 0,
    maxAge: "",
    source: [],
    tags: [],
  };

  function parseLocalDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function startOfUtcDay(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  }

  function getJobAge(postedDate, now = new Date()) {
    const posted = parseLocalDate(postedDate);
    const today = startOfUtcDay(now);
    return Math.max(0, Math.floor((today - posted) / 86400000));
  }

  function getAgeStatus(age) {
    if (age <= 3) return "new";
    if (age <= 7) return "fresh";
    if (age <= 21) return "aging";
    return "old";
  }

  function formatAge(age) {
    if (age === 0) return "Posted today";
    if (age === 1) return "1 day old";
    if (age >= 30) return "30+ days old";
    return `${age} days old`;
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function includesEvery(selected, values) {
    if (!selected.length) return true;
    const haystack = values.map(normalize);
    return selected.every((item) => haystack.includes(normalize(item)));
  }

  function includesAny(selected, value) {
    if (!selected.length) return true;
    return selected.some((item) => normalize(item) === normalize(value));
  }

  function filterJobs(jobs, filters, now = new Date()) {
    const state = { ...EMPTY_FILTERS, ...filters };
    const keyword = normalize(state.keyword);
    const location = normalize(state.location);
    const salaryFloor = Number(state.salaryMin) || 0;
    const maxAge = state.maxAge === "" ? null : Number(state.maxAge);

    return jobs.filter((job) => {
      const searchable = [
        job.title,
        job.company,
        job.description,
        job.category,
        ...(job.tags || []),
      ]
        .map(normalize)
        .join(" ");

      if (keyword && !searchable.includes(keyword)) return false;
      if (location && !normalize(job.location).includes(location)) return false;
      if (!includesAny(state.workMode, job.workMode)) return false;
      if (!includesAny(state.employmentType, job.employmentType)) return false;
      if (!includesAny(state.seniority, job.seniority)) return false;
      if (!includesAny(state.category, job.category)) return false;
      if (!includesAny(state.source, job.source)) return false;
      if (!includesEvery(state.tags, job.tags || [])) return false;
      if (salaryFloor && Number(job.salaryMin || 0) < salaryFloor) return false;
      if (maxAge !== null && getJobAge(job.postedDate, now) > maxAge) return false;
      return true;
    });
  }

  function sortJobs(jobs, sortBy, now = new Date()) {
    const sorted = [...jobs];
    const collator = new Intl.Collator("en", { sensitivity: "base" });

    const sorters = {
      newest: (a, b) => getJobAge(a.postedDate, now) - getJobAge(b.postedDate, now),
      oldest: (a, b) => getJobAge(b.postedDate, now) - getJobAge(a.postedDate, now),
      "salary-high": (a, b) => Number(b.salaryMax || 0) - Number(a.salaryMax || 0),
      "salary-low": (a, b) => Number(a.salaryMin || 0) - Number(b.salaryMin || 0),
      company: (a, b) => collator.compare(a.company, b.company),
      title: (a, b) => collator.compare(a.title, b.title),
    };

    return sorted.sort(sorters[sortBy] || sorters.newest);
  }

  function averageAge(jobs, now = new Date()) {
    if (!jobs.length) return 0;
    const sum = jobs.reduce((total, job) => total + getJobAge(job.postedDate, now), 0);
    return Math.round(sum / jobs.length);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatSalary(job) {
    if (job.salaryText) return job.salaryText;
    if (!job.salaryMin && !job.salaryMax) return "Salary not listed";
    const format = (amount) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(amount);
    return `${format(job.salaryMin)} – ${format(job.salaryMax)}`;
  }

  function uniqueSorted(jobs, property) {
    return [...new Set(jobs.map((job) => job[property]).filter(Boolean))].sort();
  }

  function uniqueTags(jobs) {
    const counts = new Map();
    jobs.flatMap((job) => job.tags || []).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 14)
      .map(([tag]) => tag);
  }

  function activeFilterCount(filters) {
    return (
      Number(Boolean(filters.keyword)) +
      Number(Boolean(filters.location)) +
      Number(Boolean(Number(filters.salaryMin))) +
      Number(filters.maxAge !== "") +
      filters.workMode.length +
      filters.employmentType.length +
      filters.seniority.length +
      filters.category.length +
      filters.source.length +
      filters.tags.length
    );
  }

  const exported = {
    EMPTY_FILTERS,
    getJobAge,
    getAgeStatus,
    formatAge,
    filterJobs,
    sortJobs,
    averageAge,
    activeFilterCount,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }

  if (typeof document === "undefined") return;

  const state = {
    jobs: [],
    filteredJobs: [],
    filters: structuredClone(EMPTY_FILTERS),
    sort: "newest",
    saved: new Set(),
    expanded: new Set(),
    now: new Date(),
  };

  const elements = {};

  function cacheElements() {
    [
      "keyword-search",
      "location-search",
      "salary-minimum",
      "age-select",
      "sort-select",
      "work-mode-options",
      "employment-options",
      "seniority-options",
      "category-options",
      "source-options",
      "tag-options",
      "active-filters",
      "job-list",
      "empty-state",
      "error-state",
      "filter-panel",
      "filter-scrim",
      "filter-toggle",
      "mobile-filter-count",
      "drawer-filter-count",
      "result-heading-count",
      "results-summary",
      "show-results",
      "toast",
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  function loadStoredState() {
    try {
      const filters = JSON.parse(localStorage.getItem(STORAGE_KEYS.filters));
      if (filters && typeof filters === "object") {
        state.filters = {
          ...structuredClone(EMPTY_FILTERS),
          ...filters,
          workMode: Array.isArray(filters.workMode) ? filters.workMode : [],
          employmentType: Array.isArray(filters.employmentType) ? filters.employmentType : [],
          seniority: Array.isArray(filters.seniority) ? filters.seniority : [],
          category: Array.isArray(filters.category) ? filters.category : [],
          source: Array.isArray(filters.source) ? filters.source : [],
          tags: Array.isArray(filters.tags) ? filters.tags : [],
        };
      }
      state.sort = localStorage.getItem(STORAGE_KEYS.sort) || "newest";
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.saved));
      state.saved = new Set(Array.isArray(saved) ? saved : []);
    } catch {
      state.filters = structuredClone(EMPTY_FILTERS);
      state.sort = "newest";
      state.saved = new Set();
    }
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(state.filters));
      localStorage.setItem(STORAGE_KEYS.sort, state.sort);
      localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify([...state.saved]));
    } catch {
      showToast("Your browser blocked local preferences.");
    }
  }

  function optionMarkup(group, values, selected) {
    return values
      .map((value) => {
        const id = `${group}-${value}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const count = state.jobs.filter((job) => {
          if (group === "tags") return (job.tags || []).includes(value);
          return normalize(job[group]) === normalize(value);
        }).length;
        return `
          <label class="check-option" for="${id}">
            <input
              id="${id}"
              type="checkbox"
              data-filter-group="${escapeHtml(group)}"
              value="${escapeHtml(value)}"
              ${selected.includes(value) ? "checked" : ""}
            />
            <span class="custom-check" aria-hidden="true"></span>
            <span>${escapeHtml(value)}</span>
            <small>${count}</small>
          </label>`;
      })
      .join("");
  }

  function buildFilterOptions() {
    elements["work-mode-options"].innerHTML = optionMarkup(
      "workMode",
      ["Remote", "Hybrid", "On-site"],
      state.filters.workMode,
    );
    elements["employment-options"].innerHTML = optionMarkup(
      "employmentType",
      uniqueSorted(state.jobs, "employmentType"),
      state.filters.employmentType,
    );
    elements["seniority-options"].innerHTML = optionMarkup(
      "seniority",
      uniqueSorted(state.jobs, "seniority"),
      state.filters.seniority,
    );
    elements["category-options"].innerHTML = optionMarkup(
      "category",
      uniqueSorted(state.jobs, "category"),
      state.filters.category,
    );
    elements["source-options"].innerHTML = optionMarkup(
      "source",
      uniqueSorted(state.jobs, "source"),
      state.filters.source,
    );
    elements["tag-options"].innerHTML = optionMarkup("tags", uniqueTags(state.jobs), state.filters.tags);
  }

  function syncControls() {
    elements["keyword-search"].value = state.filters.keyword;
    elements["location-search"].value = state.filters.location;
    elements["salary-minimum"].value = state.filters.salaryMin || "";
    elements["age-select"].value = String(state.filters.maxAge);
    elements["sort-select"].value = state.sort;

    document.querySelectorAll("[data-filter-group]").forEach((input) => {
      const group = input.dataset.filterGroup;
      input.checked = state.filters[group].includes(input.value);
    });
  }

  function getFilterChips() {
    const chips = [];
    if (state.filters.keyword) chips.push({ group: "keyword", label: `Search: ${state.filters.keyword}` });
    if (state.filters.location) chips.push({ group: "location", label: state.filters.location });
    if (state.filters.salaryMin) {
      chips.push({
        group: "salaryMin",
        label: `$${Math.round(Number(state.filters.salaryMin) / 1000)}k+`,
      });
    }
    if (state.filters.maxAge !== "") {
      chips.push({
        group: "maxAge",
        label: Number(state.filters.maxAge) === 0 ? "Posted today" : `Last ${state.filters.maxAge} days`,
      });
    }
    ["workMode", "employmentType", "seniority", "category", "source", "tags"].forEach((group) => {
      state.filters[group].forEach((value) => chips.push({ group, value, label: value }));
    });
    return chips;
  }

  function renderActiveFilters() {
    const chips = getFilterChips();
    if (!chips.length) {
      elements["active-filters"].innerHTML = "";
      elements["active-filters"].hidden = true;
      return;
    }

    elements["active-filters"].hidden = false;
    elements["active-filters"].innerHTML = `
      <div class="chip-list">
        ${chips
          .map(
            (chip) => `
              <button class="filter-chip" type="button" data-remove-group="${escapeHtml(chip.group)}" ${
                chip.value ? `data-remove-value="${escapeHtml(chip.value)}"` : ""
              }>
                ${escapeHtml(chip.label)}
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
                <span class="sr-only">Remove ${escapeHtml(chip.label)} filter</span>
              </button>`,
          )
          .join("")}
      </div>
      <button class="text-button clear-all-chips" type="button" data-clear-all>Clear all</button>`;
  }

  function icon(name) {
    const paths = {
      location: '<path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>',
      building: '<path d="M4 21V5h10v16M14 9h6v12M8 9h2m-2 4h2m-2 4h2m8-4h1m-1 4h1M2 21h20"/>',
      mode: '<path d="M4 7h16v10H4zM8 21h8m-4-4v4"/>',
      link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
      chevron: '<path d="m7 10 5 5 5-5"/>',
      bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
      external: '<path d="M14 4h6v6m0-6-9 9"/><path d="M18 13v7H4V6h7"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  }

  function jobCardMarkup(job) {
    const age = getJobAge(job.postedDate, state.now);
    const status = getAgeStatus(age);
    const expanded = state.expanded.has(job.id);
    const saved = state.saved.has(job.id);
    const tags = (job.tags || []).slice(0, 5);
    const remainingTags = Math.max(0, (job.tags || []).length - tags.length);

    return `
      <article class="job-card ${expanded ? "is-expanded" : ""}" id="${escapeHtml(job.id)}">
        <div class="job-card-main">
          <div class="company-monogram" aria-hidden="true">${escapeHtml(
            job.company
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word[0])
              .join("")
              .toUpperCase(),
          )}</div>
          <div class="job-primary">
            <div class="job-title-row">
              <div>
                <h2>${escapeHtml(job.title)}</h2>
                <p class="company-name">${escapeHtml(job.company)}</p>
              </div>
              <button
                class="icon-button save-button ${saved ? "is-saved" : ""}"
                type="button"
                data-action="save"
                data-job-id="${escapeHtml(job.id)}"
                aria-label="${saved ? "Unsave" : "Save"} ${escapeHtml(job.title)}"
                aria-pressed="${saved}"
              >${icon("bookmark")}</button>
            </div>
            <p class="job-location">
              <span>${icon("location")}${escapeHtml(job.location)}</span>
              <span>${icon("mode")}${escapeHtml(job.workMode)}</span>
            </p>
            <div class="tag-list">
              ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
              ${remainingTags ? `<span>+${remainingTags}</span>` : ""}
            </div>
          </div>
          <div class="job-salary">
            <strong>${escapeHtml(formatSalary(job))}</strong>
            <span>${escapeHtml(job.employmentType)}</span>
          </div>
          <dl class="job-facts">
            <div><dt>Level</dt><dd>${escapeHtml(job.seniority)}</dd></div>
            <div><dt>Category</dt><dd>${escapeHtml(job.category)}</dd></div>
            <div><dt>Source</dt><dd>${escapeHtml(job.source)}</dd></div>
          </dl>
          <div class="job-actions">
            <div class="job-age">
              <span class="age-pill age-${status}">${status[0].toUpperCase() + status.slice(1)}</span>
              <small>${escapeHtml(formatAge(age))}</small>
            </div>
            <div class="action-row">
              <button
                class="icon-button desktop-save ${saved ? "is-saved" : ""}"
                type="button"
                data-action="save"
                data-job-id="${escapeHtml(job.id)}"
                aria-label="${saved ? "Unsave" : "Save"} ${escapeHtml(job.title)}"
                aria-pressed="${saved}"
              >${icon("bookmark")}</button>
              <button
                class="icon-button copy-button"
                type="button"
                data-action="copy"
                data-job-id="${escapeHtml(job.id)}"
                aria-label="Copy link to ${escapeHtml(job.title)}"
              >${icon("link")}</button>
              <button
                class="icon-button expand-button"
                type="button"
                data-action="expand"
                data-job-id="${escapeHtml(job.id)}"
                aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(job.title)} details"
                aria-expanded="${expanded}"
              >${icon("chevron")}</button>
            </div>
            <a class="apply-button" href="${escapeHtml(job.applyUrl)}" target="_blank" rel="noopener noreferrer">
              Apply ${icon("external")}
            </a>
          </div>
        </div>
        <div class="job-details" ${expanded ? "" : "hidden"}>
          <div>
            <h3>About this role</h3>
            <p>${escapeHtml(job.description)}</p>
          </div>
          <dl>
            <div><dt>Posted</dt><dd>${escapeHtml(job.postedDate)}</dd></div>
            <div><dt>Employment</dt><dd>${escapeHtml(job.employmentType)}</dd></div>
            <div><dt>Work mode</dt><dd>${escapeHtml(job.workMode)}</dd></div>
          </dl>
        </div>
      </article>`;
  }

  function renderJobs() {
    elements["job-list"].innerHTML = state.filteredJobs.map(jobCardMarkup).join("");
    elements["empty-state"].hidden = state.filteredJobs.length !== 0;
    elements["job-list"].hidden = state.filteredJobs.length === 0;
  }

  function renderStats() {
    const newCount = state.jobs.filter((job) => getJobAge(job.postedDate, state.now) <= 3).length;
    const remoteCount = state.jobs.filter((job) => job.workMode === "Remote").length;
    const resultCount = state.filteredJobs.length;
    document.getElementById("total-stat").textContent = state.jobs.length;
    document.getElementById("new-stat").textContent = newCount;
    document.getElementById("remote-stat").textContent = remoteCount;
    document.getElementById("age-stat").textContent = `${averageAge(state.filteredJobs, state.now)} days`;
    document.getElementById("saved-stat").textContent = state.saved.size;
    document.getElementById("result-stat").textContent = resultCount;
    elements["result-heading-count"].textContent = resultCount;
    elements["results-summary"].textContent =
      resultCount === state.jobs.length
        ? "Showing every sample listing."
        : `Showing ${resultCount} of ${state.jobs.length} sample listings.`;

    const count = activeFilterCount(state.filters);
    [elements["mobile-filter-count"], elements["drawer-filter-count"]].forEach((badge) => {
      badge.textContent = count;
      badge.hidden = count === 0;
    });
    elements["show-results"].textContent = `Show ${resultCount} ${resultCount === 1 ? "job" : "jobs"}`;
  }

  function applyAndRender() {
    state.filteredJobs = sortJobs(filterJobs(state.jobs, state.filters, state.now), state.sort, state.now);
    persistState();
    renderActiveFilters();
    renderStats();
    renderJobs();
  }

  function clearFilters() {
    state.filters = structuredClone(EMPTY_FILTERS);
    syncControls();
    applyAndRender();
  }

  function removeFilter(group, value) {
    if (Array.isArray(state.filters[group])) {
      state.filters[group] = state.filters[group].filter((item) => item !== value);
    } else {
      state.filters[group] = group === "salaryMin" ? 0 : "";
    }
    syncControls();
    applyAndRender();
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2400);
  }

  async function copyJobLink(jobId) {
    const url = `${window.location.href.split("#")[0]}#${jobId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    showToast("Job link copied.");
  }

  function openFilters() {
    document.body.classList.add("filters-open");
    elements["filter-panel"].classList.add("is-open");
    elements["filter-scrim"].hidden = false;
    elements["filter-toggle"].setAttribute("aria-expanded", "true");
    document.getElementById("close-filters").focus();
  }

  function closeFilters() {
    document.body.classList.remove("filters-open");
    elements["filter-panel"].classList.remove("is-open");
    elements["filter-scrim"].hidden = true;
    elements["filter-toggle"].setAttribute("aria-expanded", "false");
  }

  function bindEvents() {
    elements["keyword-search"].addEventListener("input", (event) => {
      state.filters.keyword = event.target.value.trim();
      applyAndRender();
    });
    elements["location-search"].addEventListener("input", (event) => {
      state.filters.location = event.target.value.trim();
      applyAndRender();
    });
    elements["salary-minimum"].addEventListener("input", (event) => {
      state.filters.salaryMin = Math.max(0, Number(event.target.value) || 0);
      applyAndRender();
    });
    elements["age-select"].addEventListener("change", (event) => {
      state.filters.maxAge = event.target.value;
      applyAndRender();
    });
    elements["sort-select"].addEventListener("change", (event) => {
      state.sort = event.target.value;
      applyAndRender();
    });

    elements["filter-panel"].addEventListener("change", (event) => {
      const input = event.target.closest("[data-filter-group]");
      if (!input) return;
      const group = input.dataset.filterGroup;
      const values = new Set(state.filters[group]);
      input.checked ? values.add(input.value) : values.delete(input.value);
      state.filters[group] = [...values];
      applyAndRender();
    });

    elements["active-filters"].addEventListener("click", (event) => {
      const chip = event.target.closest("[data-remove-group]");
      if (chip) removeFilter(chip.dataset.removeGroup, chip.dataset.removeValue);
      if (event.target.closest("[data-clear-all]")) clearFilters();
    });

    elements["job-list"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const jobId = button.dataset.jobId;
      if (button.dataset.action === "save") {
        state.saved.has(jobId) ? state.saved.delete(jobId) : state.saved.add(jobId);
        applyAndRender();
      }
      if (button.dataset.action === "copy") copyJobLink(jobId);
      if (button.dataset.action === "expand") {
        state.expanded.has(jobId) ? state.expanded.delete(jobId) : state.expanded.add(jobId);
        renderJobs();
      }
    });

    ["clear-filters-top", "clear-filters-bottom", "empty-clear"].forEach((id) => {
      document.getElementById(id).addEventListener("click", clearFilters);
    });
    document.getElementById("retry-load").addEventListener("click", loadJobs);
    elements["filter-toggle"].addEventListener("click", openFilters);
    document.getElementById("close-filters").addEventListener("click", closeFilters);
    elements["filter-scrim"].addEventListener("click", closeFilters);
    elements["show-results"].addEventListener("click", closeFilters);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("filters-open")) closeFilters();
    });
  }

  function openHashJob() {
    const jobId = window.location.hash.slice(1);
    if (!jobId || !state.jobs.some((job) => job.id === jobId)) return;
    state.expanded.add(jobId);
    renderJobs();
    requestAnimationFrame(() => document.getElementById(jobId)?.scrollIntoView({ block: "center" }));
  }

  async function loadJobs() {
    elements["error-state"].hidden = true;
    try {
      const response = await fetch("./jobs.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const jobs = await response.json();
      if (!Array.isArray(jobs) || !jobs.length) throw new Error("Job data is empty");
      state.jobs = jobs;
      buildFilterOptions();
      syncControls();
      applyAndRender();
      openHashJob();
    } catch (error) {
      console.error("GoodJob data load failed:", error);
      elements["job-list"].hidden = true;
      elements["empty-state"].hidden = true;
      elements["error-state"].hidden = false;
      elements["results-summary"].textContent = "Job data is unavailable.";
    }
  }

  function init() {
    cacheElements();
    loadStoredState();
    bindEvents();
    loadJobs();
  }

  init();
})();
