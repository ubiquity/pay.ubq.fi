import { BytesLike, ethers, wordlists } from "ethers";
import SODIUM from "libsodium-wrappers";
import { Buffer } from "buffer";
import { entropyToMnemonic, isValidMnemonic } from "@ethersproject/hdnode";
import { toaster } from "../toaster";

export async function generateSAPrivateKey(publicKey: string, binaryID: WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>) {
  if (!publicKey) throw new Error("No public key created for private key generation");
  if (!binaryID) throw new Error("No binary ID created for private key generation");
  const sodium = SODIUM;
  await sodium.ready;

  const salt = "ubiquity-rewards"; // || process.env.SALT
  const concData = Buffer.concat([Buffer.from(salt), Buffer.from(publicKey), Buffer.from(binaryID)]);

  const hash = sodium.crypto_generichash(sodium.crypto_generichash_BYTES, concData);
  const privateKey = "0x" + Buffer.from(hash).toString("hex");

  const mnemonic = generateMnemonic(privateKey);

  const accSigner = new ethers.Wallet(privateKey);

  const publicKeyHex = await accSigner.getAddress();

  const hasToasted = document.getElementsByClassName("toast").length > 0;
  if (!hasToasted) toaster.create("success", `Generated private key for ${publicKeyHex}`);

  return { mnemonic, publicKey: publicKeyHex, privateKey };
}

export function generateMnemonic(pk: BytesLike) {
  const mnemonic = entropyToMnemonic(pk, wordlists["en"]);

  if (isValidMnemonic(mnemonic)) {
    return mnemonic;
  } else {
    throw new Error("Invalid mnemonic generated");
  }
}
