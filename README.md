# Macru - Unified Personal Knowledge Engine

Macru is a private, secure, and modular AI-powered assistant designed to be a central knowledge engine for an individual's digital information. It tackles the fragmentation of personal and work-related data scattered across various documents, platforms, and apps by providing a unified, intelligent, and private way to access, query, and interact with your data.

## The Problem
In today's digital landscape, information vital for work and personal life is often dispersed: notes in Notion, files on your hard drive, emails, calendar events, project management tasks, etc. Finding specific information or getting a holistic view requires searching multiple silos, wasting time and hindering productivity.

## The Solution: Macru
Macru connects to your data sources, ingests the information, and builds a secure, private knowledge base. Leveraging Cache-Augmented Generation (CAG) with powerful Large Language Models (LLMs) like Google Gemini, Macru provides high-context, relevant answers and insights based *only* on *your* data.

**Core Principles:**
*   **Privacy First:** Your data stays under your control, processed securely.
*   **Unified Access:** Query all connected sources through a single interface.
*   **Intelligence:** Leverage LLMs to understand context, synthesize information, and even perform actions.
*   **Modularity:** Easily extend Macru by adding new data connectors and capabilities.

## Key Features & Architecture

*   **Data Connectors & Ingestion:**
    *   Securely ingest data via direct file uploads (PDF, DOCX, TXT) and connectors.
    *   **Notion Integration:** Connect your Notion workspace via OAuth 2.0. Macru can fetch page content and structured properties (Status, Dates, People, etc.). Includes automatic background sync using Supabase Edge Functions.
    *   **Extensible:** Uses a modular `DataConnector` pattern (`lib/types/data-connector.ts`) for adding future sources (e.g., Google Drive, Gmail, Linear).
*   **Document Processing Pipeline:** (`lib/services/document-processor.ts`, etc.)
    *   Extracts text from various file types (`pdf-parse`, `mammoth`).
    *   Chunks documents into manageable segments for embedding (`document-chunker.ts`).
    *   Generates vector embeddings using LLMs (`embedding-service.ts`).
    *   Stores documents, chunks, embeddings, and extracted structured metadata in Supabase (`documents`, `chunks`, `embeddings` tables with `pgvector`).
*   **Hybrid Query Engine:** (Task 15)
    *   Combines vector similarity search (for semantic meaning) with structured metadata filtering (dates, status, priority, source type, etc.).
    *   Uses a Supabase database function (`match_documents`) for efficient retrieval.
    *   Handles source attribution and filtering based on user queries (e.g., "search Notion documents from this week").
*   **Cache-Augmented Generation (CAG):**
    *   Retrieves relevant text chunks and structured metadata based on the user's query.
    *   Assembles a rich context prompt for the LLM.
    *   Generates answers grounded in the provided context using the selected LLM.
*   **Multi-LLM Architecture:** (`lib/llmRouter.ts`)
    *   Supports multiple LLM providers through a common interface.
    *   Currently integrates Google Gemini (`@google/generative-ai`).
    *   Allows user selection of preferred LLM via settings.
*   **Persistent Memory Layer:** (`lib/services/memory-service.ts`, `memory_items` table)
    *   Stores user-specific facts, preferences, and context across sessions.
    *   Retrieves relevant memories to personalize LLM prompts and responses.
    *   Optionally enabled via `ENABLE_MEMORY_LAYER` environment variable.
    *   Users can view/manage memories in their profile settings.
*   **Action Execution Layer:** (`app/api/action/route.ts`, `action_logs` table)
    *   Allows the LLM to propose actions based on user requests (e.g., create calendar event, update Notion page - *future implementation*).
    *   Requires user confirmation (configurable levels planned).
    *   Logs all action attempts for auditing (`AuditTrailViewer` component).
    *   Includes rate limiting for security.
*   **Secure Authentication & Data Storage:**
    *   **Supabase Auth:** Handles user sign-up, login (email/password), email verification, and session management using `@supabase/ssr` for robust client/server handling.
    *   **Supabase Storage:** Securely stores uploaded files (`documents`, `avatars` buckets).
    *   **Supabase Postgres:** Stores application data (profiles, documents, chunks, embeddings, memory items, connector tokens, action logs).
    *   **Row-Level Security (RLS):** Enforced on all sensitive tables to ensure data privacy.
    *   **Token Encryption:** Planned use of `pgsodium` or Supabase Vault for sensitive connector tokens.
*   **User Interface:**
    *   Built with Next.js App Router, React Server Components, and TypeScript.
    *   Styled using Tailwind CSS and pre-built components from `shadcn/ui`.
    *   Includes dashboard features: file management, query history, chat interface, profile editing, connector settings, memory viewer, action audit trail, theme switching (`next-themes`).

## Tech Stack

