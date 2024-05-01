import { randomBytes } from "ethers/lib/utils";
import { readClaimDataFromUrl } from "../render-transaction/read-claim-data-from-url";

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
  <div>Remember Me</div>
  </th>
  <td>
  <div class="button-container">
  <input name="rememberMe" id="loginform.rememberMe" type="checkbox" />
  <button type="submit">Login</button>
  </div>
  </td>
  </tr>
  `;

  thead.innerHTML = newHtml;

  const button = tableElement.getElementsByTagName(`button`)[0];
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
          const { id } = webAuthnResponse as PublicKeyCredential;
          localStorage.setItem("ubqfi_acc", JSON.stringify({ id }));

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
            const rememberMe = (document.getElementById("loginform.rememberMe") as HTMLInputElement).checked;

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

            localStorage.setItem("ubqfi_acc", JSON.stringify({ id }));

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
