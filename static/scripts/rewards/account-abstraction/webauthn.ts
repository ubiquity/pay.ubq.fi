import { readClaimDataFromUrl } from "../render-transaction/read-claim-data-from-url";
import { generateSAPrivateKey } from "./sodium";
import { app } from "../app-state";

import { ethers, randomBytes } from "ethers";
// import { SafeAuthPack, SafeAuthConfig, SafeAuthInitOptions, AuthKitBasePack, AuthKitSignInData } from "@safe-global/auth-kit";
// import { EthersAdapter } from "@safe-global/protocol-kit";

export async function webAuthn() {
  const isAvailable = await window.PublicKeyCredential.isConditionalMediationAvailable();

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
  <h2>Ubiquity Rewards Help</h2>
  <br/>
  <ul>
    <p>
    After focusing on the input field, you will be prompted to use a passkey to create an account.
    </p>
    <p>
    If you have already created an account, you can use the same passkey to login.
    <p>
    To create an account, ignore the passkey prompt and enter your username, it could be your GitHub username or any other username you prefer.
    </p>
    <p>
    After entering your username, click on the login button and your new Safe account will be created.
    </p>
    <p>
    You can use the new passkey to login across multiple devices, create multiple keys for one account or create multiple accounts.
    </p>
    <p>
    We do not store your passkey, private key or any other sensitive information. We do create a unique identifier for your account which is stored in your browser.
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
    console.log("clicked help button");
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

  const button = tableElement.getElementsByTagName(`button`)[1];
  if (!button) {
    throw new Error("Button element not found");
  }

  if (isAvailable) {
    try {
      const authOptions = createCredOpts();

      try {
        const webAuthnResponse = await navigator.credentials.get({
          mediation: "conditional",
          publicKey: authOptions.publicKey,
        });

        if (webAuthnResponse) {
          const { id, rawId } = webAuthnResponse as PublicKeyCredential;
          localStorage.setItem("ubqfi_acc", JSON.stringify({ id }));

          // don't have any other reproducible entropy source to add
          const binaryID = new Uint8Array(rawId);
          const acc = await generateSAPrivateKey(id, binaryID);

          const signer = new ethers.Wallet(acc.privateKey);
          app.signer = signer;

          readClaimDataFromUrl(app).catch(console.error); // @DEV: read claim data from URL
          return true;
        } else {
          console.log("WebAuthn response is null");

          /**
           * clicking on input will popup with passkey autofill
           * this here will be used to register a new credential set
           */
          button.addEventListener("click", async () => {
            const username = (document.getElementById("loginform.username") as HTMLInputElement).value;
            // const rememberMe = (document.getElementById("loginform.rememberMe") as HTMLInputElement).checked;

            if (!username) {
              alert("Username is required");
              return;
            }

            const credOpts = createCredOpts();

            credOpts.publicKey.user = {
              id: new TextEncoder().encode(username),
              name: username,
              displayName: username,
            };

            const cred = await navigator.credentials.create({
              publicKey: credOpts.publicKey,
            });

            if (!cred) {
              throw new Error("Failed to create credential");
            }

            const { id } = cred as PublicKeyCredential;

            localStorage.setItem("ubqfi_acc", JSON.stringify({ username, id }));

            const hasCreds = await webAuthn();

            if (hasCreds) {
              thead.innerHTML = "";
              readClaimDataFromUrl(app).catch(console.error); // @DEV: read claim data from URL

              return;
            }

            throw new Error("Failed to login btn");
          });
        }
      } catch (err) {
        console.error(err);
      }
    } catch (err) {
      console.error(err);
    }

    return false;
  } else {
    alert("WebAuthn is not supported on this device");
  }
}

function createCredOpts() {
  const challenge = randomBytes(32);

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
      challenge,
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
          type: "public-key",
          alg: -257, // RS256
        },
        {
          type: "public-key",
          alg: -7, // ES256
        },
      ],
    },
  };
}
