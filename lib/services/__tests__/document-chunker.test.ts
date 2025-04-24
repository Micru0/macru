import { DocumentChunker } from '../document-chunker';

/**
 * Test fixed chunking strategy
 */
export async function testFixedChunking() {
  console.log('Testing fixed chunking strategy...');
  
  const chunker = new DocumentChunker({
    strategy: 'fixed',
    chunkSize: 100,
    chunkOverlap: 20
  });
  
  const text = 'This is a test document. It has multiple sentences that should be properly chunked. ' +
    'We need to make sure the chunker respects sentence boundaries when possible. ' +
    'The chunker should not break sentences in the middle unless necessary. ' +
    'This will help maintain context and readability of the chunks.';
  
  const documentId = 'test-doc-123';
  const chunks = chunker.chunkDocument(text, documentId);
  
  // Verify chunks were created
  if (chunks.length === 0) {
    console.error('❌ Failed: No chunks were created');
    return;
  }
  
  // Verify chunk size is approximately as specified
  const sizeInRange = chunks.every(chunk => 
    chunk.content.length <= 120 && chunk.content.length >= 80
  );
  
  if (!sizeInRange) {
    console.error('❌ Failed: Chunk sizes are outside the expected range');
    console.log('Chunks:', chunks.map(c => c.content.length));
    return;
  }
  
  // Verify chunk overlap
  let hasOverlap = false;
  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i-1].content;
    const currentChunk = chunks[i].content;
    
    // Check if current chunk starts with the end of previous chunk
    const overlap = findOverlap(prevChunk, currentChunk);
    if (overlap.length > 0) {
      hasOverlap = true;
      break;
    }
  }
  
  if (!hasOverlap && chunks.length > 1) {
    console.error('❌ Failed: No overlap between chunks was detected');
    return;
  }
  
  console.log('✅ Fixed chunking strategy tests passed');
}

/**
 * Test paragraph chunking strategy
 */
export async function testParagraphChunking() {
  console.log('Testing paragraph chunking strategy...');
  
  const chunker = new DocumentChunker({
    strategy: 'paragraph',
    chunkSize: 150,
    chunkOverlap: 0 // No overlap in paragraph mode
  });
  
  const text = 'This is paragraph one. It contains multiple sentences.\n\n' +
    'This is paragraph two. It also has several sentences that should stay together.\n\n' +
    'This is the third paragraph. The chunker should respect these paragraph boundaries.\n\n' +
    'This is the fourth paragraph. It should be kept together as a single unit.';
  
  const documentId = 'test-doc-123';
  const chunks = chunker.chunkDocument(text, documentId);
  
  // Verify chunks were created
  if (chunks.length === 0) {
    console.error('❌ Failed: No chunks were created');
    return;
  }
  
  // Verify paragraphs are kept together when possible
  const firstChunk = chunks[0].content;
  if (!firstChunk.includes('paragraph one') || !firstChunk.includes('stay together')) {
    console.error('❌ Failed: Paragraphs not kept together');
    console.log('First chunk:', firstChunk);
    return;
  }
  
  console.log('✅ Paragraph chunking strategy tests passed');
}

/**
 * Test semantic chunking strategy
 */
export async function testSemanticChunking() {
  console.log('Testing semantic chunking strategy...');
  
  const chunker = new DocumentChunker({
    strategy: 'semantic',
    chunkSize: 200,
    chunkOverlap: 50
  });
  
  const text = '# Section 1\nThis is content for section 1.\n\n' +
    '## Subsection 1.1\nThis is content for subsection 1.1.\n\n' +
    '# Section 2\nThis is content for section 2.\n\n' +
    '## Subsection 2.1\nThis is content for subsection 2.1.';
  
  const documentId = 'test-doc-123';
  const chunks = chunker.chunkDocument(text, documentId);
  
  // Verify chunks were created
  if (chunks.length === 0) {
    console.error('❌ Failed: No chunks were created');
    return;
  }
  
  // Verify semantic sections are respected
  const firstChunk = chunks[0].content;
  const secondChunk = chunks.length > 1 ? chunks[1].content : '';
  
  if (!firstChunk.includes('Section 1') || 
      (secondChunk && !secondChunk.includes('Section 2') && chunks.length > 1)) {
    console.error('❌ Failed: Semantic sections not respected');
    console.log('Chunks:', chunks.map(c => c.content));
    return;
  }
  
  console.log('✅ Semantic chunking strategy tests passed');
}

