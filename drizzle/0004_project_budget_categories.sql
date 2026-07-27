CREATE TABLE IF NOT EXISTS project_budget_categories (workspace_id text NOT NULL, project_id text NOT NULL, code text NOT NULL, name text NOT NULL, PRIMARY KEY (workspace_id, project_id, code));
CREATE INDEX IF NOT EXISTS project_budget_categories_project_idx ON project_budget_categories(workspace_id, project_id);
