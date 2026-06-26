const ARC = {
  chainId: "5042002",
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

function showTransaction(hash) {
  ui.txLink.href = `${ARC.explorer}${hash}`;
  ui.txLink.textContent = "View Transaction";
  ui.txLink.style.display = "block";
}

function hideTransaction() {
  ui.txLink.style.display = "none";
}

async function switchToArc() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC.chainId }]
    });
  } catch (error) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: ARC.chainId,
          chainName: ARC.name,
          rpcUrls: [ARC.rpc]
        }]
      });
    } else {
      throw error;
    }
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    setStatus("Please install MetaMask.", "error");
    return;
  }

  try {
    await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    await switchToArc();

    state.provider = new ethers.BrowserProvider(window.ethereum);
    state.signer = await state.provider.getSigner();
    state.account = await state.signer.getAddress();

    ui.wallet.textContent = shortAddress(state.account);
    ui.connect.textContent = "Wallet Connected";

    setStatus("Connected to Arc Testnet.", "success");

  } catch (error) {
    console.error(error);
    setStatus("Failed to connect wallet.", "error");
  }
}

ui.connect.addEventListener("click", connectWallet);

hideTransaction();
async function generateMemo() {
  const recipient = ui.recipient.value.trim();
  const amount = ui.amount.value.trim();
  const purpose = ui.purpose.value.trim();

  if (!recipient || !amount || !purpose) {
    setStatus("Please fill in all fields.", "error");
    return;
  }

  try {
    ui.generate.disabled = true;
    setStatus("Generating AI memo...", "info");

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

    ui.memo.textContent = data.memo;
    setStatus("AI memo generated successfully.", "success");

  } catch (error) {
    console.error(error);
    setStatus(error.message || "Failed to generate memo.", "error");
  } finally {
    ui.generate.disabled = false;
  }
}

ui.generate.addEventListener("click", generateMemo);
