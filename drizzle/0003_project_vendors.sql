CREATE TABLE IF NOT EXISTS project_vendors (workspace_id text NOT NULL, id text NOT NULL, project_id text NOT NULL, vendor text NOT NULL, po_number text NOT NULL DEFAULT '', po_amount double precision NOT NULL DEFAULT 0, po_date date, letter_status text NOT NULL DEFAULT 'Not Requested', letter_requested date, letter_received date, notes text NOT NULL DEFAULT '', PRIMARY KEY (workspace_id, id));
CREATE INDEX IF NOT EXISTS project_vendors_workspace_idx ON project_vendors(workspace_id);
CREATE INDEX IF NOT EXISTS project_vendors_project_idx ON project_vendors(workspace_id, project_id);
