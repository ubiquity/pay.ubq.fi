import { createRpcClient } from "@ubiquity-dao/permit2-rpc-client";
import { encodeFunctionData, parseAbiItem } from "viem";

// Test bitmap calls with specific nonces from sandbox output
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const OWNER = "0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d";
const RPC_BASE_URL = "https://rpc.ubq.fi";

const permit2Abi = parseAbiItem("function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)");

const testNonces = [
  "6797697161528285460680889633397229646849100107320033231664414039692174174409", // First permit from sandbox
  "92292347009732944644666865741722721921941459254826590801203754035986756711747", // Second permit
  "100", // Simple test nonce
  "256", // Simple test nonce  
  "0"    // Zero nonce
];

async function testBitmaps() {
  console.log("=== BITMAP DEBUG TEST ===");
  console.log("Testing RPC reliability with multiple calls...");
  
  const rpcClient = createRpcClient({ baseUrl: RPC_BASE_URL });
  
  // Test RPC reliability by making multiple calls to the same nonce
  const testNonce = testNonces[0]; // First nonce from sandbox
  const nonceBigInt = BigInt(testNonce);
  const wordPos = nonceBigInt >> 8n;
  
  console.log(`\n🔍 RPC RELIABILITY TEST - Making 5 calls for same nonce: ${testNonce.slice(0,20)}...`);
  
  for (let i = 1; i <= 5; i++) {
    try {
      const request = {
        jsonrpc: "2.0" as const,
        method: "eth_call" as const,
        params: [
          {
            to: PERMIT2_ADDRESS,
            data: encodeFunctionData({
              abi: [permit2Abi],
              functionName: "nonceBitmap",
              args: [OWNER as `0x${string}`, wordPos]
            })
          },
          "latest"
        ],
        id: i
      };
      
      const start = Date.now();
      const response = await rpcClient.request(100, request);
      const duration = Date.now() - start;
      
      process.stdout.write(`Call ${i}: ${duration}ms `);
      
      if ('error' in response && response.error) {
        console.log(` ❌ ERROR: ${response.error.message}`);
      } else if ('result' in response && response.result) {
        console.log(` ✅ Result: 0x${BigInt(response.result as string).toString(16)}`);
      } else {
        console.log(` ❌ NO RESULT`);
      }
      
    } catch (error) {
      console.log(`Call ${i}: ❌ EXCEPTION: ${error}`);
    }
  }
  
  console.log(`\n=== DETAILED NONCE TESTS ===`);
  
  for (const nonce of testNonces) {
    const nonceBigInt = BigInt(nonce);
    const wordPos = nonceBigInt >> 8n;
    const bitPos = nonceBigInt & 255n;
    
    console.log(`\n🔍 Testing nonce: ${nonce}`);
    console.log(`WordPos: ${wordPos}`);
    console.log(`BitPos: ${bitPos}`);
    
    try {
      const request = {
        jsonrpc: "2.0" as const,
        method: "eth_call" as const,
        params: [
          {
            to: PERMIT2_ADDRESS,
            data: encodeFunctionData({
              abi: [permit2Abi],
              functionName: "nonceBitmap",
              args: [OWNER as `0x${string}`, wordPos]
            })
          },
          "latest"
        ],
        id: 1
      };
      
      console.log(`RPC Request data: ${request.params[0].data}`);
      
      const response = await rpcClient.request(100, request);
      
      if ('error' in response && response.error) {
        console.log(`❌ RPC Error: ${response.error.message}`);
        continue;
      }
      
      if ('result' in response && response.result) {
        const bitmap = BigInt(response.result as string);
        const isUsed = Boolean(bitmap & (1n << bitPos));
        
        console.log(`✅ Bitmap result: 0x${bitmap.toString(16)}`);
        console.log(`   Bitmap (decimal): ${bitmap}`);
        console.log(`   Expected bit (1 << ${bitPos}): 0x${(1n << bitPos).toString(16)}`);
        console.log(`   Bitwise AND result: 0x${(bitmap & (1n << bitPos)).toString(16)}`);
        console.log(`   Nonce is used: ${isUsed}`);
        
        // Special analysis for suspicious patterns
        if (bitmap === 0n) {
          console.log(`   🟢 BITMAP IS ZERO - All nonces in this word are UNUSED`);
        } else if (bitmap === (2n ** 256n - 1n)) {
          console.log(`   🔴 BITMAP IS ALL 1s - All nonces in this word are USED`);
        } else {
          const setBits = bitmap.toString(2).split('').filter(b => b === '1').length;
          console.log(`   📊 Bitmap has ${setBits} bits set out of 256`);
        }
      } else {
        console.log(`❌ No result in response`);
      }
      
    } catch (error) {
      console.log(`❌ Request failed: ${error}`);
    }
  }
}

async function testBatchRequests() {
  console.log("\n=== BATCH REQUEST TEST ===");
  console.log("Testing batch RPC requests like the worker does...");
  
  const rpcClient = createRpcClient({ baseUrl: RPC_BASE_URL });
  
  // Create batch requests for first few nonces
  const batchRequests = testNonces.slice(0, 3).map((nonce, index) => {
    const nonceBigInt = BigInt(nonce);
    const wordPos = nonceBigInt >> 8n;
    
    return {
      jsonrpc: "2.0" as const,
      method: "eth_call" as const,
      params: [
        {
          to: PERMIT2_ADDRESS,
          data: encodeFunctionData({
            abi: [permit2Abi],
            functionName: "nonceBitmap",
            args: [OWNER as `0x${string}`, wordPos]
          })
        },
        "latest"
      ],
      id: index + 1
    };
  });
  
  console.log(`Making batch request with ${batchRequests.length} calls...`);
  
  try {
    const start = Date.now();
    const responses = await rpcClient.request(100, batchRequests);
    const duration = Date.now() - start;
    
    console.log(`Batch completed in ${duration}ms`);
    console.log(`Responses received: ${Array.isArray(responses) ? responses.length : 'single response'}`);
    
    if (Array.isArray(responses)) {
      responses.forEach((response, index) => {
        console.log(`\nResponse ${index + 1}:`);
        if ('error' in response && response.error) {
          console.log(`  ❌ ERROR: ${response.error.message}`);
        } else if ('result' in response && response.result) {
          const bitmap = BigInt(response.result as string);
          console.log(`  ✅ Result: 0x${bitmap.toString(16)} (${bitmap === 0n ? 'ALL UNUSED' : 'SOME USED'})`);
        } else {
          console.log(`  ❌ NO RESULT`);
        }
      });
    } else {
      console.log("Single response received instead of array:", responses);
    }
    
  } catch (error) {
    console.log(`❌ BATCH EXCEPTION: ${error}`);
  }
}

testBitmaps()
  .then(() => testBatchRequests())
  .catch(console.error);