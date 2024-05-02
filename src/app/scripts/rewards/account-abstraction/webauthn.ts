import { readClaimDataFromUrl } from "../render-transaction/read-claim-data-from-url";
import { generateSAPrivateKey } from "./sodium";
import { app } from "../app-state";
import { ethers, randomBytes } from "ethers";
import { toaster } from "../toaster";
import { EthersAdapter, SafeAccountConfig } from "@safe-global/protocol-kit";
import { SafeFactory } from "@safe-global/protocol-kit";
import { Wallet } from "ethers";
const PUBLIC_KEY = "public-key";
type SmartAccount = {
  privateKey: string;
  publicKey: string;
  mnemonic: string;
};
async function setupSafe(privateKey?: string) {
  if (!privateKey) {
    console.log("No private key provided. Skipping Safe setup.");
    return {
      safeFactory: null,
      safeAddress: null,
    };
  }

  const RPC_URL = "https://eth-sepolia.public.blastapi.io";
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(privateKey, provider);

  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: owner,
  });

  const safeFactory = await SafeFactory.create({ ethAdapter: ethAdapter });

  const safeAccountConfig: SafeAccountConfig = {
    owners: [await owner.getAddress()],
    threshold: 1,
  };

  const safeAddress = await safeFactory.predictSafeAddress(safeAccountConfig);

  const hasToasted = document.getElementsByClassName("toast .fa-circle-info info").length > 0;
  if (!hasToasted) {
    toaster.create("info", `Safe will be deployed to address: ${safeAddress}`);
  }

  return {
    safeFactory,
    safeAddress,
  };
}

export async function webAuthn(abortController: AbortController, setHasCreds: (hasCreds: boolean) => void) {
  await setupWebAuthUI();

  const userCache = localStorage.getItem("ubqfi_acc");
  const user = userCache ? JSON.parse(userCache) : null;
  const provider = new ethers.JsonRpcProvider("http://localhost:8545"); // @todo: pull from rpc-handler

  let signer: Wallet | null = null;
  let account: SmartAccount | null = null;
  let binaryID: Uint8Array | null = null;

  // auto login if user exists
  // should this be a flag saved in local storage?
  if (user) {
    binaryID = new TextEncoder().encode(user.id);
    account = await generateSAPrivateKey(user.id, binaryID);
    signer = new ethers.Wallet(account.privateKey, provider);
  } else {
    // incase they lose localStorage or want to login with a different account
    const authOptions = createCredOpts();

    try {
      const webAuthnResponse = await navigator.credentials.get({
        mediation: "conditional",
        publicKey: authOptions.publicKey,
        signal: abortController.signal,
      });

      const { id } = webAuthnResponse as PublicKeyCredential;
      localStorage.setItem("ubqfi_acc", JSON.stringify({ id }));
      binaryID = new TextEncoder().encode(id);
      account = await generateSAPrivateKey(id, binaryID);
      signer = new ethers.Wallet(account.privateKey, provider);
    } catch (err) {
      console.error(err);
    }
  }

  app.signer = signer;
  const { safeFactory, safeAddress } = await setupSafe(account?.privateKey);

  if (signer && safeFactory && safeAddress) {
    setHasCreds(true);
  }

  return {
    safeFactory,
    safeAddress,
    signer,
    account,
  };
}

