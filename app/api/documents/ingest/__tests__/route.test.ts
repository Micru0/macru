/**
 * Tests for document ingestion API route
 * 
 * This file tests the API endpoints for document ingestion
 */

import { NextRequest } from 'next/server';
import { POST, GET } from '../route';

// Create manual mocks since we're not using Jest
// Mock the auth session
const mockSession = {
  user: { id: 'mock-user-id' }
};

// Mock the document processor result
const mockProcessResult = {
  documentId: 'mock-doc-id',
  status: 'processed',
  chunkCount: 3
};

// Save original function references
let originalCreateRouteHandlerClient: any;
let originalDocumentProcessor: any;

// Create simple manual mocks
const setupMocks = () => {
  // Save original implementations
  const authHelpers = require('@supabase/auth-helpers-nextjs');
  const docProcessor = require('../../../../../lib/services/document-processor');
  
  originalCreateRouteHandlerClient = authHelpers.createRouteHandlerClient;
  originalDocumentProcessor = docProcessor.documentProcessor;
  
  // Mock auth helpers
  authHelpers.createRouteHandlerClient = () => ({
    auth: {
      getSession: async () => ({
        data: { session: mockSession }
      })
    }
  });
  
  // Mock document processor
  docProcessor.documentProcessor = {
    processDocument: async (fileId: string, userId: string) => mockProcessResult
  };
};

// Restore original modules
const cleanupMocks = () => {
  try {
    // Restore original implementations
    const authHelpers = require('@supabase/auth-helpers-nextjs');
    const docProcessor = require('../../../../../lib/services/document-processor');
    
    if (originalCreateRouteHandlerClient) {
      authHelpers.createRouteHandlerClient = originalCreateRouteHandlerClient;
    }
    
    if (originalDocumentProcessor) {
      docProcessor.documentProcessor = originalDocumentProcessor;
    }
  } catch (error) {
    console.error('Error restoring original modules:', error);
  }
};

/**
 * Test the POST endpoint for document ingestion
 */
async function testPostEndpoint() {
  try {
    console.log('Testing POST endpoint for document ingestion');
    
    // Setup mocks
    setupMocks();
    
    // Create a mock request
    const request = new NextRequest('http://localhost:3000/api/documents/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: 'mock-file-id',
        options: {
          chunkSize: 100,
          chunkOverlap: 20
        }
      })
    });
    
    // Call the endpoint
    const response = await POST(request);
    
    // Check the response
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    
    // Verify response
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    
    if (!data.success) {
      throw new Error('Expected success to be true');
    }
    
    if (data.documentId !== 'mock-doc-id') {
      throw new Error(`Expected documentId to be 'mock-doc-id', got '${data.documentId}'`);
    }
    
    console.log('POST endpoint test passed');
    
    // Clean up mocks
    cleanupMocks();
  } catch (error) {
    console.error('POST endpoint test failed:', error);
    // Clean up mocks in case of error
    cleanupMocks();
  }
}

/**
 * Test the GET endpoint for checking ingestion status
 */
async function testGetEndpoint() {
  try {
    console.log('Testing GET endpoint for checking ingestion status');
    
    // Setup mocks
    setupMocks();
    
    // Create a mock request
    const request = new NextRequest('http://localhost:3000/api/documents/ingest?documentId=mock-doc-id', {
      method: 'GET'
    });
    
    // Call the endpoint
    const response = await GET(request);
    
    // Check the response
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    
    // We can't actually verify the response without mocking the database query
    // This is just a demonstration of how the test would be structured
    console.log('GET endpoint test completed');
    
    // Clean up mocks
    cleanupMocks();
  } catch (error) {
    console.error('GET endpoint test failed:', error);
    // Clean up mocks in case of error
    cleanupMocks();
  }
}

/**
 * Test error handling for missing fileId
 */
async function testMissingFileId() {
  try {
    console.log('Testing error handling for missing fileId');
    
    // Setup mocks
    setupMocks();
    
    // Create a mock request with missing fileId
    const request = new NextRequest('http://localhost:3000/api/documents/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        options: {
          chunkSize: 100
        }
      })
    });
    
    // Call the endpoint
    const response = await POST(request);
    
    // Check the response
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    
    // Verify response
    if (response.status !== 400) {
      throw new Error(`Expected status 400, got ${response.status}`);
    }
    
    if (data.success !== false) {
      throw new Error('Expected success to be false');
    }
    
    console.log('Missing fileId test passed');
    
    // Clean up mocks
    cleanupMocks();
  } catch (error) {
    console.error('Missing fileId test failed:', error);
    // Clean up mocks in case of error
    cleanupMocks();
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('Running document ingestion API tests...\n');
  
  await testPostEndpoint();
  console.log('');
  
  await testGetEndpoint();
  console.log('');
  
  await testMissingFileId();
  console.log('');
  
  console.log('All document ingestion API tests completed');
}

// Uncomment to run tests
// runTests().catch(console.error);

export {
  testPostEndpoint,
  testGetEndpoint,
  testMissingFileId,
  runTests
}; 