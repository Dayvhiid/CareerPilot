# CareerPilot - Database Guide

## Database Technology

**MongoDB** via **Mongoose 8.x ODM**

Connection is configured in `src/config/db.js` using `MONGO_URI` or `MONGODB_URI` environment variables. The server will start without MongoDB but database features will be unavailable.

---

## Entity Relationship Diagram (Textual)

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│     User     │       │     Resume       │       │     Job      │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ _id          │──┐    │ _id              │       │ _id          │
│ name         │  │    │ userId ──────────│──┐    │ title        │
│ email (uniq) │  │    │ filename         │  │    │ company      │
│ password     │  │    │ originalName     │  │    │ location     │
│ googleId     │  │    │ fileSize         │  │    │ description  │
│ githubId     │  │    │ fileType         │  │    │ requirements │
│ timestamps   │  │    │ filePath         │  │    │ salary       │
└──────────────┘  │    │ extractedText    │  │    │ jobType      │
                  │    │ extractedData ├──┘  │    │ experienceLvl│
                  │    │ processingStage    │    │ skills       │
                  │    │ processingProgress  │    │ postedDate   │
                  │    │ isProcessed       │    │ externalId   │
                  │    │ timestamps        │    │ source       │
                  │    └──────────────────┘    │ jobUrl       │
                  │                            │ isActive     │
                  │    ┌──────────────────┐    │ industry     │
                  │    │   JobMatch       │    │ benefits     │
                  │    ├──────────────────┤    │ workType     │
                  └────┤ userId           │    │ category     │
                       │ jobId ───────────│────│ timestamps   │
                       │ matchScore       │    └──────────────┘
                       │ matchReasons     │
                       │ skillsMatch      │
                       │ locationMatch    │
                       │ experienceMatch  │
                       │ titleMatch       │
                       │ isBookmarked     │
                       │ isApplied        │
                       │ appliedDate      │
                       │ status           │
                       │ viewedAt         │
                       │ timestamps       │
                       └──────────────────┘
