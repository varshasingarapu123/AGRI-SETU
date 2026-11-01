# AGRISETU — Voice-First Agricultural Support & Market Coordination Platform

**Tagline:** *Samriddh Annadata, Samriddh Bharat.*

AGRISETU is an integrated, bilingual (Telugu & English) agricultural support and post-harvest market coordination web application connecting **farmers**, **merchants/buyers**, and **agricultural coordinators** through consent-governed farm profiles, source-attributed agronomic guidance, rule-based crop suitability and post-harvest routing, and transparent procurement workflows.

---

## 1. Core Modules

1. **AI Farmer Assistant (`/assistant`)**
   - Push-to-talk regional Telugu/English speech capture (transient server-side Gemini STT + browser fallback; raw audio is never stored) and text chat.
   - Thresholded Retrieval-Augmented Generation (RAG) over verified agricultural knowledge documents and government schemes (`MIN_KNOWLEDGE_RELEVANCE_SCORE = 5`).
   - Honest no-match handling when no verified knowledge record matches a query (never falls back to unrelated documents).
   - Bilingual safety & escalation guardrails for chemical/pesticide/fertiliser dosages, severe crop disease outbreaks, and crop-loss decisions.
   - Configurable regional Telugu phrase dictionary (`kakinada_coastal` & `godavari_delta` profiles) and optional Telugu TTS playback.
2. **Soil-to-Crop Suitability (`/assistant` → Soil-to-Crop Suitability)**
   - Deterministic rule-based agronomic shortlist evaluating soil type, pH, salinity, irrigation reliability, crop rotation, and open market demand signals.
   - Explicitly flags missing or self-reported diagnostic inputs (e.g., lab soil test, EC, pH, organic carbon) and avoids guaranteed yield or profit claims.
3. **Government Schemes Assistant (`/assistant` → Government Schemes)**
   - Structured Central and State scheme directory displaying official source names, `officialSourceUrl` links, `lastVerifiedDate`, and clear distinction between `Verified`, `Requires Verification`, and `Outdated` records.
4. **Farmer Market (`/farmer_market`)**
   - Browse open merchant procurement demands, filter by crop/location/buyer type, and submit structured harvest offers.
   - Discover regional farm supplies and log availability enquiries (discovery/enquiry only — no online payment processing).
5. **Merchant Market (`/merchant_market`)**
   - Search consent-protected farmer produce listings, bookmark lots, send purchase enquiries, publish procurement requirements, and manage incoming farmer offers and confirmed orders.
6. **AGRIROUTE Post-Harvest Routing (`/agriroute`)**
   - 100-point transparent rule-based comparison across Direct Merchants, Wholesalers, Retail Procurement, and Food Processing Units (including cosmetically imperfect / ripe Grade B produce).
   - Clearly separates *Suggested Destinations (Demo Estimates)* and *Indicative Buyer Demand* from *Marketplace Enquiries/Offers*, *Confirmed Orders*, and *Completed Transactions*, and labels centroid distances and illustrative transport formulas honestly.
7. **My Farm (`/my_farm`)**
   - Unified farmer workspace for managing personal/farm/soil records, granular privacy consents, produce listings, incoming buyer enquiries, confirmed orders, AGRIROUTE evaluations, saved guidance, and deletable AI conversation history.
8. **Coordinator Dashboard (`/coordinator`)**
   - Restricted to authorized coordinators for pilot outcome tracking, human-in-the-loop expert escalation resolution, and governance of agricultural knowledge and government scheme records.

---

## 2. Architecture Summary

- **Frontend SPA (`src/`)**: React 19 + TypeScript + Tailwind CSS v4. Communicates exclusively with `/api/*` endpoints using `Authorization: Bearer <token>` headers (`AgriSetuContext`).
- **Full-Stack Server (`server.ts`)**: Express 4 API server mounting Vite middleware in development (`npm run dev`) and serving static compiled assets from `dist/` in production (`npm start`). Blocks direct HTTP access to dotfiles (`.env*`), server modules, and configuration files.
- **Authentication & RBAC (`src/middleware/auth.ts`, `src/db/repository.ts`)**:
  - Verifies Firebase ID tokens via `firebase-admin` and resolves user identity, role (`farmer`, `merchant`, `coordinator`), and record ownership strictly from PostgreSQL (`users`, `farmer_profiles`, `merchant_profiles`).
  - Client-supplied role/ID headers are never trusted.
  - `/api/bootstrap` is strictly scoped by role, ownership, and demo/live isolation.
- **Database Layer (`src/db/`)**: PostgreSQL (Cloud SQL compatible) managed via Drizzle ORM (`src/db/schema.ts`, `src/db/repository.ts`, `src/db/seed.ts`), enforcing transactional idempotent order creation (`orders_source_unique_idx`).
- **Domain & AI Services (`src/services/`)**:
  - `knowledgeRetrieval.ts`: Tokenization, bilingual Telugu/English synonym expansion, relevance threshold filtering, and high-risk safety detection.
  - `aiService.ts`: Server-side `@google/genai` wrapper enforcing farmer profile consent boundaries (`profileShared === true`) and transparent Demo RAG fallback.
  - `cropSuitabilityEngine.ts` & `agrirouteEngine.ts`: Deterministic, explainable rule engines.

---

## 3. Tech Stack

- **Frontend**: React 19, Vite 8, TypeScript 7, Tailwind CSS 4, Lucide Icons
- **Backend**: Node.js, Express 4, `tsx`
- **Database & ORM**: PostgreSQL (`pg`), Drizzle ORM, Drizzle Kit
- **Authentication**: Firebase Authentication (Google Sign-In) + Firebase Admin SDK
- **AI SDK**: `@google/genai` (server-side text/RAG, audio transcription, and TTS)
- **Testing**: Node.js built-in test runner (`node:test` + `node:assert/strict` via `tsx --test`)