*   **Framework:** [Next.js](https://nextjs.org/) (App Router)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **Database:** [Supabase](https://supabase.io/) (Postgres with `pgvector`, RLS, Edge Functions)
*   **Authentication:** Supabase Auth (`@supabase/ssr`)
*   **Storage:** Supabase Storage
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/)
*   **LLM Integration:** Google Gemini (via `@google/generative-ai`), extensible via `llmRouter.ts`
*   **Connectors:** Notion (via `@notionhq/client`), modular for extension
*   **Memory:** Custom implementation using Supabase
*   **Form Handling:** `react-hook-form` with `zod` validation
*   **Deployment:** [Vercel](https://vercel.com/)

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Spa42/macru.git
    cd macru
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or yarn install or pnpm install
    ```

3.  **Set up Supabase:**
    *   Create a Supabase project at [supabase.com](https://supabase.com/).
    *   In your Supabase project dashboard:
        *   Enable the `pgvector` extension (Database -> Extensions).
        *   Enable the `pgsodium` extension (Database -> Extensions) for future token encryption.
        *   Run *all* SQL migration scripts located in `scripts/migrations/` and `supabase/migrations/` **in numerical order** using the SQL Editor. This creates tables (`profiles`, `documents`, `chunks`, `embeddings`, `memory_items`, `connector_tokens`, `action_logs`, etc.), functions, triggers, and RLS policies.
        *   Set up Storage buckets (e.g., `documents`, `avatars`) with appropriate access policies (refer to relevant migration scripts or service logic if needed).
        *   Configure Authentication settings (e.g., email providers, enable Email Auth, disable Confirm email if testing locally, set Site URL, add Redirect URLs: `http://localhost:3000/auth/callback`).

4.  **Configure Environment Variables:**
    *   Create a `.env.local` file in the project root.
    *   Copy the relevant variables from the list below and populate them with your credentials.

5.  **Run the development server:**
    ```bash
    npm run dev
    # or yarn dev or pnpm dev
    ```

6.  Open [http://localhost:3000](http://localhost:3000) with your browser.

## Environment Variables

Create a `.env.local` file in the root directory and add the following essential variables obtained from your Supabase project dashboard and other services:

```env
# Supabase Core
NEXT_PUBLIC_SUPABASE_URL=<YOUR_SUPABASE_PROJECT_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<YOUR_SUPABASE_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SUPABASE_SERVICE_ROLE_KEY> # For server-side operations & migrations
# Get JWT Secret from Supabase Dashboard -> Project Settings -> API -> JWT Settings
SUPABASE_JWT_SECRET=<YOUR_SUPABASE_JWT_SECRET>

# LLMs (Example for Google Gemini)
GEMINI_API_KEY=<YOUR_GOOGLE_AI_API_KEY>
# Add keys for other LLMs if configured in llmRouter.ts

# Memory Layer (Optional Toggle - set to 'true' to enable)
# ENABLE_MEMORY_LAYER=false

# Notion Connector (If using)
NOTION_CLIENT_ID=<YOUR_NOTION_INTEGRATION_CLIENT_ID>
NOTION_CLIENT_SECRET=<YOUR_NOTION_INTEGRATION_CLIENT_SECRET>
# Ensure this matches the Redirect URI configured in your Notion Integration settings
NOTION_REDIRECT_URI=http://localhost:3000/api/connectors/notion/auth/callback

# Internal Sync Trigger (For background sync, e.g., Notion Supabase Function)
# Generate a strong random string for this secret
INTERNAL_API_SECRET=<A_STRONG_RANDOM_SECRET_SHARED_WITH_SUPABASE_FUNCTIONS>
# Important: Use production URL when deployed, localhost for local dev
APP_URL=http://localhost:3000

# Add other necessary variables for different connectors or services
```

**Note:** For production deployments (e.g., on Vercel), ensure all these variables are securely set in your hosting provider's environment settings, and update `NOTION_REDIRECT_URI` and `APP_URL` to your production URLs.

## Project Structure (Simplified)

*   `/app`: Next.js App Router (Pages, API Routes, Layouts).
    *   `/api`: Backend API endpoints (LLM interaction, data connectors, actions, sync).
    *   `/auth`: Authentication-related pages (login, signup, etc.).
    *   `/dashboard`: Protected user-facing pages (main chat, files, settings, profile).
*   `/components`: Reusable UI components (built with shadcn/ui).
    *   `/forms`: Form components (Profile, Login, etc.).
    *   `/layout`: Main layout structure (Sidebar, Header, etc.).
    *   `/ui`: Core shadcn/ui components and custom UI elements (Chat, FileUpload, etc.).
*   `/lib`: Core application logic.
    *   `/connectors`: Logic for connecting to external data sources (e.g., Notion).
    *   `/context`: React Context providers (e.g., Auth).
    *   `/services`: Business logic encapsulation (Auth, Files, Documents, LLM, Memory, Query, etc.).
    *   `/supabase`: Supabase client initialization (`@supabase/ssr` helpers).
    *   `/types`: TypeScript type definitions.
    *   `/utils`: General utility functions.
    *   `/validations`: Zod validation schemas.
*   `/public`: Static assets (images, fonts).
*   `/scripts`: Standalone scripts.
    *   `/migrations`: SQL database migration files (run in order).
*   `/supabase`: Supabase-specific configurations.
    *   `/functions`: Supabase Edge Functions (e.g., background Notion sync).
    *   `/migrations`: Supabase CLI generated migration files.
*   `/devlog.txt`: Detailed log of development progress, decisions, and fixes.
*   `middleware.ts`: Next.js middleware for authentication checks.
*   `next.config.ts`: Next.js configuration.
*   `tsconfig.json`: TypeScript configuration.
*   `package.json`: Project dependencies and scripts.

## Development Log

A detailed history of features, fixes, and architectural decisions is maintained in [`devlog.txt`](./devlog.txt). Refer to this file for granular details on specific implementations.

## Learn More (Next.js)

To learn more about Next.js, take a look at the following resources:

*   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
*   [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Remember to configure all necessary Environment Variables (listed above) in your Vercel project settings for the Production environment.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
