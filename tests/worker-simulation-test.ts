import { createRpcClient, type JsonRpcResponse } from "@ubiquity-dao/permit2-rpc-client";
import { encodeFunctionData, parseAbiItem } from "viem";

// Simulate the EXACT worker logic to see what's different
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const OWNER = "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d";
const RPC_BASE_URL = "https://rpc.ubq.fi";

const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

interface MockPermit {
  nonce: string;
  signature: string;
  permit2Address: string;
  owner: string;
}

// Use real nonces from sandbox output - TEST BOTH PERMIT2 AND PERMIT3
const mockPermits: MockPermit[] = [
  {
    nonce: "6797697161528285460680889633397229646849100107320033231664414039692174174409",
    signature: "0xd0be086c001",
    permit2Address: PERMIT2_ADDRESS, // Permit2 contract
    owner: OWNER
  },
  {
    nonce: "6797697161528285460680889633397229646849100107320033231664414039692174174409", 
    signature: "0xd0be086c001_p3",
    permit2Address: "0xd635918A75356D133d5840eE5c9ED070302C9C60", // Permit3 contract - same nonce
    owner: OWNER
  },
  {
    nonce: "92292347009732944644666865741722721921941459254826590801203754035986756711747", 
    signature: "0x6fb5663d002",
    permit2Address: PERMIT2_ADDRESS,
    owner: OWNER
  },
  {
    nonce: "100", // Simple nonce
    signature: "0x12345678003",
    permit2Address: PERMIT2_ADDRESS,
    owner: OWNER
  },
  {
    nonce: "256", // Another simple nonce
    signature: "0x87654321004",
    permit2Address: PERMIT2_ADDRESS,
    owner: OWNER
  },
  {
    nonce: "1000", // Yet another
    signature: "0xabcdef12005", 
    permit2Address: PERMIT2_ADDRESS,
    owner: OWNER
  }
];

// Simulate the worker's nonce check request creation
function createNonceCheckRequest(permit: MockPermit, requestId: number) {
  const owner = permit.owner as `0x${string}`;
  const wordPos = BigInt(permit.nonce) >> 8n;
  
  return {
    request: {
      jsonrpc: "2.0" as const,
      method: "eth_call" as const,
      params: [
        { 
          to: permit.permit2Address, 
          data: encodeFunctionData({ 
            abi: [permit2Abi], 
            functionName: "nonceBitmap", 
            args: [owner, wordPos] 
          }) 
        },
        "latest",
      ],
      id: requestId,
    },
    key: permit.signature,
    type: "nonce",
    chainId: 100,
    permit: permit
  };
}

// Simulate the worker's response handling
function handleNonceCheckResponse(
  batchReq: { request: any; key: string; type: string; chainId: number; permit: MockPermit },
  res: JsonRpcResponse | undefined
) {
  const permit = batchReq.permit;
  let updateData: any = {};

  console.log(`\n🔍 SIMULATING WORKER LOGIC for ${permit.signature}`);
  console.log(`  Nonce: ${permit.nonce}`);
  console.log(`  WordPos: ${BigInt(permit.nonce) >> 8n}`);
  console.log(`  BitPos: ${BigInt(permit.nonce) & 255n}`);

  if (!res) {
    updateData.checkError = `Batch response missing (${batchReq.type})`;
    console.log(`  ❌ No response`);
  } else if (res.error) {
    updateData.checkError = `Check failed (${batchReq.type}). ${res.error.message}`;
    console.log(`  ❌ RPC Error: ${res.error.message}`);
  } else if (res.result !== undefined && res.result !== null) {
    try {
      console.log(`  📥 Raw result: ${res.result}`);
      const bitmap = BigInt(res.result as string);
      console.log(`  📊 Bitmap: 0x${bitmap.toString(16)}`);
      
      // This is the EXACT logic from the worker
      updateData.isNonceUsed = Boolean(bitmap & (1n << (BigInt(permit.nonce) & 255n)));
      updateData.status = updateData.isNonceUsed ? "Claimed" : "Valid";
      
      console.log(`  🔢 Bit calculation: ${bitmap.toString(16)} & ${(1n << (BigInt(permit.nonce) & 255n)).toString(16)} = ${(bitmap & (1n << (BigInt(permit.nonce) & 255n))).toString(16)}`);
      console.log(`  🎯 Final result: isNonceUsed=${updateData.isNonceUsed}, status=${updateData.status}`);
      
    } catch (parseError: unknown) {
      updateData.checkError = `Result parse error (${batchReq.type}). ${parseError instanceof Error ? parseError.message : String(parseError)}`;
      console.log(`  ❌ Parse error: ${parseError}`);
    }
  } else {
    updateData.checkError = `Empty result (${batchReq.type})`;
    console.log(`  ❌ Empty result`);
  }

  return updateData;
}

