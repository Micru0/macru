import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Create streaming response
    const stream = new ReadableStream({
      start: (controller) => {
        // Keep the connection alive with regular empty messages
        const keepAliveInterval = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
        }, 15000);

        // Set up a timeout to close the connection after a while if nothing happens
        const timeout = setTimeout(() => {
          clearInterval(keepAliveInterval);
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                error: "Timeout - no data received",
                isComplete: true
              })}\n\n`
            )
          );
          controller.close();
        }, 5 * 60 * 1000); // 5 minutes

        // Store these in a global registry for cleanup from the streaming endpoint
        const connectionId = Date.now().toString();
        
        // Expose methods to the global scope for the streaming endpoint to use
        // This is not ideal but works for a simple example
        // In production, you'd use a proper message passing system or Redis
        (global as any).sseConnections = (global as any).sseConnections || {};
        (global as any).sseConnections[connectionId] = {
          sendEvent: (data: any) => {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
            );
            
            // Reset timeout on data
            clearTimeout(timeout);
            
            // Close the connection if this is the final chunk
            if (data.isComplete) {
              clearInterval(keepAliveInterval);
              controller.close();
              
              // Clean up the connection from the registry
              delete (global as any).sseConnections[connectionId];
            }
          },
          close: () => {
            clearInterval(keepAliveInterval);
            clearTimeout(timeout);
            controller.close();
            
            // Clean up the connection from the registry
            delete (global as any).sseConnections[connectionId];
          }
        };
        
        // Store the connection ID in a cookie for the POST handler to find
        const headers = new Headers();
        headers.append('Set-Cookie', `sse-connection-id=${connectionId}; Path=/; HttpOnly; SameSite=Strict`);
        
        // Return the connection info
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ connectionId, connected: true })}\n\n`
          )
        );
      },
      cancel: () => {
        // Client disconnected - clean up happens on the client side
        console.log('Client disconnected from SSE stream');
      }
    });
    
    // Return the stream as Server-Sent Events
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 