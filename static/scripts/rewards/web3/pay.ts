import { BigNumber, ethers } from "ethers";
import { networkNames, getNetworkName } from "../constants";
import invalidateButton from "../invalidate-component";
import { app } from "../render-transaction/index";
import { setClaimMessage } from "../render-transaction/set-claim-message";
import { errorToast, claimButton, toaster, loadingClaimButton, resetClaimButton, loginButton } from "../toaster";
import { checkPermitClaimable } from "./check-permit-claimable";
import { connectWallet } from "./connect-wallet";
import { fetchTreasury } from "./fetch-treasury";
import { invalidateNonce } from "./invalidate-nonce";
import { switchNetwork } from "./switch-network";
import { renderTreasuryStatus } from "./render-treasury-status";
import { withdraw } from "./withdraw";
import SafeApiKit from "@safe-global/api-kit";

import { JsonRpcSigner } from "@ethersproject/providers";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { CHAIN_NAMESPACES, WALLET_ADAPTERS, CustomChainConfig } from "@web3auth/base";
import { Web3AuthNoModal } from "@web3auth/no-modal";
import { Web3AuthConfig } from "@safe-global/auth-kit";
import Safe, { ContractNetworksConfig, EthersAdapter, SafeAccountConfig, SafeDeploymentConfig, SafeFactory } from "@safe-global/protocol-kit";

const txServiceUrl = "https://safe-transaction-goerli.safe.global";

export async function pay(): Promise<void> {
  let detailsVisible = false;

  const table = document.getElementsByTagName(`table`)[0];
  table.setAttribute(`data-details-visible`, detailsVisible.toString());

  const additionalDetails = document.getElementById(`additionalDetails`) as Element;
  additionalDetails.addEventListener("click", () => {
    detailsVisible = !detailsVisible;
    table.setAttribute(`data-details-visible`, detailsVisible.toString());
  });

  fetchTreasury().then(renderTreasuryStatus).catch(errorToast);

  const signer = await connectWallet();
  const signerAddress = await signer?.getAddress();

  // check if permit is already claimed
  checkPermitClaimable()
    .then((claimable: boolean) => checkPermitClaimableHandler(claimable, table, signerAddress, signer))
    .catch(errorToast);

  const web3provider = new ethers.providers.Web3Provider(window.ethereum);
  if (!web3provider || !web3provider.provider.isMetaMask) {
    toaster.create("info", "Please connect to MetaMask.");
    loadingClaimButton(false);
    invalidateButton.disabled = true;
  }

  const currentNetworkId = await web3provider.provider.request!({ method: "eth_chainId" });

  // watch for network changes
  window.ethereum.on("chainChanged", handleIfOnCorrectNetwork);

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  // notOnCorrectNetwork(currentNetworkId, web3provider);

  claimButton.element.addEventListener("click", curryClaimButtonHandler(signer));
}

function notOnCorrectNetwork(currentNetworkId: any, web3provider: ethers.providers.Web3Provider) {
  if (currentNetworkId !== app.claimNetworkId) {
    if (app.claimNetworkId == void 0) {
      console.error(`You must pass in an EVM network ID in the URL query parameters using the key 'network' e.g. '?network=1'`);
    }
    const networkName = getNetworkName(app.claimNetworkId);
    if (!networkName) {
      toaster.create("error", `This dApp currently does not support payouts for network ID ${app.claimNetworkId}`);
    }
    loadingClaimButton(false);
    invalidateButton.disabled = true;
    switchNetwork(web3provider);
  }
}

function handleIfOnCorrectNetwork(currentNetworkId: string) {
  if (app.claimNetworkId === currentNetworkId) {
    // enable the button once on the correct network
    resetClaimButton();
    invalidateButton.disabled = false;
  } else {
    loadingClaimButton(false);
    invalidateButton.disabled = true;
  }
}