async function simulateWorkerLogic() {
  console.log("=== WORKER LOGIC SIMULATION ===");
  console.log("Simulating exact worker nonce checking logic...");
  
  const rpcClient = createRpcClient({ baseUrl: RPC_BASE_URL });
  
  // Create batch requests exactly like the worker does
  const batchRequests = mockPermits.map((permit, index) => 
    createNonceCheckRequest(permit, index + 1)
  );
  
  console.log(`\nMaking batch request with ${batchRequests.length} nonce checks...`);
  console.log(`Using network ID: 100 (Gnosis)`);
  console.log(`Using RPC URL: ${RPC_BASE_URL}`);
  
  // Also test with mainnet to see if there's a difference
  console.log(`\n🔍 TESTING MAINNET VS GNOSIS DIFFERENCE:`);
  
  try {
    const testRequest = batchRequests[0];
    console.log(`Testing same request on both networks...`);
    
    const gnosisResponse = await rpcClient.request(100, testRequest.request); // Gnosis
    const mainnetResponse = await rpcClient.request(1, testRequest.request);   // Mainnet
    
    const gnosisBitmap = 'result' in gnosisResponse ? BigInt(gnosisResponse.result as string) : null;
    const mainnetBitmap = 'result' in mainnetResponse ? BigInt(mainnetResponse.result as string) : null;
    
    console.log(`  Gnosis (100): ${gnosisBitmap?.toString(16) || 'ERROR'}`);
    console.log(`  Mainnet (1): ${mainnetBitmap?.toString(16) || 'ERROR'}`);
    
    if (gnosisBitmap !== mainnetBitmap) {
      console.log(`  🚨 DIFFERENT RESULTS! Network mismatch could be the issue!`);
    } else {
      console.log(`  ✅ Same results on both networks`);
    }
    
  } catch (error) {
    console.log(`  ❌ Network comparison failed: ${error}`);
  }
  
  try {
    const batchPayload = batchRequests.map(br => br.request);
    const batchResponses = await rpcClient.request(100, batchPayload) as JsonRpcResponse[];
    
    console.log(`Received ${batchResponses.length} responses`);
    
    // Process responses exactly like the worker does
    console.log(`\n🔍 CHECKING RESPONSE-REQUEST MAPPING:`);
    batchResponses.forEach((res, index) => {
      const batchReq = batchRequests[index];
      
      console.log(`\nResponse ${index}:`);
      console.log(`  Request ID: ${batchReq.request.id}`);
      console.log(`  Response ID: ${res.id}`);
      console.log(`  IDs match: ${batchReq.request.id === res.id}`);
      
      if (batchReq.request.id !== res.id) {
        console.log(`  🚨 ID MISMATCH! This could cause wrong response to be processed!`);
      }
      
      const result = handleNonceCheckResponse(batchReq, res);
      console.log(`  ✅ Final update data:`, result);
    });
    
  } catch (error) {
    console.log(`❌ Batch request failed: ${error}`);
    
    // Check if this could be causing fallback behavior
    console.log(`\n🤔 HYPOTHESIS: If batch requests are failing, maybe worker defaults to marking everything as 'used' for safety?`);
  }
}

// Also test what happens with malformed/missing responses
async function testEdgeCases() {
  console.log(`\n=== EDGE CASE TESTING ===`);
  
  const mockPermit = mockPermits[0];
  
  // Test undefined response
  console.log(`\nTesting undefined response:`);
  const result1 = handleNonceCheckResponse(
    { request: {}, key: "test", type: "nonce", chainId: 100, permit: mockPermit },
    undefined
  );
  console.log(`Result:`, result1);
  
  // Test error response
  console.log(`\nTesting error response:`);
  const result2 = handleNonceCheckResponse(
    { request: {}, key: "test", type: "nonce", chainId: 100, permit: mockPermit },
    { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "execution reverted" } }
  );
  console.log(`Result:`, result2);
  
  // Test null result
  console.log(`\nTesting null result:`);
  const result3 = handleNonceCheckResponse(
    { request: {}, key: "test", type: "nonce", chainId: 100, permit: mockPermit },
    { jsonrpc: "2.0", id: 1, result: null }
  );
  console.log(`Result:`, result3);
  
  // Test invalid result
  console.log(`\nTesting invalid result:`);
  const result4 = handleNonceCheckResponse(
    { request: {}, key: "test", type: "nonce", chainId: 100, permit: mockPermit },
    { jsonrpc: "2.0", id: 1, result: "invalid" }
  );
  console.log(`Result:`, result4);
}

simulateWorkerLogic()
  .then(() => testEdgeCases())
  .catch(console.error);