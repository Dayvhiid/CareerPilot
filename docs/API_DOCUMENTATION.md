# CareerPilot - API Documentation

**Base URL**: `http://localhost:4000` (configurable via `PORT` env var)

**Auth Header**: `Authorization: Bearer <accessToken>`

---

## Authentication

### POST /api/auth/register
Rate limited: 3 per hour per IP.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123"
}
```

**Validation Rules:**
- `name`: 2-100 chars, alphabetic + spaces/hyphens/apostrophes
- `email`: valid email format
- `password`: min 8 chars, must contain uppercase, lowercase, and number

**Response 201:**
```json
{ "success": true, "message": "User registered successfully" }
```

**Response 400:**
```json
{ "success": false, "message": "User already exists" }
```
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "password", "message": "Password must contain uppercase, lowercase, and numbers" }]
}
```

---

### POST /api/auth/login
Rate limited: 5 attempts per 15 minutes.

**Request Body:**
```json
{ "email": "john@example.com", "password": "Password123" }
```

**Response 200:**
```json
{
  "success": true,
  "accessToken": "<jwt>",
  "token": "<jwt>",
  "user": { "id": "...", "name": "John Doe", "email": "john@example.com" }
}
```
Sets `refreshToken` as httpOnly cookie (7-day expiry).

**Response 401:**
```json
{ "success": false, "message": "Invalid credentials" }
```

---

### POST /api/auth/refresh
Reads `refreshToken` from cookie.

**Response 200:**
```json
{ "success": true, "accessToken": "<new-jwt>", "token": "<new-jwt>" }
```

**Response 401:**
```json
{ "success": false, "message": "Refresh token missing" }
```
```json
{ "success": false, "message": "Refresh token expired. Please login again." }
```

---

### POST /api/auth/logout
Clears `refreshToken` cookie.

**Response 200:**
```json
{ "success": true, "message": "Logged out successfully" }
```

---

## OAuth

### GET /api/oauth/google
Redirects to Google consent screen. Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to be configured.

### GET /api/oauth/google/callback
Handles Google OAuth callback. On success, sets `accessToken` cookie and redirects to `/public/resume/resume.html`.

### GET /api/oauth/github
Redirects to GitHub consent screen. Requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to be configured.

### GET /api/oauth/github/callback
Handles GitHub OAuth callback. On success, sets `accessToken` cookie and redirects to `/public/resume/resume.html`.

### GET /api/oauth/logout
Calls `req.logout()` and redirects to `/`.

---

## Resume

All resume endpoints require authentication.

### POST /api/resume/upload
Rate limited: 10 uploads per day.

**Content-Type:** `multipart/form-data`

**Field:** `resume` (file)

**Allowed file types:** PDF, DOC, DOCX (max 10MB)

**Response 200:**
```json
{
  "msg": "Resume uploaded successfully",
  "resume": {
    "id": "...",
    "filename": "resume.pdf",
    "size": 123456,
    "uploadedAt": "2026-06-23T...",
    "isProcessed": false,
    "processingStage": "queued",
    "processingProgress": 0,
    "processingMessage": "Processing has started"
  }
}
```

**Response 400:**
```json
{ "success": false, "message": "No file uploaded" }
```
```json
{ "success": false, "message": "File content does not match declared type (magic bytes mismatch)" }
```
```json
{ "success": false, "message": "Invalid file type. Only PDF, DOC, and DOCX are allowed." }
```

---

### GET /api/resume

**Response 200:**
```json
{
  "resume": {
    "id": "...",
    "filename": "resume.pdf",
    "size": 123456,
    "uploadedAt": "2026-06-23T...",
    "isProcessed": true,
    "processingStage": "completed",
    "processingProgress": 100,
    "processingMessage": "Resume processing complete",
    "processingError": null,
    "extractedData": { ... }
  }
}
```

**Response 404:**
```json
{ "msg": "No resume found" }
```

---

### DELETE /api/resume

**Response 200:**
```json
{ "msg": "Resume deleted successfully" }
```

**Response 404:**
```json
{ "msg": "No resume found" }
```

---

## Jobs

All job endpoints require authentication.

### GET /api/jobs/search?query=software+developer&location=Nigeria&page=1&jobType=all&experienceLevel=all&datePosted=all
Rate limited: 200 per hour.

**Query Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| query | software developer | Job search query |
| location | Nigeria | Location filter |
| page | 1 | Page number |
| jobType | all | all, full-time, part-time, contract, temporary, internship |
| experienceLevel | all | all, entry, mid, senior, executive |
| datePosted | all | all, today, 3days, week, month |

**Response 200:**
```json
{
  "success": true,
  "jobs": [{ ... }],
  "totalResults": 20,
  "searchParams": { "query": "...", "location": "Nigeria", ... }
}
```

---

### GET /api/jobs/recommended?page=1&limit=20

Returns jobs matched against user's resume data with match scores.

**Response 200:**
```json
{
  "success": true,
  "jobs": [
    {
      ...jobFields,
      "matchScore": 85,
      "matchReasons": ["3 matching skills: JavaScript, React, Node.js"],
      "skillsMatch": { "matched": ["JavaScript"], "missing": ["Python"], "score": 50 },
      "isBookmarked": false,
      "status": "recommended"
    }
  ],
  "totalResults": 20,
  "hasMore": false,
  "page": 1
}
```

---

### GET /api/jobs/resume-based?page=1&limit=20

