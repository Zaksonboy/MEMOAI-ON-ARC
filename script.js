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

function showTransaction(hash) {
  ui.txLink.href = `${ARC.explorer}${hash}`;
  ui.txLink.style.display = "block";
  ui.txLink.textContent = "View Transaction";
}

function hideTransaction() {
  ui.txLink.style.display = "none";
}
const ARC = { ... };

const ui = { ... };

const state = { ... };

function setStatus(...) {
  ...
}

function shortAddress(...) {
  ...
}

function showTransaction(...) {
  ...
}

function hideTransaction() {
  ...
}

/* 👇 Paste the wallet module here */

async function switchToArc() {
  ...
}

async function connectWallet() {
  ...
}

ui.connect.addEventListener("click", connectWallet);
...

function hideTransaction() {
  ui.txLink.style.display = "none";
}

// Wallet

async function switchToArc() {
  ...
}

async function connectWallet() {
  ...
}

ui.connect.addEventListener("click", connectWallet);

// 👇 Paste the AI memo module here

async function generateMemo() {
  ...
}

ui.generate.addEventListener("click", generateMemo);
const USDC = {
  address: "0x3600000000000000000000000000000000000000",
  decimals: 6,
  abi: [
    "function transfer(address to, uint256 value) returns (bool)"
  ]
};

async function sendPayment() {
  if (!state.signer) {
    setStatus("Connect your wallet first.", "error");
    return;
  }

  const recipient = ui.recipient.value.trim();
  const amount = ui.amount.value.trim();

  if (!ethers.isAddress(recipient)) {
    setStatus("Enter a valid recipient address.", "error");
    return;
  }

  if (!amount || Number(amount) <= 0) {
    setStatus("Enter a valid amount.", "error");
    return;
  }

  try {
    ui.send.disabled = true;
    hideTransaction();
    setStatus("Sending payment...", "info");

    const usdc = new ethers.Contract(
      USDC.address,
      USDC.abi,
      state.signer
    );

    const tx = await usdc.transfer(
      recipient,
      ethers.parseUnits(amount, USDC.decimals)
    );

    setStatus("Waiting for confirmation...", "info");

    await tx.wait();

    showTransaction(tx.hash);

    setStatus("Payment sent successfully.", "success");

  } catch (error) {
    console.error(error);

    setStatus(
      error.reason || error.shortMessage || "Transaction failed.",
      "error"
    );

  } finally {
    ui.send.disabled = false;
  }
}

ui.send.addEventListener("click", sendPayment);
