const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  EMPTY_FILTERS,
  getJobAge,
  getAgeStatus,
  formatAge,
  filterJobs,
  sortJobs,
  averageAge,
  activeFilterCount,
} = require("../script.js");

const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "jobs.json"), "utf8"));
const now = new Date("2026-06-29T12:00:00-04:00");

test("job age uses calendar days and formats key states", () => {
  assert.equal(getJobAge("2026-06-29", now), 0);
  assert.equal(getJobAge("2026-06-28", now), 1);
  assert.equal(getJobAge("2026-06-20", now), 9);
  assert.equal(formatAge(0), "Posted today");
  assert.equal(formatAge(1), "1 day old");
  assert.equal(formatAge(30), "30+ days old");
});

test("age bands match the product rules", () => {
  assert.equal(getAgeStatus(0), "new");
  assert.equal(getAgeStatus(3), "new");
  assert.equal(getAgeStatus(4), "fresh");
  assert.equal(getAgeStatus(7), "fresh");
  assert.equal(getAgeStatus(8), "aging");
  assert.equal(getAgeStatus(21), "aging");
  assert.equal(getAgeStatus(22), "old");
});

test("filters combine with AND logic across groups", () => {
  const filtered = filterJobs(
    jobs,
    {
      ...EMPTY_FILTERS,
      keyword: "python",
      workMode: ["Remote"],
      category: ["Automation Engineer"],
      salaryMin: 90000,
      maxAge: "30",
      source: ["Company Careers"],
    },
    now,
  );

  assert.deepEqual(
    filtered.map((job) => job.id),
    ["job-015"],
  );
});

test("multiple values within one filter group use OR logic", () => {
  const filtered = filterJobs(
    jobs,
    { ...EMPTY_FILTERS, workMode: ["Remote", "Hybrid"] },
    now,
  );
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((job) => ["Remote", "Hybrid"].includes(job.workMode)));
});

test("selected tags require every selected tag", () => {
  const filtered = filterJobs(
    jobs,
    { ...EMPTY_FILTERS, tags: ["SQL", "Python"] },
    now,
  );
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((job) => job.tags.includes("SQL") && job.tags.includes("Python")));
});

test("sorting is applied after filtering", () => {
  const remoteJobs = filterJobs(jobs, { ...EMPTY_FILTERS, workMode: ["Remote"] }, now);
  const bySalary = sortJobs(remoteJobs, "salary-high", now);
  const byCompany = sortJobs(remoteJobs, "company", now);

  assert.equal(bySalary[0].id, "job-024");
  assert.deepEqual(
    byCompany.map((job) => job.company),
    [...byCompany.map((job) => job.company)].sort((a, b) => a.localeCompare(b)),
  );
});

test("average age reflects the current result set", () => {
  const sample = jobs.filter((job) => ["job-001", "job-002", "job-003"].includes(job.id));
  assert.equal(averageAge(sample, now), 1);
  assert.equal(averageAge([], now), 0);
});

test("active filter count includes scalar and multi-select filters", () => {
  assert.equal(
    activeFilterCount({
      ...EMPTY_FILTERS,
      keyword: "systems",
      workMode: ["Remote", "Hybrid"],
      salaryMin: 90000,
      tags: ["SQL"],
    }),
    5,
  );
});

test("sample dataset meets the required shape and breadth", () => {
  const requiredFields = [
    "id",
    "title",
    "company",
    "location",
    "workMode",
    "employmentType",
    "seniority",
    "salaryMin",
    "salaryMax",
    "salaryText",
    "postedDate",
    "source",
    "category",
    "tags",
    "description",
    "applyUrl",
  ];

  assert.ok(jobs.length >= 20);
  for (const job of jobs) {
    for (const field of requiredFields) assert.ok(field in job, `${job.id} is missing ${field}`);
    assert.match(job.id, /^job-\d{3}$/);
    assert.match(job.postedDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(job.tags) && job.tags.length > 0);
    assert.ok(job.applyUrl.startsWith("https://"));
  }

  const categories = new Set(jobs.map((job) => job.category));
  [
    "Software Engineering",
    "Data Analyst",
    "IT Support",
    "Systems Administrator",
    "Infrastructure Engineer",
    "Automation Engineer",
    "Application Support",
    "Technical Operations",
    "Business Systems Analyst",
  ].forEach((category) => assert.ok(categories.has(category), `Missing category: ${category}`));
});
