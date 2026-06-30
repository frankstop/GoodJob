import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = resolve(ROOT, "config/sources.json");
const PUBLIC_DATA_DIR = resolve(ROOT, "public/data");
const RAW_DATA_DIR = resolve(ROOT, "data/raw");
const SNAPSHOT_DIR = resolve(ROOT, "data/snapshots");
const USER_AGENT = "GoodJob ATS indexer (https://github.com/frankstop/GoodJob)";
const DESCRIPTION_LIMIT = 520;

const CATEGORY_RULES = [
  ["Business Systems", /\b(business systems?|enterprise systems?|erp|crm|salesforce|workday|netsuite|business applications?|systems? analyst)\b/i],
  ["IT Support", /\b(help\s?desk|service desk|desktop support|it support|technical support|support engineer|end user|field technician)\b/i],
  ["Security", /\b(security|cyber|soc analyst|incident response|iam|identity and access|threat|vulnerability)\b/i],
  ["QA", /\b(quality assurance|qa\b|test automation|software test|sdet|quality engineer)\b/i],
  ["Infrastructure", /\b(infrastructure|platform engineer|site reliability|sre\b|devops|cloud engineer|network engineer|systems administrator|sysadmin|database administrator|dba\b)\b/i],
  ["Technical Operations", /\b(technical operations?|tech ops|it operations?|production operations?|implementation|solutions engineer|systems engineer|noc\b|operations engineer)\b/i],
  ["Data", /\b(data|analytics|business intelligence|\bbi\b|machine learning|\bml\b|artificial intelligence|\bai\b|quantitative)\b/i],
  ["Product", /\b(product manager|product owner|product operations?|technical program manager)\b/i],
  ["Software Engineering", /\b(software|developer|frontend|front-end|backend|back-end|fullstack|full-stack|mobile engineer|ios engineer|android engineer|web engineer)\b/i],
];

const TAG_RULES = [
  ["Python", /\bpython\b/i],
  ["SQL", /\bsql\b|postgres|mysql|snowflake|bigquery/i],
  ["React", /\breact(?:\.js)?\b/i],
  ["JavaScript", /\bjavascript\b|\bnode(?:\.js)?\b/i],
  ["TypeScript", /\btypescript\b/i],
  ["Java", /\bjava\b/i],
  ["AWS", /\baws\b|amazon web services/i],
  ["Azure", /\bazure\b/i],
  ["GCP", /\bgcp\b|google cloud/i],
  ["Linux", /\blinux\b/i],
  ["Helpdesk", /\bhelp\s?desk\b|service desk|desktop support/i],
  ["POS", /\bpos\b|point of sale/i],
  ["Data Pipelines", /\bdata pipelines?\b|\betl\b|\bairflow\b|\bdbt\b/i],
  ["BI", /\bbusiness intelligence\b|\bpower bi\b|\btableau\b|\blooker\b/i],
  ["Analytics", /\banalytics?\b/i],
  ["Systems", /\bsystems?\b|sysadmin/i],
  ["Networking", /\bnetwork(?:ing)?\b|\btcp\/ip\b|\bdns\b/i],
  ["Security", /\bsecurity\b|\bcyber\b|\biam\b/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Docker", /\bdocker\b|containers?\b/i],
  ["Terraform", /\bterraform\b|infrastructure as code/i],
  ["Salesforce", /\bsalesforce\b/i],
  ["Workday", /\bworkday\b/i],
  ["ServiceNow", /\bservicenow\b/i],
  ["Jira", /\bjira\b/i],
];

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function plainText(value, limit = DESCRIPTION_LIMIT) {
  const text = decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  const shortened = text.slice(0, limit + 1).replace(/\s+\S*$/, "").trim();
  return `${shortened || text.slice(0, limit).trim()}…`;
}

function normalizedText(value) {
  return plainText(value, Number.MAX_SAFE_INTEGER).toLowerCase();
}

function stableId(parts) {
  const hash = createHash("sha256")
    .update(parts.map((part) => String(part ?? "").trim().toLowerCase()).join("|"))
    .digest("hex")
    .slice(0, 20);
  return `job-${hash}`;
}

export function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gh_src|source|ref|lever-source)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return String(value ?? "").trim();
  }
}

