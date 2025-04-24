import { DocumentProcessor, DocumentProcessingError } from '../document-processor';

/**
 * Mock implementation for TextExtractor
 */
const mockTextExtractor = {
  extractText: async (buffer: Buffer, filename: string, fileType: string) => {
    // Return simple extraction result
    return {
      text: `Extracted text from ${filename}`,
      metadata: {
        wordCount: 10,
        charCount: 100,
        contentHash: 'mock-content-hash',
        title: filename,
        fileType: fileType
      }
    };
  }
};

/**
 * Mock implementation for DocumentChunker
 */
const mockDocumentChunker = {
  chunkDocument: (text: string, documentId: string) => {
    // Return array of 3 chunks
    return Array.from({ length: 3 }, (_, i) => ({
      id: '', // This would be set by the database
      document_id: documentId,
      content: `Chunk ${i + 1} of "${text}"`,
      chunk_index: i,
      metadata: {
        chunkIndex: i,
        charCount: 20,
        wordCount: 5
      },
      created_at: new Date().toISOString()
    }));
  }
};

/**
 * Mock implementation for EmbeddingService
 */
const mockEmbeddingService = {
  generateEmbeddings: async (chunks: any[]) => {
    // Return array of chunks with embeddings
    return chunks.map(chunk => ({
      ...chunk,
      embedding: {
        id: `emb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        chunk_id: chunk.id,
        embedding: Array(10).fill(0.1),
        model: 'gemini',
        created_at: new Date().toISOString()
      }
    }));
  }
};

/**
 * Mock implementation for Supabase client
 */
const mockSupabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: () => ({
            data: {
              id: 'mock-file-id',
              filename: 'test-document.pdf',
              file_path: 'user-1/test-document.pdf',
              file_type: 'application/pdf',
              file_size: 1024,
              user_id: 'user-1'
            },
            error: null
          })
        })
      })
    }),
    insert: (data: any) => ({
      select: () => ({
        single: () => ({
          data: {
            ...data,
            id: 'mock-doc-id'
          },
          error: null
        })
      })
    }),
    update: () => ({
      eq: () => ({
        data: null,
        error: null
      })
    })
  }),
  storage: {
    from: () => ({
      download: () => ({
        data: Buffer.from('Mock document content'),
        error: null
      })
    })
  }
};

// Mock DocumentProcessor with injected dependencies
class MockDocumentProcessor extends DocumentProcessor {
  constructor() {
    super();
    
    // Override private properties with mocks
    // @ts-ignore - Accessing private properties for testing
    this.supabase = mockSupabase;
    // @ts-ignore - Accessing private properties for testing
    this.textExtractor = mockTextExtractor;
    // @ts-ignore - Accessing private properties for testing
    this.documentChunker = mockDocumentChunker;
    // @ts-ignore - Accessing private properties for testing
    this.embeddingService = mockEmbeddingService;
  }
}

/**
 * Test document processing
 */
async function testDocumentProcessing() {
  try {
    console.log('Document processing test: Testing end-to-end document processing');
    
    const documentProcessor = new MockDocumentProcessor();
    
    // Process a mock document
    const fileId = 'mock-file-id';
    const userId = 'user-1';
    
    const result = await documentProcessor.processDocument(fileId, userId);
    
    console.log('Document processing result:', result);
    
    // Check the result
    if (!result.documentId) {
      throw new Error('Expected documentId in result');
    }
    
    if (result.status !== 'processed') {
      throw new Error(`Expected status to be 'processed', got '${result.status}'`);
    }
    
    if (!result.chunkCount || result.chunkCount !== 3) {
      throw new Error(`Expected chunkCount to be 3, got ${result.chunkCount}`);
    }
    
    console.log('Document processing test passed');
  } catch (error) {
    console.error('Document processing test failed:', error);
  }
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  try {
    console.log('Error handling test: Testing error handling during document processing');
    
    // Create a document processor with mocks that will throw errors
    class ErrorDocumentProcessor extends MockDocumentProcessor {
      constructor(errorStage: 'extraction' | 'chunking' | 'embedding' | 'storage') {
        super();
        
        // Override a specific stage to cause an error
        if (errorStage === 'extraction') {
          // @ts-ignore - Accessing private properties for testing
          this.textExtractor = {
            extractText: () => { throw new Error('Mock extraction error'); }
          };
        } else if (errorStage === 'chunking') {
          // @ts-ignore - Accessing private properties for testing
          this.documentChunker = {
            chunkDocument: () => { throw new Error('Mock chunking error'); }
          };
        } else if (errorStage === 'embedding') {
          // @ts-ignore - Accessing private properties for testing
          this.embeddingService = {
            generateEmbeddings: () => { throw new Error('Mock embedding error'); }
          };
        } else if (errorStage === 'storage') {
          // @ts-ignore - Accessing private properties for testing
          this.supabase = {
            from: () => { throw new Error('Mock storage error'); },
            storage: mockSupabase.storage
          };
        }
      }
    }
    
    // Test extraction error
    try {
      console.log('\nTesting extraction error handling:');
      const extractionProcessor = new ErrorDocumentProcessor('extraction');
      await extractionProcessor.processDocument('mock-file-id', 'user-1');
      console.error('Error handling test failed: Expected an error during extraction');
    } catch (error) {
      if (error instanceof DocumentProcessingError && error.stage === 'extraction') {
        console.log('√ Extraction error correctly handled');
      } else {
        throw error;
      }
    }
    
    // Test chunking error
    try {
      console.log('\nTesting chunking error handling:');
      const chunkingProcessor = new ErrorDocumentProcessor('chunking');
      await chunkingProcessor.processDocument('mock-file-id', 'user-1');
      console.error('Error handling test failed: Expected an error during chunking');
    } catch (error) {
      if (error instanceof DocumentProcessingError && error.stage === 'chunking') {
        console.log('√ Chunking error correctly handled');
      } else {
        throw error;
      }
    }
    
    console.log('Error handling test passed');
  } catch (error) {
    console.error('Error handling test failed:', error);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('Running DocumentProcessor tests...\n');
  
  await testDocumentProcessing();
  console.log('');
  
  await testErrorHandling();
  console.log('');
  
  console.log('All DocumentProcessor tests completed');
}

// Uncomment to run tests
// runTests().catch(console.error);

export {
  testDocumentProcessing,
  testErrorHandling,
  runTests
}; 