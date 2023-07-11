import _sodium from "libsodium-wrappers";

const classes = ["error", "warning", "success"];

const statusToggle = (target: "error" | "warning" | "success", value: string) => {
  const statusKey = document.querySelector("#statusKey") as HTMLInputElement;

  classes.forEach(e => {
    if (e !== target) {
      statusKey.classList.remove(e);
    }
  });
  statusKey.classList.add(target);
  statusKey.value = value;
};

const sodiumKeyBox = async () => {
  const privKey = document.querySelector("#privKey") as HTMLInputElement;
  const pubKey = document.querySelector("#pubKey") as HTMLInputElement;
  const cipherKey = document.querySelector("#cipherKey") as HTMLInputElement;
  cipherKey.value = "";
  try {
    await _sodium.ready;
    const sodium = _sodium;

    const { privateKey, publicKey } = sodium.crypto_box_keypair("base64");
    privKey.value = privateKey;
    pubKey.value = publicKey;
    statusToggle("success", `Success: Key Generation is ok.`);
  } catch (error: any) {
    statusToggle("error", `Error: ${error.message}`);
  }
};

const sodiumEncryptedSeal = async () => {
  const pubKey = document.querySelector("#pubKey") as HTMLInputElement;
  const plainKey = document.querySelector("#plainKey") as HTMLInputElement;
  const cipherKey = document.querySelector("#cipherKey") as HTMLInputElement;
  try {
    await _sodium.ready;
    const sodium = _sodium;

    const binkey = sodium.from_base64(pubKey.value, sodium.base64_variants.URLSAFE_NO_PADDING);
    const binsec = sodium.from_string(plainKey.value);
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    const output = sodium.to_base64(encBytes, sodium.base64_variants.URLSAFE_NO_PADDING);
    cipherKey.value = output;
    statusToggle("success", `Success: Key Encryption is ok.`);
  } catch (error: any) {
    statusToggle("error", `Error: ${error.message}`);
  }
};

const sodiumOpenSeal = async () => {
  const pubKey = document.querySelector("#pubKey") as HTMLInputElement;
  const privKey = document.querySelector("#privKey") as HTMLInputElement;
  const cipherKey = document.querySelector("#cipherKey") as HTMLInputElement;
  const plainKey = document.querySelector("#plainKey") as HTMLInputElement;
  try {
    await _sodium.ready;
    const sodium = _sodium;

    const binPub = sodium.from_base64(pubKey.value, sodium.base64_variants.URLSAFE_NO_PADDING);
    const binPriv = sodium.from_base64(privKey.value, sodium.base64_variants.URLSAFE_NO_PADDING);
    const binCipher = sodium.from_base64(cipherKey.value, sodium.base64_variants.URLSAFE_NO_PADDING);
    const outText = sodium.crypto_box_seal_open(binCipher, binPub, binPriv, "text");
    plainKey.value = outText;
    statusToggle("success", `Success: Key Decryption is ok.`);
  } catch (error: any) {
    statusToggle("error", `Error: ${error.message}`);
  }
};

const init = () => {
  const genBtn = document.querySelector("#genBtn") as HTMLButtonElement;
  const encryptBtn = document.querySelector("#encryptBtn") as HTMLButtonElement;
  const decryptBtn = document.querySelector("#decryptBtn") as HTMLButtonElement;

  genBtn.addEventListener("click", () => {
    sodiumKeyBox();
  });

  encryptBtn.addEventListener("click", () => {
    sodiumEncryptedSeal();
  });

  decryptBtn.addEventListener("click", () => {
    sodiumOpenSeal();
  });
};

init();
