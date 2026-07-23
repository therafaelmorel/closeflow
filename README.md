# CloseFlow

CloseFlow is a lightweight project closeout tracker for aging construction and facilities projects. It helps teams identify what is keeping a project open, assign the next action, track invoices and closeout documents, and verify that everything is resolved before final closure.

## Included in the first release

- Dashboard with closeout KPIs and an attention queue
- Project list with search and status filtering
- Project detail view with progress, financial summary, outstanding items, invoices, and activity history
- Outstanding-item tracking with responsibility, amount, priority, due date, and status
- Invoice workflow from requested through paid
- Follow-up queue for overdue and aging items
- Basic operational reports
- Browser-based local persistence
- Responsive layout for desktop and mobile

## Run locally

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
```

## Data storage

This MVP stores data in the browser using `localStorage`, so it works immediately without database configuration. A future production version can replace the storage adapter with Supabase, PostgreSQL, or another backend without changing the core UI model.