---

## 4. Environment Variables

Copy `.env.example` to `.env` and configure the variables below:

| Variable | Required? | Purpose |
| :--- | :--- | :--- |
| `SQL_HOST` | **Required** | PostgreSQL / Cloud SQL host address |
| `SQL_DB_NAME` | **Required** | PostgreSQL database name |
| `SQL_USER` | **Required** | Application database user |
| `SQL_PASSWORD` | **Required** | Application database password |
| `SQL_ADMIN_USER` | Required for `npm run db:push` | Admin database user for Drizzle schema migrations |
| `SQL_ADMIN_PASSWORD` | Required for `npm run db:push` | Admin database password for Drizzle schema migrations |
| `GEMINI_API_KEY` | Optional | Server-side Gemini API key; when unset, runs in labelled Demo RAG Mode |
| `AI_TEXT_MODEL` | Optional | Gemini text model override (defaults to `gemini-3.8-flash`) |
| `AI_STT_MODEL` | Optional | Gemini speech-to-text model override (defaults to `gemini-3.8-flash`) |
| `AI_TTS_MODEL` | Optional | Gemini TTS model override (defaults to `gemini-2.5-flash-preview-tts`) |
| `FIREBASE_PROJECT_ID` | Optional | Firebase project ID (auto-detected from `firebase-applet-config.json` if present) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional | JSON service account string if Application Default Credentials are not used |
| `COORDINATOR_EMAILS` | Optional | Comma-separated verified emails granted `coordinator` role on sign-in |
| `ENABLE_DEMO_MODE` | Optional | Enables isolated fictional demo personas in non-production (`true` by default in dev; forced `false` when `NODE_ENV=production`) |
| `DEMO_SESSION_SECRET` | Optional | HMAC secret (>=16 chars) for signing non-production demo session tokens |
| `APP_URL` | Optional | Public URL of the hosted application |

---

## 5. Local Setup, Database Setup & Seed Data

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Fill in SQL_HOST, SQL_DB_NAME, SQL_USER, SQL_PASSWORD (and SQL_ADMIN_* for schema push)
   ```
3. **Push PostgreSQL schema via Drizzle Kit:**
   ```bash
   npm run db:push
   ```
4. **Seed fictional pilot demonstration records:**
   - When `ENABLE_DEMO_MODE="true"` (and `NODE_ENV !== "production"`), starting the dev server and loading `/api/bootstrap` or `/api/auth/demo-session` automatically invokes `ensureDemoSeedData()` (`src/db/seed.ts`) if the database is empty.
   - Seeded demo records are explicitly flagged `is_demo = true` (2 coastal/delta Telugu farmers, 4 buyer channels, verified ANGRAU/ICAR/APMC reference summaries, Central/State schemes, sample listings, and AGRIROUTE routes).

---

## 6. Running & Verifying the Application

- **Start full-stack development server (Port 3000):**
  ```bash
  npm run dev
  ```
- **Run TypeScript type-checking / lint:**
  ```bash
  npm run lint
  ```
- **Run automated backend, security, consent, RAG, marketplace & engine tests:**
  ```bash
  npm test
  ```
- **Build production frontend bundle:**
  ```bash
  npm run build
  ```
- **Start production server:**
  ```bash
  NODE_ENV=production npm start
  ```

---

## 7. Demo Mode vs Live Authenticated Mode

- **Controlled Demo Mode (`NODE_ENV !== 'production'` and `ENABLE_DEMO_MODE=true`)**:
  - Allows exploring fictional farmer, merchant, and coordinator workflows via server-signed HMAC demo session tokens (`POST /api/auth/demo-session`).
  - Demo sessions can only access `is_demo = true` records and are strictly isolated from real users.
  - Even in Demo Mode, every endpoint enforces server-side RBAC and per-persona record ownership (e.g., Demo Farmer 1 cannot read or modify Demo Farmer 2's profile or conversations).
- **Live Authenticated Mode (Firebase Google Sign-In / `NODE_ENV=production`)**:
  - Demo session endpoints and demo tokens are completely disabled in production (`403` / `401`).
  - Verified Firebase users receive an isolated `is_demo = false` profile with all privacy consents defaulting to `false`.
  - Coordinator privileges are granted only to server-verified accounts listed in `COORDINATOR_EMAILS` (or `users.role = 'coordinator'` in PostgreSQL).

---

## 8. Security, Privacy & Consent Overview

- **Default-False Consent**: All farmer consent flags (`shareProfileWithAi`, `shareProfileWithMerchants`, `shareContactOnEnquiry`, `shareConversationWithExperts`, `saveConversationHistory`) default to `false` in both the PostgreSQL schema and application logic.
- **AI Context Boundary**: Personal identity, village/mandal/district, soil records, crop history, and custom dialect vocabulary are excluded from AI chat and STT prompts unless `shareProfileWithAi === true`.
- **Ephemeral vs Saved Conversations**: Conversations and messages are persisted to PostgreSQL only when `saveConversationHistory === true`, and farmers can delete individual threads or clear all history at any time (`DELETE /api/conversations/:id`, `DELETE /api/farmers/:id/conversations`). Raw voice audio is processed transiently in memory and never stored.
- **Expert Escalation Privacy**: Conversation details are forwarded to `expert_escalations` only when `shareConversationWithExperts === true`.
- **Marketplace Integrity**: Enquiries, offers, confirmed orders, and completed transactions follow validated state transitions, and order confirmation uses a database transaction plus unique index (`orders_source_unique_idx`) to prevent duplicate orders on retries. No online payment collection is performed.