function curryClaimButtonHandler(signer: ethers.providers.JsonRpcSigner | null) {
  return async function claimButtonHandler() {
    try {
      if (!signer?._isSigner) {
        signer = await connectWallet(true);
        if (!signer?._isSigner) {
          return;
        }
      }
      loadingClaimButton();

      const { balance, allowance, decimals } = await fetchTreasury();
      renderTreasuryStatus({ balance, allowance, decimals }).catch(errorToast);
      let errorMessage: string | undefined = undefined;
      const permitted = Number(app.txData.permit.permitted.amount);
      const solvent = balance >= permitted;
      const allowed = allowance >= permitted;
      const beneficiary = app.txData.transferDetails.to.toLowerCase();
      const user = (await signer.getAddress()).toLowerCase();

      if (beneficiary !== user) {
        toaster.create("warning", `This reward is not for you.`);
        resetClaimButton();
      } else if (!solvent) {
        toaster.create("error", `Not enough funds on funding wallet to collect this reward. Please let the funder know.`);
        resetClaimButton();
      } else if (!allowed) {
        toaster.create("error", `Not enough allowance on the funding wallet to collect this reward. Please let the funder know.`);
        resetClaimButton();
      } else {
        await withdraw(signer, app.txData, errorMessage);
      }
    } catch (error: unknown) {
      errorToast(error, "");
      resetClaimButton();
    }
  };
}

function checkPermitClaimableHandler(claimable: boolean, table: HTMLTableElement, signerAddress?: string, signer?: ethers.providers.JsonRpcSigner | null) {
  if (!claimable) {
    setClaimMessage({ type: "Notice", message: `This permit is not claimable` });
    table.setAttribute(`data-claim`, "none");
  } else {
    if (signerAddress?.toLowerCase() === app.txData.owner.toLowerCase()) {
      generateInvalidatePermitAdminControl(signer);
    }
  }
  return signer;
}

