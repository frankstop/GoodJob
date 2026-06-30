# GoodJob

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-087f86)](https://frankstop.github.io/GoodJob/)
[![Checks](https://github.com/frankstop/GoodJob/actions/workflows/checks.yml/badge.svg)](https://github.com/frankstop/GoodJob/actions/workflows/checks.yml)
[![No build step](https://img.shields.io/badge/build-none-38a449)](#run-locally)

GoodJob is a focused technical job dashboard for New York City, Long Island, hybrid, on-site, and remote roles. It helps job seekers compare listings quickly, spot aging postings, combine precise filters, and keep a local shortlist.

**Live site:** [frankstop.github.io/GoodJob](https://frankstop.github.io/GoodJob/)

## Why it exists

GoodJob builds on lessons from [RemoteJob](https://frankstop.github.io/RemoteJob/) and [JobBoard](https://frankstop.github.io/JobBoard/):

- RemoteJob showed the value of a dense filter rail and fast, scannable result rows.
- JobBoard showed the value of clear source information and structured listing data.
- GoodJob adds explicit age bands, multi-group filtering, salary and date controls, result-aware statistics, saved listings, copied deep links, and restored browser state.

The interface uses a bright operational-dashboard style influenced by infrastructure monitoring products. It stays readable, responsive, and dependency-free.

## Features

- Keyword search across title, company, category, tags, and description
- Location search
- Multi-select work mode, employment type, seniority, category, source, and tag filters
- Minimum-salary and maximum-age filters
- Removable active-filter chips
- New, Fresh, Aging, and Old posting states
- Result-aware average age
- Six sort modes
- Saved jobs in `localStorage`
- Restored filters and sort choice
- Copyable links to individual job cards
- Expandable role details
- Desktop, tablet, and iPhone layouts
- Keyboard focus states, semantic regions, reduced-motion support, and higher-contrast adjustments
- Empty, loading, and data-error states

## Job age rules

GoodJob calculates age from each listing’s `postedDate` at runtime.

| Status | Age |
| --- | --- |
| New | 0–3 days |
| Fresh | 4–7 days |
| Aging | 8–21 days |
| Old | 22+ days |

## Data structure

`jobs.json` contains the listings. Each item follows this shape:

```json
{
  "id": "job-001",
  "title": "Business Systems Analyst",
  "company": "Northwell Health",
  "location": "New Hyde Park, NY",
  "workMode": "Hybrid",
  "employmentType": "Full-time",
  "seniority": "Mid-Level",
  "salaryMin": 95000,
  "salaryMax": 118000,
  "salaryText": "$95,000 – $118,000",
  "postedDate": "2026-06-29",
  "source": "Company Careers",
  "category": "Business Systems Analyst",
  "tags": ["SQL", "Business Analysis", "Jira"],
  "description": "A short plain-language summary.",
  "applyUrl": "https://example.com/careers"
}
```

The included data is realistic sample content. Employer career homepages are used for the Apply links so the project does not pretend that a sample role is a currently open requisition.

## Add or update jobs

1. Open `jobs.json`.
2. Add an object with every field shown above.
3. Give the listing a unique ID such as `job-025`.
4. Use a `postedDate` in `YYYY-MM-DD` format.
5. Keep `salaryMin` and `salaryMax` numeric so salary sorting and filtering work.
6. Run `npm test` to validate the dataset.

## Run locally

The app has no build step and no runtime package dependency. A local web server is required because browsers restrict `fetch()` when `index.html` is opened as a `file://` URL.

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Test

The test suite uses Node’s built-in test runner:

```bash
npm test
```

The checks cover age boundaries, age labels, combined filters, tag matching, sorting, result-aware average age, filter counts, and the required JSON schema.

## Publish with GitHub Pages

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose `main` and `/ (root)`.
5. Save and wait for the Pages URL to report a successful deployment.

All paths are relative, so the app works under the `/GoodJob/` project path.

## Project files

```text
.
├── .github/workflows/checks.yml
├── .nojekyll
├── index.html
├── jobs.json
├── script.js
├── styles.css
├── tests/goodjob.test.js
├── LICENSE
├── package.json
└── README.md
```

## Browser storage

GoodJob stores saved job IDs, filters, and the selected sort option in the current browser. It does not send that state to a server. Clearing browser site data resets it.

## Future improvements

- Import listings from reviewed employer feeds during a scheduled data refresh
- Add a user-controlled archive for expired roles
- Add optional application-status tracking
- Add data freshness checks during continuous integration
- Add an export and import format for browser state

## License

[MIT](LICENSE)
