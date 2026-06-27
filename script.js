alert("script loaded");
const ARC = {
  chainId: "0x4CF4B2",
  rpc: "https://rpc.testnet.arc.network",
  name: "Arc Testnet",
  explorer: "https://testnet.arcscan.app/tx/"
};

const ui = {
  connect: document.getElementById("connectBtn"),
  wallet: document.getElementById("walletBox"),
  recipient: document.getElementById("recipient"),
  amount: document.getElementById("amount"),
  purpose: document.getElementById("purpose"),
  generate: document.getElementById("generateBtn"),
  send: document.getElementById("sendBtn"),
  memo: document.getElementById("memoBox"),
  status: document.getElementById("status"),
  txLink: document.getElementById("txLink")
};

const state = {
  provider: null,
  signer: null,
  account: null
};

function setStatus(message, type = "info") {
  ui.status.textContent = message;
  ui.status.className = `status ${type}`;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function hideTransaction() {
  if (ui.txLink) ui.txLink.style.display = "none";
}

function showTransaction(hash) {
  if (!ui.txLink) return;
  ui.txLink.href = `${ARC.explorer}${hash}`;
  ui.txLink.textContent = "View Transaction";
  ui.txLink.style.display = "inline-block";
}

async function switchToArc() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC.chainId }]
    });
  } catch (error) {
    if (error.code !== 4902) throw error;

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: ARC.chainId,
        chainName: ARC.name,
        rpcUrls: [ARC.rpc],
        nativeCurrency: {
          name: "USDC",
          symbol: "USDC",
          decimals: 18
        },
        blockExplorerUrls: ["https://testnet.arcscan.app"]
      }]
    });
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    return setStatus("Please install MetaMask.", "error");
  }

  try {
    setStatus("Connecting wallet...", "info");

    await window.ethereum.request({ method: "eth_requestAccounts" });
    await switchToArc();

    state.provider = new ethers.BrowserProvider(window.ethereum);
    state.signer = await state.provider.getSigner();
    state.account = await state.signer.getAddress();

    ui.wallet.textContent = shortAddress(state.account);
    ui.connect.textContent = "Wallet Connected";

    setStatus("Connected to Arc Testnet.", "success");

  } catch (error) {
    console.error(error);
    setStatus(
      error.shortMessage || error.message || "Wallet connection failed.",
      "error"
    );
  }
}

ui.connect.addEventListener("click", connectWallet);
hideTransaction();

async function generateMemo() {
  const recipient = ui.recipient.value.trim();
  const amount = ui.amount.value.trim();
  const purpose = ui.purpose.value.trim();

  if (!recipient || !amount || !purpose) {
    return setStatus("Please fill in all fields.", "error");
  }

  try {
    ui.generate.disabled = true;
    setStatus("Generating AI memo...", "info");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "AQ.Ab8RN6K1YqvDIEJuTzvwrshlRYo-bShktxhQZ4B1p8abTAVj_w",   
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: `Write a short, professional payment memo (2-3 sentences max) for the following:
Recipient: ${recipient}
Amount: ${amount} USDC
Purpose: ${purpose}
Return only the memo text, no labels or extra formatting.`
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to generate memo.");
    }

    ui.memo.textContent = data.content?.[0]?.text?.trim() || "No memo returned.";
    setStatus("AI memo generated.", "success");

  } catch (error) {
    console.error(error);
    setStatus(error.message || "Failed to generate memo.", "error");
  } finally {
    ui.generate.disabled = false;
  }
}

ui.generate.addEventListener("click", generateMemo);

async function sendPayment() {
  if (!state.signer) {
    return setStatus("Connect your wallet first.", "error");
  }

  const recipient = ui.recipient.value.trim();
  const amount = ui.amount.value.trim();

  if (!ethers.isAddress(recipient)) {
    return setStatus("Invalid recipient address.", "error");
  }

  if (!amount || Number(amount) <= 0) {
    return setStatus("Invalid amount.", "error");
  }

  try {
    ui.send.disabled = true;
    hideTransaction();
    setStatus("Sending USDC...", "info");

    const tx = await state.signer.sendTransaction({
      to: recipient,
      value: ethers.parseEther(amount) 
    });

    setStatus("Waiting for confirmation...", "info");

    const receipt = await tx.wait();

    if (receipt.status !== 1) {
      throw new Error("Transaction failed.");
    }

    showTransaction(tx.hash);
    setStatus("Payment sent successfully.", "success");

  } catch (error) {
    console.error(error);
    setStatus(
      error.reason || error.shortMessage || error.message || "Transaction failed.",
      "error"
    );
  } finally {
    ui.send.disabled = false;
  }
}

ui.send.addEventListener("click", sendPayment);