function listText(values, property = "name") {
  return (Array.isArray(values) ? values : [])
    .map((value) => plainText(typeof value === "object" ? value?.[property] : value))
    .filter(Boolean)
    .join(", ");
}

function classifyCategory(title, department, description) {
  const primary = `${title} ${department}`;
  const primaryMatch = CATEGORY_RULES.find(([, pattern]) => pattern.test(primary));
  if (primaryMatch) return primaryMatch[0];
  return "Other";
}

export function inferWorkMode(location, title = "", description = "", explicit = "") {
  const haystack = `${explicit} ${location} ${title} ${description.slice(0, 800)}`;
  if (/\bhybrid\b/i.test(haystack)) return "Hybrid";
  if (/\b(remote|distributed|work from home|anywhere)\b/i.test(haystack)) return "Remote";
  if (/\b(on[\s-]?site|in[\s-]?office)\b/i.test(haystack)) return "On-site";
  return location && !/^(unknown|multiple locations?)$/i.test(location) ? "On-site" : "Unknown";
}

export function inferEmploymentType(value, title = "", description = "") {
  const haystack = `${value} ${title} ${description.slice(0, 500)}`;
  if (/\bpart[\s-]?time\b/i.test(haystack)) return "Part-time";
  if (/\b(contract|contractor|freelance)\b/i.test(haystack)) return "Contract";
  if (/\b(intern|internship|co[\s-]?op)\b/i.test(haystack)) return "Internship";
  if (/\b(temporary|temp\b|seasonal)\b/i.test(haystack)) return "Temporary";
  if (/\bfull[\s-]?time\b/i.test(haystack)) return "Full-time";
  return "Unknown";
}

export function inferSeniority(title) {
  if (/\b(chief|c(?:io|to|iso|do)|president|[ase]vp|vice president|head of)\b/i.test(title) || /^\s*vp\b/i.test(title)) {
    return "Executive";
  }
  if (/\b(director)\b/i.test(title)) return "Director";
  if (/\b(manager|managerial|lead manager)\b/i.test(title)) return "Manager";
  if (/\b(staff|principal|distinguished|architect)\b/i.test(title)) return "Staff";
  if (/\b(senior|sr\.?|lead)\b/i.test(title)) return "Senior";
  if (/\b(junior|jr\.?)\b/i.test(title)) return "Junior";
  if (/\b(entry[\s-]?level|associate|new grad|graduate)\b/i.test(title)) return "Entry-Level";
  if (/\b(engineer|developer|analyst|administrator|specialist|consultant|scientist|designer)\b/i.test(title)) return "Mid-Level";
  return "Unknown";
}

function salaryCandidates(item, description) {
  return [
    item.salaryText,
    item.compensation,
    item.compensationTierSummary,
    item.payRange,
    item.salaryRange,
    item.compensation?.summary,
    item.compensation?.scrapeableCompensationSalarySummary,
    description,
  ].filter((value) => typeof value === "string" && value.trim());
}

