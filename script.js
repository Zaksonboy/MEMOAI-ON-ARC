const ARC_CHAIN_ID = "0x4cef52";
const ARC_RPC = "https://rpc.testnet.arc.network";
const ARC_NAME = "Arc Testnet";

const connectBtn = document.getElementById("connectBtn");
const walletBox = document.getElementById("walletBox");
const generateBtn = document.getElementById("generateBtn");
const sendBtn = document.getElementById("sendBtn");
const memoBox = document.getElementById("memoBox");
const status = document.getElementById("status");

let provider = null;
let signer = null;
let walletAddress = "";
const txLink = document.getElementById("txLink");
function showStatus(message, type = "info") {
  status.textContent = message;
  status.className = "status " + type;
}

async function switchToArc() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_CHAIN_ID }]
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: ARC_CHAIN_ID,
          chainName: ARC_NAME,
          rpcUrls: [ARC_RPC],
          nativeCurrency: {
            name: "USDC",
            symbol: "USDC",
            decimals: 6
          }
        }]
      });
    } else {
      throw err;
    }
  }
}

connectBtn.addEventListener("click", async () => {

  if (!window.ethereum) {
    showStatus("Please install MetaMask.", "error");
    return;
  }

  try {

    await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    await switchToArc();

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    walletAddress = await signer.getAddress();

    walletBox.textContent =
      walletAddress.slice(0, 6) +
      "..." +
      walletAddress.slice(-4);

    connectBtn.textContent = "Wallet Connected";

    showStatus("Connected to Arc Testnet", "success");

  } catch (error) {

    console.error(error);

    showStatus("Wallet connection failed.", "error");

  }

});

generateBtn.addEventListener("click", async () => {

  const recipient = document.getElementById("recipient").value.trim();
  const amount = document.getElementById("amount").value.trim();
  const purpose = document.getElementById("purpose").value.trim();

  if (!recipient || !amount || !purpose) {
    showStatus("Please fill all fields.", "error");
    return;
  }

  try {

  showStatus("Generating AI memo...", "info");

  const response = await fetch("/api/generateMemo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient,
      amount,
      purpose
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to generate memo.");
  }

  memoBox.textContent = data.memo;

  showStatus("AI memo generated successfully.", "success");

} catch (error) {

  console.error(error);

  showStatus(error.message, "error"); }

  });


    sendBtn.addEventListener("click", async () => {

  if (!signer) {
    showStatus("Please connect your wallet first.", "error");
    return;
  }

  const recipient = document.getElementById("recipient").value.trim();
  const amount = document.getElementById("amount").value.trim();
const memo = memoBox.textContent.trim();

if (!memo) {
  showStatus("Please generate an AI memo first.", "error");
  return;
            }
  if (!ethers.isAddress(recipient)) {
    showStatus("Enter a valid wallet address.", "error");
    return;
  }

  if (!amount || Number(amount) <= 0) {
    showStatus("Enter a valid amount.", "error");
    return;
  }

  showStatus("Preparing transaction...", "info");

});

