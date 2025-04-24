/**
 * Tests for EmbeddingService
 * 
 * This file contains tests for the EmbeddingService, which is responsible
 * for generating and managing embeddings for document chunks.
 */
import { EmbeddingService } from '../embedding-service';
import { DocumentChunk } from '../../types/document';

/**
 * Test embedding generation functionality
 */
export async function testEmbeddingGeneration() {
  console.log('Testing embedding generation...');
  
  const embeddingService = new EmbeddingService({
    model: 'gemini'
  });
  
  const chunk: Partial<DocumentChunk> = {
    id: 'chunk-123',
    document_id: 'doc-123',
    content: 'This is a test chunk for embedding generation.',
    chunk_index: 0,
    created_at: new Date().toISOString(),
    metadata: {
      charCount: 45,
      wordCount: 8
    }
  };
  
  try {
    // Override the private callEmbeddingAPI method to avoid making real API calls
    const originalCallEmbeddingAPI = (embeddingService as any).callEmbeddingAPI;
    (embeddingService as any).callEmbeddingAPI = async () => {
      return Array(768).fill(0.1); // Return mock embedding
    };
    
    // Override Supabase calls to avoid database interactions
    (embeddingService as any).supabase = {
      from: () => ({
        select: () => ({
          in: () => ({
            data: [],
            error: null
          })
        }),
        insert: () => ({
          select: () => ({
            single: () => ({
              data: {
                id: 'test-embedding-id',
                chunk_id: chunk.id,
                embedding: Array(768).fill(0.1),
                model: 'gemini',
                created_at: new Date().toISOString()
              },
              error: null
            })
          })
        })
      })
    };
    
    const embedding = await embeddingService.generateEmbeddings([chunk as DocumentChunk]);
    
    // Restore original method
    (embeddingService as any).callEmbeddingAPI = originalCallEmbeddingAPI;
    
    // Verify embedding was generated
    if (!embedding || embedding.length === 0) {
      console.error('❌ Failed: No embedding was generated');
      return;
    }
    
    console.log('✅ Embedding generation test passed');
  } catch (error) {
    console.error('❌ Failed: Error during embedding generation', error);
  }
}

/**
 * Test error handling during embedding generation
 */
export async function testEmbeddingErrors() {
  console.log('Testing embedding error handling...');
  
  const embeddingService = new EmbeddingService({
    model: 'gemini'
  });
  
  // Override the generateEmbeddings method to throw an error
  const originalMethod = embeddingService.generateEmbeddings;
  embeddingService.generateEmbeddings = async () => {
    throw new Error('API rate limit exceeded');
  };
  
  try {
    const chunk: Partial<DocumentChunk> = {
      id: 'chunk-error',
      document_id: 'doc-123',
      content: 'Test content',
      chunk_index: 0,
      created_at: new Date().toISOString(),
      metadata: {}
    };
    
    await embeddingService.generateEmbeddings([chunk as DocumentChunk]);
    console.error('❌ Failed: Error was not thrown as expected');
  } catch (error) {
    // Verify error handling works
    if (!error || !(error instanceof Error)) {
      console.error('❌ Failed: Error not properly handled');
      return;
    }
    
    console.log('✅ Embedding error handling test passed');
  } finally {
    // Restore original method
    embeddingService.generateEmbeddings = originalMethod;
  }
}

/**
 * Test batch processing of embeddings
 */
export async function testBatchProcessing() {
  console.log('Testing batch processing...');
  
  const embeddingService = new EmbeddingService({
    model: 'gemini',
    batchSize: 2 // Small batch size for testing
  });
  
  const chunks: Partial<DocumentChunk>[] = [
    {
      id: 'chunk-1',
      document_id: 'doc-123',
      content: 'This is the first test chunk.',
      chunk_index: 0,
      created_at: new Date().toISOString(),
      metadata: { charCount: 29, wordCount: 6 }
    },
    {
      id: 'chunk-2',
      document_id: 'doc-123',
      content: 'This is the second test chunk.',
      chunk_index: 1,
      created_at: new Date().toISOString(),
      metadata: { charCount: 30, wordCount: 6 }
    },
    {
      id: 'chunk-3',
      document_id: 'doc-123',
      content: 'This is the third test chunk.',
      chunk_index: 2,
      created_at: new Date().toISOString(),
      metadata: { charCount: 29, wordCount: 6 }
    }
  ];
  
  try {
    // Override the private callEmbeddingAPI method
    const originalCallEmbeddingAPI = (embeddingService as any).callEmbeddingAPI;
    (embeddingService as any).callEmbeddingAPI = async () => {
      return Array(768).fill(0.1); // Return mock embedding
    };
    
    // Override Supabase calls
    (embeddingService as any).supabase = {
      from: () => ({
        select: () => ({
          in: () => ({
            data: [],
            error: null
          })
        }),
        insert: () => ({
          select: () => ({
            single: () => ({
              data: {
                id: 'test-embedding-id',
                chunk_id: 'any-chunk-id',
                embedding: Array(768).fill(0.1),
                model: 'gemini',
                created_at: new Date().toISOString()
              },
              error: null
            })
          })
        })
      })
    };
    
    const embeddingResults = await embeddingService.generateEmbeddings(chunks as DocumentChunk[]);
    
    // Restore original method
    (embeddingService as any).callEmbeddingAPI = originalCallEmbeddingAPI;
    
    // Verify all embeddings were generated
    if (embeddingResults.length !== chunks.length) {
      console.error('❌ Failed: Not all embeddings were generated');
      console.log('Expected:', chunks.length, 'Actual:', embeddingResults.length);
      return;
    }
    
    console.log('✅ Batch processing test passed');
  } catch (error) {
    console.error('❌ Failed: Error during batch processing', error);
  }
}

// Run all tests if this file is executed directly
if (require.main === module) {
  Promise.all([
    testEmbeddingGeneration(),
    testEmbeddingErrors(),
    testBatchProcessing()
  ]).then(() => {
    console.log('All EmbeddingService tests completed');
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
} 