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
  toggleSaved,
} = require("../script.js");

const root = path.join(__dirname, "..");
const publicJobsPath = path.join(root, "public", "data", "jobs.json");
const publicSourcesPath = path.join(root, "public", "data", "sources.json");
const publicMetaPath = path.join(root, "public", "data", "meta.json");
const jobs = JSON.parse(fs.readFileSync(publicJobsPath, "utf8"));
const sources = JSON.parse(fs.readFileSync(publicSourcesPath, "utf8"));
const meta = JSON.parse(fs.readFileSync(publicMetaPath, "utf8"));
const now = new Date("2026-06-30T12:00:00-04:00");

test("generated public data files exist and agree on counts", () => {
  for (const file of [publicJobsPath, publicSourcesPath, publicMetaPath]) {
    assert.ok(fs.existsSync(file), `${path.relative(root, file)} does not exist`);
  }
  assert.ok(jobs.length > 0);
  assert.equal(meta.jobCount, jobs.length);
  assert.equal(meta.sourceCount, sources.filter((source) => source.enabled).length);
  assert.equal(meta.okSourceCount, sources.filter((source) => source.enabled && source.ok).length);
  assert.equal(meta.failedSourceCount, sources.filter((source) => source.enabled && !source.ok).length);
});

test("normalized jobs satisfy the public schema", () => {
  const requiredStrings = [
    "id",
    "title",
    "company",
    "location",
    "workMode",
    "employmentType",
    "seniority",
    "source",
    "sourceId",
    "sourceAdapter",
    "category",
    "description",
    "applyUrl",
    "fetchedAt",
  ];
  const sourceIds = new Set(sources.map((source) => source.id));
  const ids = new Set();
  const allowed = {
    workMode: new Set(["Remote", "Hybrid", "On-site", "Unknown"]),
    employmentType: new Set(["Full-time", "Part-time", "Contract", "Internship", "Temporary", "Unknown"]),
    seniority: new Set(["Entry-Level", "Junior", "Mid-Level", "Senior", "Staff", "Manager", "Director", "Executive", "Unknown"]),
    category: new Set(["Software Engineering", "Data", "Infrastructure", "IT Support", "Technical Operations", "Business Systems", "Product", "Security", "QA", "Other"]),
    sourceAdapter: new Set(["greenhouse", "lever", "ashby"]),
  };

  for (const job of jobs) {
    for (const field of requiredStrings) {
      assert.equal(typeof job[field], "string", `${job.id} has invalid ${field}`);
      assert.ok(job[field].length > 0, `${job.id} has empty ${field}`);
    }
    assert.match(job.id, /^job-[a-f0-9]{20}$/);
    assert.ok(!ids.has(job.id), `duplicate id ${job.id}`);
    ids.add(job.id);
    assert.ok(sourceIds.has(job.sourceId), `${job.id} has unknown sourceId ${job.sourceId}`);
    for (const [field, values] of Object.entries(allowed)) {
      assert.ok(values.has(job[field]), `${job.id} has invalid ${field}: ${job[field]}`);
    }
    assert.ok(job.externalId === null || typeof job.externalId === "string");
    assert.ok(job.postedDate === null || /^\d{4}-\d{2}-\d{2}$/.test(job.postedDate));
    if (job.postedDate !== null) assert.ok(!Number.isNaN(Date.parse(`${job.postedDate}T00:00:00Z`)));
    assert.ok(job.salaryMin === null || typeof job.salaryMin === "number");
    assert.ok(job.salaryMax === null || typeof job.salaryMax === "number");
    assert.ok(job.salaryText === null || typeof job.salaryText === "string");
    assert.ok(Array.isArray(job.tags));
    assert.doesNotThrow(() => new URL(job.applyUrl));
  }
});

test("generated jobs are newest first with unknown dates last", () => {
  for (let index = 1; index < jobs.length; index += 1) {
    const previous = jobs[index - 1].postedDate;
    const current = jobs[index].postedDate;
    assert.ok(previous !== null || current === null, "known date appears after an unknown date");
    if (previous !== null && current !== null) {
      assert.ok(previous >= current, `${previous} appears before newer date ${current}`);
    }
  }
});

