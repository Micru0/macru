/**
 * Test script for text extraction - JavaScript version
 * 
 * Run with:
 * node scripts/test-extractor.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample text for testing
const sampleText = 'This is a sample text.\nIt contains multiple lines.\nWe want to extract and process this text.';

// Simple mock TextExtractor for basic testing
const TextExtractor = {
  async extractText(buffer, filename, fileType) {
    if (fileType !== 'text/plain' && fileType !== 'txt') {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
    
    const text = buffer.toString('utf-8');
    const cleanedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    return {
      text: cleanedText,
      metadata: {
        title: filename,
        fileType: 'txt',
        contentHash: 'mock-hash',
        wordCount: cleanedText.split(/\s+/).filter(word => word.length > 0).length,
        charCount: cleanedText.length
      }
    };
  },

  isSupported(fileType) {
    return fileType === 'text/plain' || fileType === 'txt';
  }
};

async function main() {
  try {
    console.log('Testing simple text extraction...');
    
    // Test with a string buffer
    console.log('\nTesting text extraction from a sample text string:');
    const textBuffer = Buffer.from(sampleText, 'utf-8');
    
    const textResult = await TextExtractor.extractText(textBuffer, 'sample.txt', 'text/plain');
    console.log('Extraction successful!');
    console.log('Extracted text:', textResult.text);
    console.log('Metadata:', JSON.stringify(textResult.metadata, null, 2));
    
    // Test with actual sample.txt file from test-files directory
    const testFilePath = path.join(__dirname, 'test-files/sample.txt');
    if (fs.existsSync(testFilePath)) {
      console.log('\nTesting with sample.txt file:');
      const fileBuffer = fs.readFileSync(testFilePath);
      const fileResult = await TextExtractor.extractText(fileBuffer, 'sample.txt', 'text/plain');
      console.log('Extraction successful!');
      console.log('Metadata:', JSON.stringify(fileResult.metadata, null, 2));
      console.log('First 100 characters of text:', fileResult.text.substring(0, 100) + '...');
    } else {
      console.log(`Sample text file not found at: ${testFilePath}`);
    }
    
    // Test with an unsupported file type
    console.log('\nTesting unsupported file type handling:');
    try {
      await TextExtractor.extractText(Buffer.from('dummy content'), 'sample.jpg', 'image/jpeg');
      console.log('❌ Test failed: Expected an error for unsupported file type');
    } catch (error) {
      if (error.message.includes('Unsupported file type')) {
        console.log('✅ Test passed: Correctly rejected unsupported file type');
      } else {
        console.error('❌ Test failed with unexpected error:', error);
      }
    }
    
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}

main().catch(console.error); 