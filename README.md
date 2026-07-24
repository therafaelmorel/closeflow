# CloseFlow

CloseFlow is a focused project closeout tracker for aging construction and facilities projects. It tracks outstanding invoices, missing documents, responsible parties, due dates, follow-ups, financial status, and the final steps required to close each project.

## Stack

- React, TypeScript, and Vite
- Vercel static hosting and Node.js API functions
- Neon Postgres
- Drizzle ORM
- Server-side password hashing and HTTP-only session cookies

## Connect the database on Vercel

1. Open the **CloseFlow** project in Vercel.
2. Open **Storage** or **Marketplace** and add **Neon Postgres**.
3. Connect the Neon resource to the CloseFlow project.
4. Confirm that Vercel added `POSTGRES_URL` to Production, Preview, and Development.
5. Redeploy the latest commit.

CloseFlow creates the required tables automatically on the first API request. The matching Drizzle schema and SQL migration are also included in `db/schema.ts` and `drizzle/0000_closeflow.sql`.

## Existing browser data

After the first database administrator account is created, CloseFlow checks the current browser for the previous `localStorage` workspace. When the database workspace is empty, those projects, closeout items, invoices, and activities are imported automatically.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Create a production build:

```bash
npm run build
```

Generate or push Drizzle migrations when working manually:

```bash
npm run db:generate
npm run db:push
```

## Security model

- Passwords are hashed server-side with Node.js `scrypt` and a unique salt.
- Login sessions use random opaque tokens stored as SHA-256 hashes in Postgres.
- The browser receives an HTTP-only, SameSite cookie; JavaScript cannot read it.
- Only the first account can self-register. It becomes the workspace owner.
- Database credentials remain server-side in Vercel environment variables.