function generateInvalidatePermitAdminControl(signer?: ethers.providers.JsonRpcSigner | null) {
  const controls = document.getElementById("controls") as HTMLDivElement;
  controls.appendChild(invalidateButton);

  invalidateButton.addEventListener("click", async function invalidateButtonClickHandler() {
    if (!signer?._isSigner) {
      signer = await connectWallet();
      if (!signer?._isSigner) {
        return;
      }
    }
    try {
      await invalidateNonce(signer, BigNumber.from(app.txData.permit.nonce));
    } catch (error: any) {
      toaster.create("error", `${error.reason ?? error.message ?? "Unknown error"}`);
      return;
    }
    toaster.create("info", "Nonce invalidation transaction sent");
  });
}
export async function AccountAbstraction(provider: ethers.providers.Web3Provider, newSafe = false) {
  return async function AccountAbstractionHandler() {
    let web3auth: Web3AuthNoModal | null = null;
    let signer: JsonRpcSigner | null = provider.getSigner();
    let userInfo;
    let chainId = provider.network.chainId as number;

    console.log(`${newSafe ? "Retrying" : "Trying"} to connect to wallet`);
    if (newSafe) {
      console.log("Requesting accounts again");
      await provider.send("eth_requestAccounts", []);
      console.log("Abstracting account");
    }
    console.log("account abstraction handler");

    const chainConfig: CustomChainConfig = {
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: "0x64", // 100 (0x64) for Gnosis, 10200 (0x27d8) for Chiado, 31337 (0x7a69) Foundry
      rpcTarget: "http://localhost:8545",
      displayName: "Foundry",
      blockExplorer: "https://gnosis-chiado.blockscout.com/",
      ticker: "WXDAI",
      tickerName: "Wrapped xDai",
      decimals: 18,
    };

    const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });
    const OPENLOGIN_CLIENT_ID = process.env.OPENLOGIN_CLIENT_ID;
    const WEB3AUTH_CLIENT_ID = process.env.WEB3AUTH_CLIENT_ID;

    sessionStorage.setItem("claimUrl", globalThis.location.href);

    const openloginAdapter = new OpenloginAdapter({
      privateKeyProvider,
      adapterSettings: {
        uxMode: "redirect",
        redirectUrl: sessionStorage.getItem("claimUrl") || globalThis.location.href,
        whiteLabel: {
          appName: "UbiquityDAO Rewards",
          appUrl: "http://localhost:8080",
          logoLight: "https://avatars.githubusercontent.com/u/76412717?s=200&v=4",
          logoDark: "https://avatars.githubusercontent.com/u/76412717?s=200&v=4",
          mode: "auto",
          useLogoLoader: true,
          theme: {
            gray: "#00000",
            white: "#ffffff",
          },
          tncLink: {
            en: "",
          },
          privacyPolicy: {
            en: "",
          },
        },
        storageKey: "session",
        sessionTime: 86400 / 8,
        sessionNamespace: "ubiquitydao",
        loginConfig: {
          jwt: {
            name: "UbiquityDAO Rewards",
            description: "Login with GitHub to claim UbiquityDAO Rewards",
            logoHover: "https://avatars.githubusercontent.com/u/76412717?s=200&v=4",
            logoLight: "https://avatars.githubusercontent.com/u/76412717?s=200&v=4",
            logoDark: "https://avatars.githubusercontent.com/u/76412717?s=200&v=4",
            verifier: "github",
            typeOfLogin: "jwt",
            clientId: "" || process.env.OPENLOGIN_CLIENT_ID,
            showOnDesktop: true,
            showOnMobile: true,
            showOnModal: true,
          },
        },
      },
    });

    web3auth = new Web3AuthNoModal({
      clientId: "" || process.env.WEB3AUTH_CLIENT_ID,
      chainConfig,
      web3AuthNetwork: "sapphire_devnet",
    });

    try {
      web3auth = web3auth.configureAdapter(openloginAdapter);
    } catch (err) {
      console.log("web3auth configureAdapter error: ", err);
    }

    const web3AuthConfig: Web3AuthConfig = {
      txServiceUrl: "https://safe-transaction-goerli.safe.global",
    };

    async function authenticateUser() {
      if (!web3auth) {
        console.log("web3auth not initialized yet");
        return;
      }
      const idToken = await web3auth.authenticateUser();
      return idToken;
    }
    async function getUserInfo() {
      if (!web3auth) {
        console.log("web3auth not initialized yet");
        return;
      }
      const user = await web3auth.getUserInfo();
      return user;
    }

    async function getAccounts() {
      if (!provider) {
        console.log("provider not initialized yet");
        return;
      }
      const address = await provider.listAccounts();
      return address;
    }
    async function getSignerAddress() {
      if (!provider) {
        console.log("provider not initialized yet");
        return;
      }
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      return address;
    }
    async function getBalance() {
      if (!provider) {
        console.log("provider not initialized yet");
        return;
      }
      const balance = await provider.getBalance((await provider.listAccounts())[0]);
      return balance;
    }
    async function sendTransaction() {
      if (!provider) {
        console.log("provider not initialized yet");
        return;
      }
      const signer = provider.getSigner();
      const receipt = await signer.sendTransaction({
        to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        value: ethers.utils.parseEther("0.001"),
      });
      return receipt;
    }
    async function signMessage() {
      if (!provider) {
        console.log("provider not initialized yet");
        return;
      }
      const rpc = provider.getSigner();
      const signedMessage = await rpc.signMessage({
        message: "0xdeadbeaf",
      });
      return signedMessage;
    }
    async function handleSignIn(button: loginButtonProps) {
      const state = button?.state;

      if (state === "loggedOut") {
        button.element.classList.add("show-cl");
        button.element.classList.remove("hide-cl");
        loginButton.element.removeEventListener("click", login);
        loginButton.element.addEventListener("click", logout);
        button.title.innerHTML = "Reconnect";
      } else if (state === "loggedIn") {
        button.element.classList.remove("show-cl");
        button.element.classList.add("hide-cl");
        loginButton.element.removeEventListener("click", logout);
        loginButton.element.addEventListener("click", login);
        button.title.innerHTML = "Disconnect";
      }
    }

    async function login() {
      web3auth?.connectTo(WALLET_ADAPTERS.OPENLOGIN, {
        loginProvider: "jwt",
        extraLoginOptions: {
          domain: "https://ubq-pay-testing.us.auth0.com",
        },
      });
      loginButton.state = "loggedIn";
      console.log("Logging in...");
      handleSignIn(loginButton);

      return web3auth;
    }

    async function logout() {
      if (!web3auth) {
        console.log("web3auth not initialized yet");
        return;
      }

      loginButton.state = "loggedOut";
      console.log("Logging out...");
      handleSignIn(loginButton);
      loginButton.element.removeEventListener("click", logout);
      loginButton.element.addEventListener("click", login);

      await web3auth.logout();
    }

    try {
      console.log("Initializing Web3Auth...");
      await web3auth.init();
    } catch (err) {
      console.log("Web3Auth init error: ", err);
    }

    if (!web3auth.connected) {
      console.log("Web3Auth not connected");
      login();
    } else if (loginButton.state == "loggedIn") {
      loginButton.state = "loggedIn";
      handleSignIn(loginButton);
      loginButton.element.removeEventListener("click", await AccountAbstraction(provider, false));
      loginButton.element.removeEventListener("click", login);
      loginButton.element.addEventListener("click", logout);
      claimButton.reset();

      await authenticateUser();
      userInfo = await getUserInfo();
      const accounts = await getAccounts();
      const signerAddr = await getSignerAddress();
      const balance = await getBalance();
      signer = provider.getSigner();

      const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: signer,
      });

      const owners = ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"];
      const threshold = 1;
      const safeAccountConfig: SafeAccountConfig = {
        owners,
        threshold,
        // paymentToken: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", //wxdai gnosis
      };

      const contractNetworks: ContractNetworksConfig = {
        [`${chainId}`]: {
          safeMasterCopyAddress: "0xf3280f42a790E4240fbd30408b2F9A981Ebfe4e4",
          safeProxyFactoryAddress: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
          multiSendAddress: "0x798953C8a71E60862227791A589d0e07ba5651Aa",
          multiSendCallOnlyAddress: "0x798953C8a71E60862227791A589d0e07ba5651Aa",
          fallbackHandlerAddress: "0x04eDfA9555630dB4900C5f7F60734C1D2E57f491",
          signMessageLibAddress: "0xd808e50ADb22D7272e43FEF28A33497c71E2E555",
          createCallAddress: "0x478785B39D723d703eBc55a0a2328c6B7EA48FB6",
          simulateTxAccessorAddress: "0xC89f5EC0f8296eEcB657394476F46A4c4aC70f36",
          // tokenCallbackHandler: "0x038aA846ae6AA1fb33B457DF8E2B7a9e193a7E03",
        },
      };

      const safeService = new SafeApiKit({ txServiceUrl, ethAdapter });

      const safeFactory = await SafeFactory.create({
        ethAdapter,
        safeVersion: "1.3.0",
      });

      const safe = await safeFactory.predictSafeAddress(safeAccountConfig);
      const isSafeDeployed = await ethAdapter.isContractDeployed(safe);

      const email = userInfo?.email;

      const safeDeploymentConfig: SafeDeploymentConfig = {
        saltNonce: ethers.utils.formatBytes32String(email),
      };

      let safeSdk: Safe | undefined;

      if (!isSafeDeployed) {
        try {
          safeSdk = await safeFactory.deploySafe({
            safeAccountConfig,
            saltNonce: "0x54",
            options: {
              gasPrice: 10000000000,
              gasLimit: 1000000,
            },
          });
          console.log("Newly created Safe: ", safeSdk);
          try {
            await safeSdk.connect({
              ethAdapter,
              predictedSafe: {
                safeAccountConfig,
                safeDeploymentConfig,
              },
            });
            console.log("connected to safeSdk: ", safeSdk);
          } catch (err) {
            console.log("safeSdk.connect error: ", err);
          }

          try {
            const tx = await safeSdk.createTransaction({
              safeTransactionData: {
                to: owners[0],
                value: "1",
                operation: 1,
                data: "0x",
                refundReceiver: owners[0],
                safeTxGas: "1000000",
              },
            });

            const txHash = await safeSdk.getTransactionHash(tx);
            console.log("txHash: ", txHash);

            const approveTx = await safeSdk.approveTransactionHash(txHash);
            console.log("approveTx: ", approveTx);

            const txResponse = await safeSdk.executeTransaction(tx);
            console.log("txResponse: ", txResponse);
          } catch (err) {
            console.log("safeSdk.createTransaction error: ", err);
          }
        } catch (err) {
          console.log("safeFactory.deploySafe error: ", err);
        }
      } else {
        // safe is already deployed
        // TODO: connect to existing safe
      }
    } else if (loginButton.state == "loggedOut") {
      loginButton.element.removeEventListener("click", logout);
      loginButton.element.addEventListener("click", login);
      handleSignIn(loginButton);
    } else {
      console.log("Something went wrong");
      throw new Error("Something went wrong");
    }
  };
}

interface loginButtonProps {
  element: HTMLButtonElement;
  title: HTMLElement;
  state: string;
}
