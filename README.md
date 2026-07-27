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

## Teams and invitations

CloseFlow ships with no sample data. The workspace starts empty and every record is created by the people using it.

- The first account to sign up becomes the workspace owner.
- Owners and managers create teams on the **Teams** page and can assign each project to a team.
- Anyone who administers a team — an owner, a manager, or that team's lead — invites people by email address.
- Inviting someone who already has an account adds them to the team immediately. Inviting a new email address creates an invitation link that is copied from the Teams page and sent to that person.
- Opening the invitation link shows a join screen where the invitee sets their own password. Their workspace access level and team role come from the invitation.
- Invitations expire after 14 days and can be revoked at any time.

Access levels: **Owner** and **Manager** administer teams and workspace access, **Coordinator** edits project records, and **Viewer** has read-only access.

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
- Every later account is created from an invitation, and the invitee chooses their own password.
- Database credentials remain server-side in Vercel environment variables.