Fetches jobs by constructing search queries from resume data (job titles + skills).

**Response 200:**
```json
{
  "success": true,
  "jobs": [...],
  "totalResults": 20,
  "resumeData": { "currentJobTitle": "...", "topSkills": [...], "jobTitles": [...], "location": "Nigeria" },
  "searchParams": { "query": "...", "location": "Nigeria", "basedOnResume": true },
  "fromCache": false,
  "cacheKey": "jobs:...:..."
}
```

---

### POST /api/jobs/:jobId/bookmark

**Request Body:**
```json
{ "bookmark": true }
```

**Response 200:**
```json
{ "success": true, "message": "Job bookmarked", "isBookmarked": true }
```

---

### POST /api/jobs/:jobId/apply

**Response 200:**
```json
{ "success": true, "message": "Job marked as applied", "appliedDate": "2026-06-23T..." }
```

---

### GET /api/jobs/:jobId

**Response 200:**
```json
{
  "success": true,
  "job": {
    ...jobFields,
    "matchScore": 85,
    "matchReasons": [...],
    "skillsMatch": { ... },
    "isBookmarked": false,
    "isApplied": false,
    "status": "viewed"
  }
}
```

---

### GET /api/jobs/cache/stats
Rate limited: 1 per hour.

**Response 200:**
```json
{ "success": true, "stats": { "connected": true, "cachedJobKeys": 5, "memoryInfo": "..." } }
```

### DELETE /api/jobs/cache/clear
Rate limited: 1 per hour.

**Response 200:**
```json
{ "success": true, "message": "Cache cleared" }
```

---

## Cover Letter

All cover letter endpoints require authentication.

### POST /api/coverletter/generate/:jobId
Rate limited: 10 per day.

**Request Body:**
```json
{
  "customInstructions": "Mention my leadership experience",
  "tone": "professional",
  "length": "medium"
}
```

**Response 200:**
```json
{
  "success": true,
  "coverLetter": "Dear Hiring Manager,...",
  "jobData": { "title": "...", "company": "...", "id": "..." },
  "resumeData": { "name": "...", "email": "..." },
  "generatedAt": "2026-06-23T...",
  "model": "gpt2-large",
  "isTemplate": false
}
```

---

### POST /api/coverletter/download

**Request Body:**
```json
{
  "coverLetterText": "...",
  "jobTitle": "Software Developer",
  "company": "Tech Corp",
  "applicantName": "John Doe"
}
```

**Response 200:** Binary DOCX file download.

**Content-Type:** `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

---

### GET /api/coverletter/test
Rate limited: 200 per hour.

**Response 200:**
```json
{
  "success": true,
  "message": "Hugging Face connection successful",
  "error": "...",
  "response": "..."
}
```

---

## Chatbot

All chatbot endpoints require authentication.

### POST /api/chatbot/start

**Response 200:**
```json
{
  "success": true,
  "response": "You dey find job you no get resume/cv...",
  "state": "welcome",
  "sessionId": "k3m2x1a9b8c7",
  "progress": 0
}
```

---

### POST /api/chatbot/message
Rate limited: 50 per hour.

**Request Body:**
```json
{ "message": "Yes, I'm ready", "sessionId": "k3m2x1a9b8c7" }
```

**Response 200:**
```json
{
  "success": true,
  "response": "Great! Let's start with your basic information...",
  "state": "personal_info",
  "sessionId": "k3m2x1a9b8c7",
  "progress": 10,
  "options": null,
  "data": null
}
```

---

### POST /api/chatbot/generate

**Request Body:**
```json
{ "sessionId": "k3m2x1a9b8c7" }
```

Requires session state `completed`.

**Response 200:**
```json
{
  "success": true,
  "message": "Resume generated successfully! 🎉",
  "resumeId": "...",
  "resumeData": { ... }
}
```

---

### GET /api/chatbot/progress

**Query Parameters:** `sessionId`

**Response 200:**
```json
{
  "success": true,
  "state": "completed",
  "progress": 100,
  "data": { ... }
}
```

---

### GET /api/chatbot/download

**Response 200:** Binary PDF resume download.

**Content-Type:** `application/pdf`

---

### POST /api/chatbot/transcribe
Rate limited: 10 per day.

**Content-Type:** `multipart/form-data`

**Field:** `audio` (audio file, max 10MB)

**Response 200:**
```json
{
  "success": true,
  "text": "I am a software developer with five years of experience",
  "model": "openai/whisper-small"
}
```

---

### POST /api/chatbot/speak

**Request Body:**
```json
{ "text": "Your resume is ready for download" }
```

**Response 200:**
```json
{
  "success": true,
  "audio": "<base64-encoded-wav>",
  "model": "espnet/kan-bayashi_ljspeech_vits",
  "mimeType": "audio/wav"
}
```

---

## Common Error Responses

**401 Unauthorized:**
```json
{ "msg": "No token, authorization denied" }
```
```json
{ "msg": "Token is not valid" }
```

**429 Too Many Requests:**
```json
{ "message": "Too many authentication attempts. Please try again after 15 minutes." }
```

**500 Server Error:**
```json
{ "success": false, "message": "Internal server error", "error": "..." }
```

## Response Format Notes

- Some endpoints return `{ msg: "..." }`, others `{ success: true, message: "..." }` (inconsistent convention)
- Login returns both `accessToken` and `token` (duplicate keys for backward compatibility)
- Cover letter test endpoint returns `model` and `isTemplate` only during template fallback