export function parseSalary(item, description = "") {
  const annualRange =
    /(?:USD\s*)?\$\s*([\d,.]+)\s*(?:k|K)?\s*(?:-|–|—|to)\s*(?:USD\s*)?\$\s*([\d,.]+)\s*(?:k|K)?(?:\s*(?:USD|per year|\/\s*year|annually))?/i;
  const singleAnnual = /(?:USD\s*)?\$\s*([\d,.]+)\s*(?:k|K)?\s*(?:USD|per year|\/\s*year|annually)/i;

  for (const candidate of salaryCandidates(item, description)) {
    const text = plainText(candidate, Number.MAX_SAFE_INTEGER);
    const range = text.match(annualRange);
    const single = range ? null : text.match(singleAnnual);
    const match = range ?? single;
    if (!match) continue;

    const multiplierFor = () => (/k/i.test(match[0]) ? 1000 : 1);
    const minimum = Number(match[1].replaceAll(",", "")) * multiplierFor(match[1]);
    const maximum = range ? Number(match[2].replaceAll(",", "")) * multiplierFor(match[2]) : minimum;
    if (minimum < 15_000 || maximum > 2_000_000 || minimum > maximum) continue;

    return {
      salaryMin: minimum,
      salaryMax: maximum,
      salaryText: match[0].trim(),
    };
  }
  return { salaryMin: null, salaryMax: null, salaryText: null };
}

function deriveTags(source, title, department, description) {
  const haystack = `${title} ${department} ${description}`;
  const derived = TAG_RULES.filter(([, pattern]) => pattern.test(haystack)).map(([tag]) => tag);
  return [...new Set([...(source.tags ?? []), ...derived])].slice(0, 14);
}

function makeJob(source, values, fetchedAt) {
  const title = plainText(values.title);
  const company = plainText(values.company || source.name);
  const location = plainText(values.location) || "Unknown";
  const department = plainText(values.department);
  const fullDescription = plainText(values.description, Number.MAX_SAFE_INTEGER);
  const description = plainText(fullDescription);
  const applyUrl = canonicalUrl(values.applyUrl);
  const externalId = values.externalId === null || values.externalId === undefined ? null : String(values.externalId);
  const salary = parseSalary(values.raw ?? {}, `${values.salaryText ?? ""} ${fullDescription}`);

  return {
    id: stableId([source.id, externalId || applyUrl]),
    externalId,
    title,
    company,
    location,
    workMode: inferWorkMode(location, title, fullDescription, values.workMode),
    employmentType: inferEmploymentType(values.employmentType, title, fullDescription),
    seniority: inferSeniority(title),
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryText: salary.salaryText,
    postedDate: normalizeDate(values.postedDate),
    source: values.source || adapterName(source.adapter),
    sourceId: source.id,
    sourceAdapter: source.adapter,
    category: classifyCategory(title, department, fullDescription),
    tags: deriveTags(source, title, department, fullDescription),
    description: description || `${title} opportunity at ${company}.`,
    applyUrl,
    fetchedAt,
  };
}