```

## Schemas

### User (`User.js`)
Collection: `users`

| Field | Type | Constraints |
|-------|------|-------------|
| `name` | String | required |
| `email` | String | required, unique |
| `password` | String | required if no googleId/githubId |
| `googleId` | String | unique, sparse |
| `githubId` | String | unique, sparse |
| `createdAt` | Date | auto (timestamps) |
| `updatedAt` | Date | auto (timestamps) |

### Resume (`Resume.js`)
Collection: `resumes` (model name `ResumeV2`)

| Field | Type | Constraints |
|-------|------|-------------|
| `userId` | ObjectId (ref: User) | required |
| `filename` | String | required |
| `originalName` | String | required |
| `fileSize` | Number | required |
| `fileType` | String | required |
| `filePath` | String | required |
| `extractedText` | String | optional |
| `processingStage` | String | default: 'queued' |
| `processingProgress` | Number | min 0, max 100, default 0 |
| `processingMessage` | String | default: 'Waiting to start processing' |
| `processingStartedAt` | Date | optional |
| `processingUpdatedAt` | Date | optional |
| `processingError` | String | optional |
| `isProcessed` | Boolean | default: false |
| `extractedData` | Object (embedded) | see below |
| `createdAt` | Date | auto |
| `updatedAt` | Date | auto |

**extractedData embedded sub-schema:**

| Field | Type |
|-------|------|
| `name` | String |
| `email` | String |
| `phone` | String |
| `location` | String |
| `summary` | String |
| `currentJobTitle` | String |
| `yearsOfExperience` | Number |
| `skills` | [String] |
| `softSkills` | [String] |
| `industryExperience` | [String] |
| `education` | [{ degree, institution, year, location }] |
| `workExperience` | [{ position, company, duration, location, responsibilities, contact }] |
| `projects` | [{ name, description, dates }] |
| `certificates` | [{ name, issuer, date }] |
| `interests` | [String] |
| `achievements` | [String] |
| `languages` | [String] |
| `generatedSummary` | String |

### Job (`Job.js`)
Collection: `jobs`

| Field | Type | Constraints |
|-------|------|-------------|
| `title` | String | required |
| `company` | String | required |
| `location` | String | required |
| `description` | String | required |
| `requirements` | [String] | optional |
| `salary` | { min, max, currency, display } | optional |
| `jobType` | String | enum: full-time, part-time, contract, temporary, internship |
| `experienceLevel` | String | enum: entry, mid, senior, executive |
| `skills` | [String] | optional |
| `postedDate` | Date | default: now |
| `externalId` | String | required, unique |
| `source` | String | enum: indeed, linkedin, glassdoor, ziprecruiter, other |
| `jobUrl` | String | required |
| `companyLogo` | String | optional |
| `isActive` | Boolean | default: true |
| `industry` | String | optional |
| `benefits` | [String] | optional |
| `workType` | String | enum: remote, onsite, hybrid |
| `category` | String | enum: IT/Software, Design/Creative, Finance/Accounting, Sales/Marketing, Construction/Engineering, Healthcare, Operations/Admin, Other |

**Indexes:**
- `{ title: 'text', description: 'text', company: 'text' }` - Full-text search
- `{ location: 1, postedDate: -1 }` - Location + recency queries
- `{ skills: 1 }` - Skill-based filtering
- `{ externalId: 1 }` - Unique upsert lookups

### JobMatch (`JobMatch.js`)
Collection: `jobmatches` (derived from model name `JobMatch`)

| Field | Type | Constraints |
|-------|------|-------------|
| `userId` | ObjectId (ref: User) | required |
| `jobId` | ObjectId (ref: Job) | required |
| `matchScore` | Number | min 0, max 100, required |
| `matchReasons` | [String] | optional |
| `skillsMatch` | { matched: [String], missing: [String], score: Number } | optional |
| `locationMatch` | Number | min 0, max 100 |
| `experienceMatch` | Number | min 0, max 100 |
| `titleMatch` | Number | min 0, max 100 |
| `isBookmarked` | Boolean | default: false |
| `isApplied` | Boolean | default: false |
| `appliedDate` | Date | optional |
| `status` | String | enum: recommended, viewed, applied, rejected, bookmarked |
| `viewedAt` | Date | optional |
| `lastInteraction` | Date | default: now |

**Indexes:**
- `{ userId: 1, jobId: 1 }` - Unique compound (prevents duplicate matches)
- `{ userId: 1, matchScore: -1 }` - Sorted user recommendations
- `{ userId: 1, status: 1, lastInteraction: -1 }` - User status queries

---

## Relationships

- **User → Resume**: One-to-one. Each user can have at most one resume (old one is deleted on new upload).
- **User → JobMatch**: One-to-many. A user can have many job matches.
- **Job → JobMatch**: One-to-many. A job can be matched to many users.
- **User ↔ Job (through JobMatch)**: Many-to-many. Users and jobs are related via match scores with status tracking.

---

## Migrations & Seeders

### Backfill Script
`scripts/backfill-job-categories.js` — A one-time migration that classifies existing jobs without a category by running them through `classifyJobCategory()`.

No formal migration framework (e.g., migrate-mongo) is used. Schema changes are applied directly.

---

## Data Flow Patterns

### Job Search → Save Pipeline
1. External JSearch API returns raw job data
2. `jSearchService.normalizeJobs()` transforms to schema format
3. `Job.findOneAndUpdate({ externalId }, data, { upsert: true })` — deduplicates by externalId
4. Category classification happens before save via `classifyJobCategory()`

### Resume Processing Pipeline
1. Upload → MongoDB save → Background extraction
2. Text extraction (pdf-parse / mammoth)
3. HuggingFace NER parser (with 20-second timeout)
4. Fallback: local NLP extraction (natural.js, compromise)
5. Data normalization via `normalizeExtractedData()`
6. MongoDB upsert updates the resume document

### Job Matching Pipeline
1. Fetch resume's `extractedData` for the user
2. Classify resume category
3. Fetch all active jobs
4. Cross-domain gate: skip jobs whose category doesn't match resume category
5. Calculate match scores (skills 50%, title 30%, experience 10%, location 10%)
6. Hard gate: skip jobs with zero skill overlap AND title match < 50
7. Create `JobMatch` records for surviving matches

---

## Notes

- The Resume model is registered as `ResumeV2` (line 110: `module.exports = mongoose.model("ResumeV2", resumeSchema)`)
- No formal `mongodump`/`mongorestore` strategy is documented
- Indexes on JobMatch ensure query performance for user recommendations
- The Job schema's text index supports regex-based fallback search when the JSearch API is unavailable