test("job age rules include an unknown state", () => {
  assert.equal(getJobAge("2026-06-30", now), 0);
  assert.equal(getJobAge("2026-06-29", now), 1);
  assert.equal(getJobAge(null, now), null);
  assert.equal(getAgeStatus(0), "new");
  assert.equal(getAgeStatus(3), "new");
  assert.equal(getAgeStatus(4), "fresh");
  assert.equal(getAgeStatus(7), "fresh");
  assert.equal(getAgeStatus(8), "aging");
  assert.equal(getAgeStatus(21), "aging");
  assert.equal(getAgeStatus(22), "old");
  assert.equal(getAgeStatus(null), "unknown");
  assert.equal(formatAge(null), "Age unknown");
});

test("average age ignores unknown dates", () => {
  const sample = [{ postedDate: "2026-06-30" }, { postedDate: "2026-06-28" }, { postedDate: null }];
  assert.equal(averageAge(sample, now), 1);
  assert.equal(averageAge([{ postedDate: null }], now), null);
  assert.equal(averageAge([], now), null);
});

test("filters operate on normalized live records", () => {
  const target = jobs.find((job) => job.workMode && job.category && job.source);
  assert.ok(target);
  const filtered = filterJobs(
    jobs,
    {
      ...EMPTY_FILTERS,
      keyword: target.title,
      workMode: [target.workMode],
      category: [target.category],
      source: [target.source],
    },
    now,
  );
  assert.ok(filtered.some((job) => job.id === target.id));

  const withAgeFilter = filterJobs(
    [{ ...target, postedDate: null }, { ...target, id: "known-date", postedDate: "2026-06-30" }],
    { ...EMPTY_FILTERS, maxAge: "7" },
    now,
  );
  assert.deepEqual(withAgeFilter.map((job) => job.id), ["known-date"]);
});

test("sorting keeps unknown dates and salaries last", () => {
  const fixture = [
    { id: "unknown", postedDate: null, salaryMin: null, salaryMax: null, company: "C", title: "C" },
    { id: "older", postedDate: "2026-06-20", salaryMin: 80_000, salaryMax: 100_000, company: "B", title: "B" },
    { id: "newer", postedDate: "2026-06-29", salaryMin: 120_000, salaryMax: 150_000, company: "A", title: "A" },
  ];
  assert.deepEqual(sortJobs(fixture, "newest", now).map((job) => job.id), ["newer", "older", "unknown"]);
  assert.deepEqual(sortJobs(fixture, "oldest", now).map((job) => job.id), ["older", "newer", "unknown"]);
  assert.deepEqual(sortJobs(fixture, "salary-high", now).map((job) => job.id), ["newer", "older", "unknown"]);
  assert.deepEqual(sortJobs(fixture, "salary-low", now).map((job) => job.id), ["older", "newer", "unknown"]);
});

test("stable normalized IDs remain valid local save keys", () => {
  const jobId = jobs[0].id;
  const saved = toggleSaved(new Set(), jobId);
  assert.deepEqual([...saved], [jobId]);
  assert.equal(toggleSaved(saved, jobId).size, 0);
  assert.equal(JSON.parse(JSON.stringify([...saved]))[0], jobId);
});

test("active filter count still covers scalar and multi-select filters", () => {
  assert.equal(
    activeFilterCount({
      ...EMPTY_FILTERS,
      keyword: "systems",
      workMode: ["Remote", "Hybrid"],
      salaryMin: 90_000,
      tags: ["SQL"],
    }),
    5,
  );
});

test("adapter normalization is deterministic and deduplicates equivalent records", async () => {
  const { dedupeJobs, normalizeGreenhouse } = await import("../scripts/fetch-jobs.mjs");
  const source = {
    id: "fixture_greenhouse",
    name: "Fixture Co",
    adapter: "greenhouse",
    tags: ["Data"],
  };
  const payload = {
    jobs: [
      {
        id: 42,
        title: "Data Systems Analyst",
        location: { name: "Remote, US" },
        departments: [{ name: "Business Technology" }],
        updated_at: "2026-06-30T10:00:00Z",
        content: "<p>Build SQL and Python data pipelines.</p>",
        absolute_url: "https://boards.greenhouse.io/fixture/jobs/42?gh_src=test",
      },
    ],
  };
  const first = normalizeGreenhouse(source, payload, "2026-06-30T12:00:00Z")[0];
  const second = normalizeGreenhouse(source, payload, "2026-07-01T12:00:00Z")[0];
  assert.equal(first.id, second.id);
  assert.equal(first.description, "Build SQL and Python data pipelines.");
  assert.equal(first.workMode, "Remote");
  assert.equal(first.category, "Business Systems");
  assert.deepEqual(dedupeJobs([first, second]).map((job) => job.id), [first.id]);
});
