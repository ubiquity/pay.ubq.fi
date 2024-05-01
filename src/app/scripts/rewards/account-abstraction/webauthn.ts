import { readClaimDataFromUrl } from "../render-transaction/read-claim-data-from-url";
import { generateSAPrivateKey } from "./sodium";
import { app } from "../app-state";
const PUBLIC_KEY = "public-key";
import { ethers, randomBytes } from "ethers";
import { toaster } from "../toaster";

type CacheUser = {
  id: string;
  idx: Uint8Array;
};

export async function webAuthn() {
  const { createPasskeyButton, thead, isAvailable } = await setupWebAuthUI();

  const abortController = new AbortController();
  const signal = abortController.signal;

  const userCache = localStorage.getItem("ubqfi_acc");
  const user = userCache ? JSON.parse(userCache) : null;

  const credOpts = createCredOpts();

  // this lets them create a credential set if they don't have one in local storage
  createPasskeyButton.addEventListener("click", (e) => createPasskeyHandler(e, { credOpts, abortController, thead, user }));

  // this allows the sign in process to be triggered if they have a credential set in local storage
  if (isAvailable) {
    const authOptions = createCredOpts();

    // auto login if user exists
    // should this be a flag saved in local storage?
    if (user) {
      const arrBuffer = new TextEncoder().encode(user.id);

      const pk = await generateSAPrivateKey(user.id, arrBuffer);
      const provider = new ethers.JsonRpcProvider("http://localhost:8545"); // @todo: pull from rpc-handler

      const signer = new ethers.Wallet(pk.privateKey, provider);

      app.signer = signer;

      readClaimDataFromUrl(app).catch(console.error); // @DEV: read claim data from URL
    }

    // incase they lose localStorage or want to login with a different account
    try {
      const webAuthnResponse = await navigator.credentials.get({
        mediation: "conditional",
        publicKey: authOptions.publicKey,
        signal,
      });

      if (webAuthnResponse) {
        const { id, rawId } = webAuthnResponse as PublicKeyCredential;
        localStorage.setItem("ubqfi_acc", JSON.stringify({ id, idx: new Uint8Array(rawId) }));

        const binaryID = new Uint8Array(rawId);
        const acc = await generateSAPrivateKey(id, binaryID);

        const signer = new ethers.Wallet(acc.privateKey);
        app.signer = signer;

        readClaimDataFromUrl(app).catch(console.error);
      }

      // @TODO: handling for cancels, errors, etc
    } catch (err) {
      console.error(err);
    }
  } else {
    alert("WebAuthn is not supported on this device");
  }

  // Handle Safe setup and deployment
  // needs polyfills for assert, http, stream
}

