-- Make file_path nullable in documents table
ALTER TABLE documents
ALTER COLUMN file_path DROP NOT NULL; 