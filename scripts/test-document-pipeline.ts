/**
 * Test runner for the document processing pipeline
 * 
 * This script runs all tests for the document processing pipeline:
 * - DocumentChunker tests
 * - EmbeddingService tests
 * - DocumentProcessor tests
 * - Document Ingestion API endpoint tests
 */

// Import test functions
import { 
  testFixedChunking,
  testParagraphChunking,
  testSemanticChunking,
  testChunkerOptions,
  testChunkMetadata
} from '../lib/services/__tests__/document-chunker.test';

import {
  testEmbeddingGeneration,
  testEmbeddingErrors,
  testBatchProcessing
} from '../lib/services/__tests__/embedding-service.test';

import {
  testDocumentProcessing,
  testErrorHandling
} from '../lib/services/__tests__/document-processor.test';

import {
  testPostEndpoint,
  testGetEndpoint,
  testMissingFileId
} from '../app/api/documents/ingest/__tests__/route.test';

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('======== DOCUMENT PROCESSING PIPELINE TESTS ========\n');
  
  console.log('=== DocumentChunker Tests ===');
  await testFixedChunking();
  await testParagraphChunking();
  await testSemanticChunking();
  await testChunkerOptions();
  await testChunkMetadata();
  console.log('\n');
  
  console.log('=== EmbeddingService Tests ===');
  await testEmbeddingGeneration();
  await testEmbeddingErrors();
  await testBatchProcessing();
  console.log('\n');
  
  console.log('=== DocumentProcessor Tests ===');
  await testDocumentProcessing();
  await testErrorHandling();
  console.log('\n');
  
  console.log('=== Document Ingestion API Tests ===');
  await testPostEndpoint();
  await testGetEndpoint();
  await testMissingFileId();
  console.log('\n');
  
  console.log('======== ALL TESTS COMPLETED ========');
}

// Run tests if script is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { runAllTests }; 