/**
 * Find text overlap between two strings
 */
function findOverlap(str1: string, str2: string): string {
  let overlap = '';
  const minLength = Math.min(str1.length, str2.length);
  
  for (let i = 1; i <= minLength; i++) {
    const end = str1.substring(str1.length - i);
    const start = str2.substring(0, i);
    
    if (end === start) {
      overlap = end;
    }
  }
  
  return overlap;
}

/**
 * Test chunker options
 */
export async function testChunkerOptions() {
  console.log('Testing chunker options...');
  
  // Test default options
  const defaultChunker = new DocumentChunker();
  const defaultOptions = (defaultChunker as any).options;
  
  if (defaultOptions.strategy !== 'fixed' || 
      defaultOptions.chunkSize !== 1000 || 
      defaultOptions.chunkOverlap !== 200) {
    console.error('❌ Failed: Default options not as expected');
    console.log('Actual options:', defaultOptions);
    return;
  }
  
  // Test custom options
  const customChunker = new DocumentChunker({
    strategy: 'paragraph',
    chunkSize: 500,
    chunkOverlap: 100
  });
  
  const customOptions = (customChunker as any).options;
  
  if (customOptions.strategy !== 'paragraph' || 
      customOptions.chunkSize !== 500 || 
      customOptions.chunkOverlap !== 100) {
    console.error('❌ Failed: Custom options not applied correctly');
    console.log('Actual options:', customOptions);
    return;
  }
  
  console.log('✅ Chunker options tests passed');
}

/**
 * Test chunk metadata
 */
export async function testChunkMetadata() {
  console.log('Testing chunk metadata...');
  
  const chunker = new DocumentChunker({
    strategy: 'fixed',
    chunkSize: 100,
    chunkOverlap: 0
  });
  
  const text = 'This is a test document with exactly twenty-five words that should produce a single chunk with the correct metadata including character and word counts.';
  const documentId = 'test-doc-123';
  
  const chunks = chunker.chunkDocument(text, documentId);
  
  if (chunks.length !== 1) {
    console.error('❌ Failed: Expected 1 chunk but got', chunks.length);
    return;
  }
  
  const chunk = chunks[0];
  
  // Check document ID
  if (chunk.document_id !== documentId) {
    console.error('❌ Failed: Document ID not set correctly');
    console.log('Expected:', documentId);
    console.log('Actual:', chunk.document_id);
    return;
  }
  
  // Check character count
  if (chunk.metadata.charCount !== text.length) {
    console.error('❌ Failed: Character count not correct');
    console.log('Expected:', text.length);
    console.log('Actual:', chunk.metadata.charCount);
    return;
  }
  
  // Check word count
  const wordCount = text.split(/\s+/).length;
  if (chunk.metadata.wordCount !== wordCount) {
    console.error('❌ Failed: Word count not correct');
    console.log('Expected:', wordCount);
    console.log('Actual:', chunk.metadata.wordCount);
    return;
  }
  
  console.log('✅ Chunk metadata tests passed');
}

// Run all tests if this file is executed directly
if (require.main === module) {
  Promise.all([
    testFixedChunking(),
    testParagraphChunking(),
    testSemanticChunking(),
    testChunkerOptions(),
    testChunkMetadata()
  ]).then(() => {
    console.log('All DocumentChunker tests completed');
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
} 