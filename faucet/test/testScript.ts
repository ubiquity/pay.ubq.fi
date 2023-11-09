
async function alreadySubbed() {
  const ethAddress = "0x959d25B75324fBE0ADc75a454Df286eaBc7B45a7";
  const apiUrl = `https://ubq-gas-faucet.keyrxng7749.workers.dev/faucet?address=${ethAddress}`;

    const res = await fetch(apiUrl, {
      method: "POST",
      body: JSON.stringify({ethAddress}),
      headers: { "Content-Type": "application/json" },        
    });
    console.log("============================")
    console.log("This address has already been subsidized i.e has a permit in the database & is a registered wallet address")
    console.log("res", await res.json())
}

// This will work when used against my database as this address does won't ever have a permit in the database
// but in production, this can't be hit twice for the same address as in order to get a subsidy you'll have had a permit.
async function newUser() {
  const newEthAddress = "0xAe5D1F192013db889b1e2115A370aB133f359765";
  const apiUrl = `https://ubq-gas-faucet.keyrxng7749.workers.dev/faucet?address=${newEthAddress}`;

    const res = await fetch(apiUrl, {
      method: "POST",
      body: JSON.stringify({newEthAddress}),
      headers: { "Content-Type": "application/json" },        
    });
    console.log("============================")
    console.log("This address has not been subsidized i.e has no permit in the database")
    console.log("res", await res.json())
}

async function noAddress() {
  const newEthAddress = "0x545478";
  const apiUrl = `https://ubq-gas-faucet.keyrxng7749.workers.dev/faucet?address=${newEthAddress}`;

    const res = await fetch(apiUrl, {
      method: "POST",
      body: JSON.stringify({newEthAddress}),
      headers: { "Content-Type": "application/json" },        
    });
    console.log("============================")
    console.log("This address is not registered in the database")
    console.log("res", await res.json())
  }

async function wrongMethod() {
  const newEthAddress = "0xAe5D1F192013db889b1e2115A370aB133f359765";
  const apiUrl = `https://ubq-gas-faucet.keyrxng7749.workers.dev/faucet?address=${newEthAddress}`;

    const res = await fetch(apiUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },        
    });
    console.log("============================")
    console.log("Only POST requests are allowed")
    console.log("res", await res.json())
}

async function hasEnoughGas() {
  const newEthAddress = "0xAe5D1F192013db889b1e2115A370aB133f359765";
  const apiUrl = `https://ubq-gas-faucet.keyrxng7749.workers.dev/faucet?address=${newEthAddress}`;

    const res = await fetch(apiUrl, {
      method: "POST",
      body: JSON.stringify({newEthAddress}),
      headers: { "Content-Type": "application/json" },        
    });
    console.log("============================")
    console.log("This address has enough to claim so no subsidy is needed")
    console.log("res", await res.json())
}


async function main() {
  await alreadySubbed();
  const interval = setInterval(() => console.log("Waiting for 2 seconds..."), 2000);
  
  await newUser();

  await noAddress();

  await wrongMethod();

  await hasEnoughGas();

  
  clearInterval(interval);

  return
}

main();