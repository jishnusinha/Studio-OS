-- Phase D1: HNSW index for hierarchical RAG vector search (cosine)
-- Requires pgvector extension (created in 0000_init.sql)

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS asset_embeddings_embedding_hnsw_idx
  ON asset_embeddings
  USING hnsw (embedding vector_cosine_ops);