function adapterName(adapter) {
  return { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" }[adapter] ?? "Company Careers";
}

export function normalizeGreenhouse(source, payload, fetchedAt) {
  return (Array.isArray(payload?.jobs) ? payload.jobs : []).map((item) =>
    makeJob(
      source,
      {
        externalId: item.id,
        title: item.title,
        company: payload.company_name || source.name,
        location: listText(item.offices) || item.location?.name || item.location,
        department: listText(item.departments),
        employmentType: item.employment_type,
        description: item.content,
        applyUrl: item.absolute_url,
        postedDate: item.updated_at,
        raw: item,
      },
      fetchedAt,
    ),
  );
}

export function normalizeLever(source, payload, fetchedAt) {
  return (Array.isArray(payload) ? payload : []).map((item) =>
    makeJob(
      source,
      {
        externalId: item.id,
        title: item.text,
        company: source.name,
        location: item.categories?.location,
        department: [item.categories?.department, item.categories?.team].filter(Boolean).join(", "),
        workMode: item.workplaceType,
        employmentType: item.categories?.commitment,
        description: item.descriptionPlain || item.description,
        applyUrl: item.hostedUrl || item.applyUrl,
        postedDate: item.createdAt,
        raw: item,
      },
      fetchedAt,
    ),
  );
}

function ashbyRecords(payload) {
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  if (Array.isArray(payload?.jobPostings)) return payload.jobPostings;
  return [];
}

export function normalizeAshby(source, payload, fetchedAt) {
  return ashbyRecords(payload).map((item) =>
    makeJob(
      source,
      {
        externalId: item.id,
        title: item.title,
        company: source.name,
        location: item.locationName || item.location,
        department: [item.department, item.team].filter(Boolean).join(", "),
        workMode: item.workplaceType || (item.isRemote ? "Remote" : ""),
        employmentType: item.employmentType,
        salaryText: item.compensation,
        description: item.descriptionPlain || item.descriptionHtml || item.description,
        applyUrl: item.jobUrl || item.applyUrl,
        postedDate: item.publishedAt || item.updatedAt || item.createdAt,
        raw: item,
      },
      fetchedAt,
    ),
  );
}

const ADAPTERS = {
  greenhouse: normalizeGreenhouse,
  lever: normalizeLever,
  ashby: normalizeAshby,
};

function dedupeKeyParts(job) {
  return [
    `url:${canonicalUrl(job.applyUrl).toLowerCase()}`,
    job.externalId ? `external:${job.sourceId}:${job.externalId}` : null,
    `identity:${normalizedText(job.title)}|${normalizedText(job.company)}|${normalizedText(job.location)}`,
  ].filter(Boolean);
}

export function dedupeJobs(jobs) {
  const seen = new Set();
  const unique = [];
  for (const job of jobs) {
    const keys = dedupeKeyParts(job);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    unique.push(job);
  }
  return unique;
}

export function sortJobsNewestFirst(jobs) {
  return [...jobs].sort((left, right) => {
    if (left.postedDate === null && right.postedDate === null) return left.title.localeCompare(right.title);
    if (left.postedDate === null) return 1;
    if (right.postedDate === null) return -1;
    return right.postedDate.localeCompare(left.postedDate) || left.title.localeCompare(right.title);
  });
}

export function validateJobs(jobs, sourceIds) {
  if (!Array.isArray(jobs) || jobs.length === 0) throw new Error("Output schema validation failed: no jobs");
  const ids = new Set();
  const enums = {
    workMode: new Set(["Remote", "Hybrid", "On-site", "Unknown"]),
    employmentType: new Set(["Full-time", "Part-time", "Contract", "Internship", "Temporary", "Unknown"]),
    seniority: new Set(["Entry-Level", "Junior", "Mid-Level", "Senior", "Staff", "Manager", "Director", "Executive", "Unknown"]),
    category: new Set(["Software Engineering", "Data", "Infrastructure", "IT Support", "Technical Operations", "Business Systems", "Product", "Security", "QA", "Other"]),
    sourceAdapter: new Set(["greenhouse", "lever", "ashby"]),
  };
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
  for (const job of jobs) {
    for (const field of requiredStrings) {
      if (typeof job[field] !== "string" || !job[field].trim()) {
        throw new Error(`Output schema validation failed: ${job.id || job.title || "job"} has invalid ${field}`);
      }
    }
    if (ids.has(job.id)) throw new Error(`Output schema validation failed: duplicate id ${job.id}`);
    ids.add(job.id);
    if (!sourceIds.has(job.sourceId)) throw new Error(`Output schema validation failed: unknown source ${job.sourceId}`);
    for (const [field, allowed] of Object.entries(enums)) {
      if (!allowed.has(job[field])) throw new Error(`Output schema validation failed: ${job.id} has invalid ${field}`);
    }
    if (job.externalId !== null && typeof job.externalId !== "string") throw new Error(`${job.id} has invalid externalId`);
    if (job.postedDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(job.postedDate)) {
      throw new Error(`${job.id} has invalid postedDate`);
    }
    for (const field of ["salaryMin", "salaryMax"]) {
      if (job[field] !== null && (typeof job[field] !== "number" || !Number.isFinite(job[field]))) {
        throw new Error(`${job.id} has invalid ${field}`);
      }
    }
    if (job.salaryText !== null && typeof job.salaryText !== "string") throw new Error(`${job.id} has invalid salaryText`);
    if (!Array.isArray(job.tags)) throw new Error(`${job.id} has invalid tags`);
    const url = new URL(job.applyUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${job.id} has invalid applyUrl`);
  }
}

async function fetchJson(source) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(source.url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 400));
    } finally {
      clearTimeout(timeout);
    }
  }
  const cause = lastError?.cause?.message;
  throw new Error(cause ? `${lastError.message}: ${cause}` : lastError?.message || "Fetch failed");
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function collectSource(source, fetchedAt) {
  if (!source.enabled) {
    return {
      jobs: [],
      summary: {
        id: source.id,
        name: source.name,
        adapter: source.adapter,
        enabled: false,
        tags: source.tags ?? [],
        homepage: source.homepage ?? null,
        ok: false,
        jobsFetched: 0,
        lastFetchedAt: null,
        error: null,
      },
    };
  }

  try {
    const normalize = ADAPTERS[source.adapter];
    if (!normalize) throw new Error(`Unsupported adapter: ${source.adapter}`);
    const payload = await fetchJson(source);
    await writeJson(resolve(RAW_DATA_DIR, `${source.id}.json`), payload);
    const jobs = normalize(source, payload, fetchedAt);
    return {
      jobs,
      summary: {
        id: source.id,
        name: source.name,
        adapter: source.adapter,
        enabled: true,
        tags: source.tags ?? [],
        homepage: source.homepage ?? null,
        ok: true,
        jobsFetched: jobs.length,
        lastFetchedAt: fetchedAt,
        error: null,
      },
    };
  } catch (error) {
    return {
      jobs: [],
      summary: {
        id: source.id,
        name: source.name,
        adapter: source.adapter,
        enabled: true,
        tags: source.tags ?? [],
        homepage: source.homepage ?? null,
        ok: false,
        jobsFetched: 0,
        lastFetchedAt: fetchedAt,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function run() {
  const fetchedAt = new Date().toISOString();
  const sources = JSON.parse(await readFile(SOURCE_PATH, "utf8"));
  const sourceIds = new Set();
  for (const source of sources) {
    if (!source.id || sourceIds.has(source.id)) throw new Error(`Invalid or duplicate source id: ${source.id}`);
    if (!source.name || !source.adapter || !source.url) throw new Error(`Incomplete source config: ${source.id}`);
    sourceIds.add(source.id);
  }

  const collected = await Promise.all(sources.map((source) => collectSource(source, fetchedAt)));
  const summaries = collected.map(({ summary }) => summary);
  const enabled = summaries.filter((source) => source.enabled);
  const successful = enabled.filter((source) => source.ok);
  if (successful.length === 0) {
    throw new Error(`All enabled sources failed: ${enabled.map((source) => `${source.name}: ${source.error}`).join("; ")}`);
  }

  const jobs = sortJobsNewestFirst(dedupeJobs(collected.flatMap(({ jobs: sourceJobs }) => sourceJobs)));
  validateJobs(jobs, sourceIds);

  const meta = {
    generatedAt: fetchedAt,
    jobCount: jobs.length,
    sourceCount: enabled.length,
    okSourceCount: successful.length,
    failedSourceCount: enabled.length - successful.length,
  };

  await Promise.all([
    writeJson(resolve(PUBLIC_DATA_DIR, "jobs.json"), jobs),
    writeJson(resolve(PUBLIC_DATA_DIR, "sources.json"), summaries),
    writeJson(resolve(PUBLIC_DATA_DIR, "meta.json"), meta),
    writeJson(resolve(SNAPSHOT_DIR, "latest.json"), { meta, sources: summaries, jobs }),
  ]);

  console.log(`Wrote ${jobs.length} jobs from ${successful.length}/${enabled.length} enabled sources.`);
  for (const source of summaries.filter((item) => item.enabled && !item.ok)) {
    console.warn(`${source.name} failed: ${source.error}`);
  }
  return { jobs, sources: summaries, meta };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await run();
}
