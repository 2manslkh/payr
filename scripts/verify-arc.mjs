const rpcUrl = process.env.ARC_RPC_URL;
const expectedChainId = process.env.ARC_CHAIN_ID;

if (!rpcUrl || !expectedChainId) {
  console.error("Arc verification requires ARC_RPC_URL and ARC_CHAIN_ID.");
  process.exit(1);
}

let expectedHexChainId;
try {
  expectedHexChainId = `0x${BigInt(expectedChainId).toString(16)}`;
} catch {
  console.error("Arc verification requires ARC_CHAIN_ID to be an integer.");
  process.exit(1);
}

try {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });

  if (!response.ok) {
    throw new Error("RPC request failed");
  }

  const body = await response.json();
  if (typeof body?.result !== "string" || body.result !== expectedHexChainId) {
    console.error("Arc chain ID did not match ARC_CHAIN_ID.");
    process.exit(1);
  }

  console.log(`Arc RPC verified for chain ${expectedChainId}.`);
} catch (error) {
  if (error instanceof Error && error.message === "RPC request failed") {
    console.error("Arc RPC request failed.");
  } else {
    console.error("Arc RPC verification failed.");
  }
  process.exit(1);
}