export async function createPasskeyHandler({
  permits,
  setHasCreds,
  abortController,
}: {
  abortController: AbortController;
  setHasCreds: (creds: boolean) => void;
  permits?: string;
}) {
  const username = (document.getElementById("loginform.username") as HTMLInputElement).value;

  if (!username) {
    toaster.create("error", "Please enter a username.");
    return;
  }

  const credOpts = createCredOpts();
  const userCache = localStorage.getItem("ubqfi_acc");
  const user = userCache ? JSON.parse(userCache) : null;
  let cred: Credential | null = null;

  credOpts.publicKey.user = {
    id: new Uint8Array(randomBytes(64)),
    name: username,
    displayName: username,
  };

  if (user) {
    // this prevents duplicate key creation
    credOpts.publicKey.excludeCredentials = [
      {
        id: new TextEncoder().encode(user.id),
        type: PUBLIC_KEY,
      },
    ];
  }

  try {
    cred = await navigator.credentials.create({
      publicKey: credOpts.publicKey,
    });
  } catch {
    // autofill request needs aborted
    abortController.abort();
    cred = await navigator.credentials.create({
      publicKey: credOpts.publicKey,
    });
  }

  if (cred) {
    localStorage.setItem("ubqfi_acc", JSON.stringify({ id: cred.id }));

    if (abortController.signal.aborted) {
      abortController = new AbortController();
    }

    await webAuthn(abortController, setHasCreds);
    readClaimDataFromUrl(app, permits).catch(console.error);
    return;
  }

  toaster.create(
    "info",
    "If you have an account, refresh the page and login with your passkey. If you don't have an account and this problem persists, please contact us on Discord."
  );

  /*
     We cannot get granular with the error responses here because of the following:

     "In order to protect users from being identified without consent, 
      implementations of the [[Create]](origin, options, sameOriginWithAncestors)
      method need to take care to not leak information that could enable a malicious
      WebAuthn Relying Party to distinguish between these cases, where "excluded"
      means that at least one of the credentials listed by the Relying Party in
      excludeCredentials is bound to the authenticator:

      No authenticators are present.
      At least one authenticator is present, and at least one present authenticator is excluded."

      TLDR: It is not made explicit what the error is, so we can't tell the user
      what to do to fix it. We can only assume that the user has an account
      already and should login with their passkey. If they don't have an account
      and this problem persists, they should contact us on Discord for ticket support.
     */
}

async function setupWebAuthUI() {
  const isAvailable = await window.PublicKeyCredential.isConditionalMediationAvailable();

  if (!isAvailable) {
    /**
     * What happens in the event that the browser doesn't support
     * WebAuthn? isConditionalMediationAvailable doesn't mean
     * that the browser supports WebAuthn, it means that the browser
     * supports the mediation feature of WebAuthn.
     *
     * If the browser doesn't support WebAuthn, we should
     * show a message to the user that their browser doesn't
     * support WebAuthn and they should use a different browser since
     * it's a core requirement for account abstraction.
     */
    throw new Error("WebAuthn is not available");
  }
}

function createCredOpts(): CredentialCreationOptions {
  const hostname = new URL(window.location.origin).hostname;
  const NODE_ENV = process.env.NODE_ENV;

  let isCorrectUrl = false;

  if (NODE_ENV === "development") {
    isCorrectUrl = hostname === "localhost";
  } else {
    isCorrectUrl = hostname === "ubq.pay.fi";
  }

  return {
    publicKey: {
      challenge: randomBytes(32),
      user: {
        /**
         * Since the user handle is not considered personally identifying information in
         * Privacy of personally identifying information Stored in Authenticators,
         * the Relying Party MUST NOT include personally identifying information,
         * e.g., e-mail addresses or usernames, in the user handle.
         *
         * It is RECOMMENDED to let the user handle be 64 random bytes, and store this value in the user’s account.
         *
         * where we'll store it in local storage
         */
        id: new Uint8Array(),
        name: "",
        displayName: "",
      },
      authenticatorSelection: {
        authenticatorAttachment: "cross-platform",
        requireResidentKey: false,
        userVerification: "preferred",
      },
      attestation: "indirect",
      excludeCredentials: [],
      timeout: 60000,
      rp: {
        name: "Ubiquity Rewards",
        id: isCorrectUrl ? hostname : "localhost",
      },

      pubKeyCredParams: [
        {
          type: PUBLIC_KEY,
          alg: -257, // RS256
        },
        {
          type: PUBLIC_KEY,
          alg: -7, // ES256
        },
      ],
    },
  };
}
