// ==============================
// ArcMemoAI
// script.js
// Part 1 - Network & Wallet
// ==============================

// ---------- Arc Network ----------
const ARC_CHAIN_ID = "0x4CF4B2";
const ARC_RPC = "https://rpc.testnet.arc.network";
const ARC_NAME = "Arc Testnet";

// ---------- Elements ----------
const connectBtn = document.getElementById("connectBtn");
const walletBox = document.getElementById("walletBox");
const generateBtn = document.getElementById("generateBtn");
const sendBtn = document.getElementById("sendBtn");

const recipientInput = document.getElementById("recipient");
const amountInput = document.getElementById("amount");
const purposeInput = document.getElementById("purpose");

const memoBox = document.getElementById("memoBox");
const statusBox = document.getElementById("status");
const txLink = document.getElementById("txLink");

// ---------- Wallet ----------
let provider = null;
let signer = null;
let walletAddress = "";

// ---------- Helpers ----------
function showStatus(message, type = "info") {
  statusBox.textContent = message;
  statusBox.className = "status " + type;
}

function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ---------- Switch Network ----------
async function switchToArc() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [
        {
          chainId: ARC_CHAIN_ID
        }
      ]
    });
  } catch (error) {

    if (error.code === 4902) {

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARC_CHAIN_ID,
            chainName: ARC_NAME,
            rpcUrls: [ARC_RPC],
            nativeCurrency: {
              name: "USDC",
              symbol: "USDC",
              decimals: 6
            }
          }
        ]
      });

    } else {
      throw error;
    }

  }
}

// ---------- Connect Wallet ----------
async function connectWallet() {

  if (!window.ethereum) {
    showStatus("MetaMask is not installed.", "error");
    return;
  }

  try {

    showStatus("Connecting wallet...");

    await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    await switchToArc();

    provider = new ethers.BrowserProvider(window.ethereum);

    signer = await provider.getSigner();

    walletAddress = await signer.getAddress();

    walletBox.textContent = shortenAddress(walletAddress);

    connectBtn.textContent = "Wallet Connected";

    showStatus("Connected successfully.", "success");

  } catch (error) {

    console.error(error);

    showStatus("Wallet connection failed.", "error");

  }

}

connectBtn.addEventListener("click", connectWallet);
