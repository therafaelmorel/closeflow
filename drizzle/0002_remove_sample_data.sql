CREATE TABLE IF NOT EXISTS closeflow_meta (key text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
DELETE FROM activities WHERE project_id IN ('p1','p2','p3','p4','p5') OR id IN ('a1','a2','a3','a4');
DELETE FROM invoices WHERE project_id IN ('p1','p2','p3','p4','p5') OR id IN ('v1','v2','v3','v4');
DELETE FROM closeout_items WHERE project_id IN ('p1','p2','p3','p4','p5') OR id IN ('i1','i2','i3','i4','i5','i6','i7','i8');
DELETE FROM project_budget_category_funds WHERE project_id IN ('p1','p2','p3','p4','p5');
DELETE FROM project_budget_lines WHERE project_id IN ('p1','p2','p3','p4','p5');
DELETE FROM projects WHERE id IN ('p1','p2','p3','p4','p5');
INSERT INTO closeflow_meta (key) VALUES ('sample_data_removed') ON CONFLICT DO NOTHING;