async function createPasskeyHandler(
  e: MouseEvent,
  {
    credOpts,
    abortController,
    thead,
    user,
  }: { credOpts: CredentialCreationOptions; abortController: AbortController; thead: HTMLTableSectionElement; user: CacheUser }
) {
  const username = (document.getElementById("loginform.username") as HTMLInputElement).value;

  if (!username) {
    alert("Username is required");
    return;
  }

  if (user) {
    // this prevents duplicate key creation
    credOpts.publicKey.excludeCredentials = [
      {
        id: new ArrayBuffer(user.idx),
        type: PUBLIC_KEY,
      },
    ];
  }

  // is a webauthn request pending already if so cancel
  abortController.abort();

  credOpts.publicKey.user = {
    id: new Uint8Array(randomBytes(64)),
    name: username,
    displayName: username,
  };

  let cred;

  try {
    cred = await navigator.credentials.create({
      publicKey: credOpts.publicKey,
    });
  } catch {
    /** */
  }

  if (!cred) {
    /*
     we are not allowing them to create a new credential set with the current
     one saved in local storage.

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

    toaster.create(
      "info",
      "If you have an account, please login with your passkey. If you don't have an account and this problem persists, please contact us on Discord."
    );

    setTimeout(() => {
      window.location.reload();
    }, 5000);

    return;
  }

  const { id, rawId } = cred as PublicKeyCredential;

  localStorage.setItem("ubqfi_acc", JSON.stringify({ id, idx: new Uint8Array(rawId) }));

  const hasCreds = await webAuthn();

  if (hasCreds) {
    thead.innerHTML = "";
    readClaimDataFromUrl(app).catch(console.error);
  }

  // TODO: handle errors
}

function createCredOpts(): CredentialCreationOptions {
  let RP_ID;
  const host = window.location.origin;

  const hostname = new URL(host).hostname;
  const NODE_ENV = process.env.NODE_ENV;

  let isCorrectUrl = false;

  if (NODE_ENV === "development") {
    isCorrectUrl = hostname === "localhost";
  } else {
    isCorrectUrl = hostname === "ubq.pay.fi";
  }

  if (isCorrectUrl) {
    RP_ID = hostname;
  } else {
    RP_ID = "localhost";
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
        id: RP_ID,
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

async function setupWebAuthUI() {
  const isAvailable = await window.PublicKeyCredential.isConditionalMediationAvailable();

  if (!isAvailable) {
    /**
     * What happens in the event that the browser doesn't support
     * WebAuthn? No account for them I guess but most support so
     * it should be fine probs
     */
    throw new Error("WebAuthn is not available");
  }

  const tableElement = document.getElementsByTagName(`table`)[0];
  if (!tableElement) {
    throw new Error("Table element not found");
  }

  const thead = tableElement.getElementsByTagName(`thead`)[0];

  if (!thead) {
    throw new Error("Table header not found");
  }

  const newHtml = `
  <tr>
  <th>
  <div>Username</div>
  </th>
  <td>
  <input name="username" id="loginform.username" autocomplete="username webauthn" />
  </td>
  </tr>
  <tr>
  <th>
  </th>
  <td>
  <div class="button-container">
  <button class="help-button" type="button">Help</button>
  <button type="submit">Login</button>
  </div>
  </td>
  </tr>
  `;

  thead.innerHTML = newHtml;

  const helpModal = document.createElement("div");
  helpModal.id = "help-modal";
  helpModal.innerHTML = `
  <div id="help-modal" >
  <div class="modal-content" data-modal-close="false">
  <span class="close">&times;</span>
  <br/>
  <ul>
    <p>
    After focusing on the input field, you will be prompted to use a passkey to login to your Ubiquity Rewards account.
    </p>
    <p>
    If you have already created an account, select the passkey you used to create your account.
    <p>
    To create an account, ignore the passkey prompt and enter your username, it can be any username you like, although we recommend that it is not personally identifiable such as an email, or GitHub username.
    </p>
    <p>
    After entering your username, click on the login button and your new account will be created after completing the passkey registration process.
    </p>
    <p>
    We do not store any sensitive information with the exception of an account identifier in your browser's local storage for future logins.
    </p>
    <p>
    If an account exists in your local storage, you will not be able to create a new account with the same username this is to avoid duplicate keys being created for the same account. You can bypass this by clearing your local storage but it is not recommended.
    </p>
    <p>
    If your local storage is cleared, you can recover your account by using the passkey you used to create your account. If this is not an option, account recovery is not possible unless you have a backup of your private key.
    </p>
    <p>
    Backing up your private key can be done via the mnemonic phrase generated when you create your account. This phrase is not stored by us and is your responsibility to keep safe.
    </p>
    <br/>
  <p>
  If you have any questions, please contact us on Discord.
  </p>
  </div>
  </div>
  `;

  const helpButton = tableElement.getElementsByClassName(`help-button`)[0] as HTMLButtonElement;
  if (!helpButton) {
    throw new Error("Help button element not found");
  }

  const mainElement = document.getElementsByTagName(`main`)[0];
  if (!mainElement) {
    throw new Error("Main element not found");
  }
  const modalContent = helpModal.getElementsByClassName(`modal-content`)[0] as HTMLDivElement;

  helpButton.addEventListener("click", () => {
    modalContent.setAttribute("data-modal-close", "false");
    helpModal.classList.add("modal");

    mainElement.appendChild(helpModal);
  });

  const close = helpModal.getElementsByClassName(`close`)[0] as HTMLSpanElement;
  if (!close) {
    throw new Error("Close element not found");
  }

  close.addEventListener("click", () => {
    modalContent.setAttribute("data-modal-close", "true");
    helpModal.remove();
  });

  // technically a create account button because passkey
  // recognition will generate their account without a username
  const createPasskeyButton = tableElement.getElementsByTagName(`button`)[1];
  if (!createPasskeyButton) {
    throw new Error("Button element not found");
  }

  return { createPasskeyButton, thead, isAvailable };
}
