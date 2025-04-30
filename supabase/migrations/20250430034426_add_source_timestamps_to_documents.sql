alter table documents
add column source_created_at timestamptz null,
add column source_updated_at timestamptz null;

-- Optional: Add indexes if you expect to query these columns frequently
create index if not exists idx_documents_source_created_at on documents (source_created_at);
create index if not exists idx_documents_source_updated_at on documents (source_updated_at);
