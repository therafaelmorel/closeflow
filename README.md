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

## Accounts, teams, and invitations

CloseFlow ships with no sample data. Every record is created by the people using it.

### Accounts

- Anyone can create their own account from the sign-in screen. Signing up is never limited to the first person.
- Each account owns a workspace of its own and is the owner of it.
- An account can also belong to any number of other workspaces it has been invited into, and switches between them from the panel in the bottom corner. Project records, teams, and people never cross between workspaces.

### Teams

- Owners and managers create teams on the **Teams** page and can assign each project to a team.
- Anyone who administers a team — an owner, a manager, or that team's lead — invites people by email address.
- Inviting someone who is already in the workspace adds them to the team immediately. Any other address gets an invitation link, copied from the Teams page and sent to that person.
- Opening the invitation link signs the invitee in and adds the workspace to their account. If they do not have an account yet, they create one on the spot and keep it. Their workspace access level and team role come from the invitation.
- An invitation can only be accepted by the address it was sent to. Invitations expire after 14 days and can be revoked at any time.

Access levels: **Owner** and **Manager** administer teams and workspace access, **Coordinator** edits project records, and **Viewer** has read-only access.

## Vendors, purchase orders, and closeout letters

Everything financial belongs to a project, so it is tracked on that project's page rather than on a page of its own.

- **Budget sheet** — assign the approved budget to cost categories and add a line item for each commitment. A line item carries the vendor's name, which is what puts that vendor on the project.
- **Vendors and closeout letters** — every vendor named on a budget line gets a card with its approved commitment, its purchase order, everything invoiced against it, and the state of its closeout letter. Letters move from Not Requested to Requested, Received, and Accepted, or are marked Not Required; the dates are stamped as the status changes.
- **Invoices** — invoices live on the project and are billed to one of its vendors. Adding one offers the project's vendors and fills in the purchase order already recorded for the vendor picked.

A vendor is settled when three things agree: its purchase order matches its approved commitment, its invoices match that purchase order, and its closeout letter is accepted or not required. Each card says which of those is off and by how much, the project header counts the letters still owed, and setting a project to Ready to Close or Closed asks for confirmation while any letter is outstanding. The dashboard counts the letters owed across every open project.

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
- Every account chooses its own password. Signing up gives an account a workspace of its own and nothing else, so a new account can never read an existing workspace.
- Reaching another workspace requires an invitation, and an invitation can only be redeemed by the email address it was addressed to.
- Every request is scoped to the workspace the session is currently working in, so switching workspaces changes what the API will read and write.
- Database credentials remain server-side in Vercel environment variables.
