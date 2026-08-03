// ============================================
// momoAI — AI-Powered USDC Payments on Arc Testnet
// ============================================
// This file handles:
//  1. Connecting to a wallet (with a picker if more than one is installed)
//  2. Generating an AI-written payment memo
//  3. Sending a USDC payment through Arc's Memo contract
//  4. Showing payment history
//  5. Recurring payments
//  6. Looking up a payment by invoice reference
// ============================================

const STORAGE_KEY = 'momoAI_history';

// NOTE: ARC_CHAIN_ID, ARC_CHAIN_HEX, ARC_RPC, ARC_EXPLORER must already be
// defined somewhere before this script runs (e.g. in your HTML <script> tag).

// ── Global app state ──
let provider = null;        // ethers.js provider (wraps the wallet the user picked)
let signer = null;          // ethers.js signer (used to sign & send transactions)
let walletAddress = null;   // the connected wallet's address

// ── Wallet discovery state ──
let discoveredProviders = []; // every wallet that has announced itself via EIP-6963
let activeProvider = null;    // the raw EIP-1193 provider the user picked

// ── Arc Memo contract constants ──
const MEMO_CONTRACT_ADDRESS = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';
const USDC_TOKEN_ADDRESS = '0x3600000000000000000000000000000000000000';

const MEMO_ABI = [
  {
    "type": "function",
    "name": "memo",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "target", "type": "address" },
      { "name": "data", "type": "bytes" },
      { "name": "memoId", "type": "bytes32" },
      { "name": "memoData", "type": "bytes" }
    ],
    "outputs": []
  },
  {
    "type": "event",
    "name": "Memo",
    "anonymous": false,
    "inputs": [
      { "name": "sender", "type": "address", "indexed": true },
      { "name": "target", "type": "address", "indexed": true },
      { "name": "callDataHash", "type": "bytes32", "indexed": false },
      { "name": "memoId", "type": "bytes32", "indexed": true },
      { "name": "memo", "type": "bytes", "indexed": false },
      { "name": "memoIndex", "type": "uint256", "indexed": false }
    ]
  }
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)"
];


// ============================================
// SECTION 1: Wallet Discovery (EIP-6963)
// ============================================
// Modern wallets "announce" themselves when the page asks them to.
// This lets us list every wallet installed (Rabby, MetaMask, etc.)
// instead of blindly grabbing whichever one wins window.ethereum.

window.addEventListener('eip6963:announceProvider', (event) => {
  const { info, provider: walletProvider } = event.detail;
  const alreadyKnown = discoveredProviders.some(p => p.info.uuid === info.uuid);
  if (!alreadyKnown) {
    discoveredProviders.push({ info, provider: walletProvider });
  }
});

// Ask all installed wallets to announce themselves
window.dispatchEvent(new Event('eip6963:requestProvider'));


// ============================================
// SECTION 2: Let the user pick a wallet
// ============================================
function pickWallet() {
  return new Promise((resolve) => {
    // Give wallets a moment to announce themselves
    setTimeout(() => {

      // No EIP-6963 wallets found — fall back to legacy window.ethereum
      if (discoveredProviders.length === 0) {
        if (typeof window.ethereum !== 'undefined') {
          resolve(window.ethereum);
        } else {
          resolve(null); // no wallet installed at all
        }
        return;
      }

      // Exactly one wallet — just use it, no need to ask
      if (discoveredProviders.length === 1) {
        resolve(discoveredProviders[0].provider);
        return;
      }

      // Multiple wallets — show a simple popup so the user can choose
      const overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.6);' +
        'display:flex;align-items:center;justify-content:center;z-index:9999;';

      const box = document.createElement('div');
      box.style.cssText =
        'background:#1a1a1a;border-radius:12px;padding:20px;min-width:240px;';

      const title = document.createElement('div');
      title.textContent = 'Choose a wallet';
      title.style.cssText = 'color:#fff;margin-bottom:12px;font-weight:600;';
      box.appendChild(title);

      discoveredProviders.forEach(({ info, provider: walletProvider }) => {
        const btn = document.createElement('button');
        btn.style.cssText =
          'display:flex;align-items:center;gap:10px;width:100%;' +
          'padding:10px;margin-bottom:8px;background:#2a2a2a;' +
          'border:none;border-radius:8px;color:#fff;cursor:pointer;';

        const icon = document.createElement('img');
        icon.src = info.icon;
        icon.style.cssText = 'width:24px;height:24px;border-radius:6px;';

        const label = document.createElement('span');
        label.textContent = info.name;

        btn.appendChild(icon);
        btn.appendChild(label);

        btn.onclick = () => {
          document.body.removeChild(overlay);
          resolve(walletProvider);
        };

        box.appendChild(btn);
      });

      overlay.appendChild(box);
      document.body.appendChild(overlay);

    }, 150);
  });
}


// ============================================
// SECTION 3: Init on page load
// ============================================
window.addEventListener('load', function () {
  renderHistory();

  // If a wallet was already connected last time, try to reconnect quietly
  setTimeout(async function () {
    const chosenProvider = await pickWallet();
    if (!chosenProvider) return;

    try {
      // eth_accounts (not eth_requestAccounts) won't pop up a permission prompt —
      // it only returns accounts the user already approved before
      const accounts = await chosenProvider.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        activeProvider = chosenProvider;
        await setupWallet(accounts[0]);
      }
    } catch (e) {
      console.log('Auto-connect skipped');
    }
  }, 500);
});


// ============================================
// SECTION 4: Set up wallet after getting an account
// ============================================
async function setupWallet(account) {
  walletAddress = account;
  provider = new ethers.BrowserProvider(activeProvider);
  signer = await provider.getSigner();

  const btn = document.getElementById('walletBtn');
  btn.textContent = account.slice(0, 6) + '…' + account.slice(-4);
  btn.classList.add('connected');

  loadRecurringOrders();
  attachWalletEventListeners(); // always points at the wallet the user picked
}


// ============================================
// SECTION 5: Connect Wallet (button click)
// ============================================
async function connectWallet() {
  const chosenProvider = await pickWallet();

  if (!chosenProvider) {
    showStatus('No wallet detected. Open inside Rabby or MetaMask browser.', 'err');
    return;
  }

  activeProvider = chosenProvider;

  try {
    showStatus('Connecting…', 'info');

    // Ask the chosen wallet for permission to see the account
    const accounts = await activeProvider.request({
      method: 'eth_requestAccounts',
    });

    if (!accounts || accounts.length === 0) {
      showStatus('No accounts found. Unlock your wallet.', 'err');
      return;
    }

    await setupWallet(accounts[0]);

    // Make sure the wallet is on Arc Testnet
    const chainIdHex = await activeProvider.request({ method: 'eth_chainId' });
    const chainIdNum = parseInt(chainIdHex, 16);

    if (chainIdNum !== ARC_CHAIN_ID) {
      showStatus('Switching to Arc Testnet…', 'info');
      await switchToArc();

      // Re-create provider/signer after switching networks
      provider = new ethers.BrowserProvider(activeProvider);
      signer = await provider.getSigner();
    }

    showStatus('Connected to Arc Testnet ✓', 'ok');

  } catch (e) {
    if (e.code === 4001) {
      showStatus('Rejected. Please approve in your wallet.', 'err');
    } else {
      showStatus('Error: ' + (e.message || 'Unknown'), 'err');
    }
  }
}


// ============================================
// SECTION 6: Switch to (or add) Arc Testnet
// ============================================
async function switchToArc() {
  try {
    await activeProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  } catch (e) {
    // 4902 = wallet doesn't know this network yet, so add it
    if (e.code === 4902) {
      await activeProvider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_CHAIN_HEX,
          chainName: 'Arc Testnet',
          rpcUrls: [ARC_RPC],
          nativeCurrency: {
            // Arc's native gas token is USDC itself, which has 6 decimals
            // (not the usual 18 you'd see on most EVM chains)
            name: 'USDC',
            symbol: 'USDC',
            decimals: 6,
          },
          blockExplorerUrls: [ARC_EXPLORER],
        }],
      });
    } else {
      throw e;
    }
  }
}


// ============================================
// SECTION 7: Generate AI Memo
// ============================================
async function generateMemo() {
  const address = document.getElementById('toAddr').value.trim();
  const amount = document.getElementById('amount').value.trim();
  const description = document.getElementById('description').value.trim();

  if (!description) {
    showStatus('Enter a description first.', 'err');
    return;
  }

  if (!walletAddress) {
    showStatus('Connect your wallet first.', 'err');
    return;
  }

  const btn = document.getElementById('generateBtn');
  const thinking = document.getElementById('aiThinking');
  btn.disabled = true;
  thinking.classList.add('visible');

  try {
    const res = await fetch('/api/generate-memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, amount, description }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error('Server error: ' + text);
    }

    const data = await res.json();

    if (data.memo) {
      // Build a structured memo using real wallet data + AI-polished reason
      const now = new Date();

      const dateStr = String(now.getDate()).padStart(2, '0') + '-' +
                       String(now.getMonth() + 1).padStart(2, '0') + '-' +
                       now.getFullYear();

      let hours = now.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      if (hours === 0) hours = 12;
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}${ampm}`;

      const structuredMemo =
        `From: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\n` +
        `To: ${address.slice(0, 6)}...${address.slice(-4)}\n` +
        `Amount: ${amount}\n` +
        `Payment for: ${data.memo}\n` +
        `Date: ${dateStr}\n` +
        `Time: ${timeStr}`;

      document.getElementById('memo').value = structuredMemo;
      showStatus('Memo generated ✓', 'ok');
    } else {
      showStatus(data.error || 'No memo returned. Write one manually.', 'err');
    }

  } catch (e) {
    showStatus('AI error: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false;
    thinking.classList.remove('visible');
  }
}


// ============================================
// SECTION 8: Gas estimate helper
// ============================================
function estimateGasForMemo(memoHex) {
  // Remove '0x' prefix, get byte length
  const byteLength = (memoHex.length - 2) / 2;

  // Base transfer cost + buffer per byte of calldata + safety margin
  const base = 100000n;
  const perByte = 40n; // generous buffer per byte
  const extra = BigInt(byteLength) * perByte;

  return base + extra;
}


// ============================================
// SECTION 9: Invoice reference generator
// ============================================
function getNextInvoiceRef() {
  const year = new Date().getFullYear();
  const key = `momoai_invoice_counter_${year}`;
  let count = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(count));
  const padded = String(count).padStart(4, '0');
  return `momoai-${year}-${padded}`;
}


// ============================================
// SECTION 10: Send Payment (via Arc Memo contract)
// ============================================
async function sendPayment() {
  if (!signer) {
    showStatus('Connect your wallet first.', 'err');
    return;
  }

  const to = document.getElementById('toAddr').value.trim();
  const amountStr = document.getElementById('amount').value.trim();
  const memo = document.getElementById('memo').value.trim();

  // Validate inputs
  if (!ethers.isAddress(to)) {
    showStatus('Invalid recipient address.', 'err');
    return;
  }
  if (!amountStr || isNaN(amountStr) || parseFloat(amountStr) <= 0) {
    showStatus('Enter a valid amount.', 'err');
    return;
  }
  if (!memo) {
    showStatus('Please generate a memo first.', 'err');
    document.getElementById('generateBtn').style.boxShadow = '0 0 0 3px rgba(255,95,126,0.4)';
    setTimeout(() => {
      document.getElementById('generateBtn').style.boxShadow = '';
    }, 2000);
    return;
  }

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  showStatus('Confirm in your wallet…', 'info');

  try {
    // USDC = 6 decimals (ERC-20 token on Arc)
    const amountUnits = ethers.parseUnits(amountStr, 6);

    // Build interfaces
    const erc20Interface = new ethers.Interface(ERC20_ABI);
    const memoInterface = new ethers.Interface(MEMO_ABI);

    // Encode the inner USDC transfer call
    const transferData = erc20Interface.encodeFunctionData('transfer', [to, amountUnits]);

    // Sequential, human-readable invoice ID (e.g. momoai-2026-0001)
    const uniqueRef = getNextInvoiceRef();
    const memoId = ethers.id(uniqueRef);

    // Memo text as bytes
    const memoBytes = ethers.toUtf8Bytes(memo);

    // Encode the outer call to the Memo contract
    const memoCallData = memoInterface.encodeFunctionData('memo', [
      USDC_TOKEN_ADDRESS,
      transferData,
      memoId,
      memoBytes,
    ]);

    const tx = await signer.sendTransaction({
      to: MEMO_CONTRACT_ADDRESS,
      data: memoCallData,
    });

    showStatus('Submitted. Waiting for confirmation…', 'info');
    const receipt = await tx.wait();

    if (receipt.status !== 1) {
      throw new Error('Transaction reverted on-chain.');
    }

    // Verify the Memo event was actually emitted with the right data
    const memoEvents = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== MEMO_CONTRACT_ADDRESS.toLowerCase()) continue;
      const parsed = memoInterface.parseLog(log);
      if (parsed?.name === 'Memo') memoEvents.push(parsed);
    }

    if (memoEvents.length !== 1) {
      throw new Error('Memo event missing or duplicated — payment not verified.');
    }

    const memoArgs = memoEvents[0].args;
    if (
      memoArgs.sender.toLowerCase() !== walletAddress.toLowerCase() ||
      memoArgs.target.toLowerCase() !== USDC_TOKEN_ADDRESS.toLowerCase() ||
      memoArgs.memoId !== memoId
    ) {
      throw new Error('Memo event data does not match the submitted transaction.');
    }

    showStatus(
      `Confirmed! <a class="tx-link" href="${ARC_EXPLORER}/tx/${tx.hash}" target="_blank">${tx.hash.slice(0, 16)}…</a>`,
      'ok'
    );

    saveHistory({
      to,
      amount: amountStr,
      memo,
      hash: tx.hash,
      time: Date.now(),
    });

    // Clear form
    document.getElementById('toAddr').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('description').value = '';
    document.getElementById('memo').value = '';

  } catch (e) {
    if (e.code === 4001) {
      showStatus('Transaction rejected.', 'err');
    } else {
      showStatus('Failed: ' + (e.reason || e.message || e), 'err');
    }
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Payment';
  }
}


// ============================================
// SECTION 11: Payment History (stored locally)
// ============================================
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
  renderHistory();
}

function clearHistory() {
  if (!confirm('Clear all payment history?')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  const history = loadHistory();

  if (!history.length) {
    list.innerHTML = '<div class="history-empty">No payments yet. Send your first one above.</div>';
    return;
  }

  list.innerHTML = history.map(tx => `
    <div class="tx-item">
      <div class="tx-row">
        <span class="tx-addr">${tx.to.slice(0, 8)}…${tx.to.slice(-6)}</span>
        <span class="tx-amount">${parseFloat(tx.amount).toLocaleString()} USDC</span>
      </div>
      ${tx.memo ? `<div class="tx-memo">${tx.memo}</div>` : ''}
      <div class="tx-meta">
        <span class="tx-time">${new Date(tx.time).toLocaleString()}</span>
        <a class="tx-hash" href="${ARC_EXPLORER}/tx/${tx.hash}" target="_blank">
          ${tx.hash.slice(0, 10)}…
        </a>
      </div>
    </div>
  `).join('');
}


// ============================================
// SECTION 12: Status Toast
// ============================================
function showStatus(msg, type = 'info') {
  const el = document.getElementById('status');
  if (!el) return;
  el.innerHTML = msg;
  el.className = `show ${type}`;
  if (type === 'ok') {
    setTimeout(() => el.classList.remove('show'), 8000);
  }
}


// ============================================
// SECTION 13: Wallet event listeners
// ============================================
// Called from setupWallet() so it always attaches to the wallet
// the user actually picked — not just whichever one had grabbed
// window.ethereum first.
function attachWalletEventListeners() {
  if (!activeProvider || typeof activeProvider.on !== 'function') return;

  activeProvider.on('accountsChanged', function (accounts) {
    if (accounts.length === 0) {
      walletAddress = null;
      signer = null;
      provider = null;
      const btn = document.getElementById('walletBtn');
      btn.textContent = 'Connect Wallet';
      btn.classList.remove('connected');
      showStatus('Wallet disconnected.', 'info');
    } else {
      location.reload();
    }
  });

  activeProvider.on('chainChanged', function () {
    location.reload();
  });
}


// ============================================
// SECTION 14: Recurring Payments
// ============================================
async function createRecurring() {
  const to = document.getElementById('recurTo').value.trim();
  const amount = document.getElementById('recurAmount').value.trim();
  const description = document.getElementById('recurDescription').value.trim();
  const intervalDays = document.getElementById('recurInterval').value.trim();

  if (!walletAddress) {
    showStatus('Connect your wallet first.', 'err');
    return;
  }
  if (!ethers.isAddress(to)) {
    showStatus('Invalid recipient address.', 'err');
    return;
  }
  if (!amount || parseFloat(amount) <= 0) {
    showStatus('Enter a valid amount.', 'err');
    return;
  }
  if (!description) {
    showStatus('Enter a description.', 'err');
    return;
  }
  if (!intervalDays || parseInt(intervalDays) < 1) {
    showStatus('Enter a valid interval in days.', 'err');
    return;
  }

  try {
    const res = await fetch('/api/recurring-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, amount, description, intervalDays, walletAddress }),
    });
    const data = await res.json();

    if (data.success) {
      showStatus('Recurring payment created ✓', 'ok');
      document.getElementById('recurTo').value = '';
      document.getElementById('recurAmount').value = '';
      document.getElementById('recurDescription').value = '';
      document.getElementById('recurInterval').value = '';
      loadRecurringOrders();
    } else {
      showStatus(data.error || 'Failed to create recurring payment.', 'err');
    }
  } catch (e) {
    showStatus('Error: ' + (e.message || e), 'err');
  }
}

async function loadRecurringOrders() {
  const list = document.getElementById('recurringList');
  if (!list) return;

  try {
    if (!walletAddress) return;
    const res = await fetch('/api/recurring-create?address=' + walletAddress);
    const data = await res.json();
    const orders = data.orders || [];

    if (!orders.length) {
      list.innerHTML = '<div class="history-empty">No recurring payments set up.</div>';
      return;
    }

    list.innerHTML = orders.map(o => `
      <div class="tx-item">
        <div class="tx-row">
          <span class="tx-addr">${o.to.slice(0, 8)}…${o.to.slice(-6)}</span>
          <span class="tx-amount">${o.amount} USDC / ${o.intervalDays}d</span>
        </div>
        <div class="tx-memo">${o.description}</div>
        <div class="tx-meta">
          <span class="tx-time">Next: ${new Date(o.nextRunAt).toLocaleString()}</span>
          <button onclick="cancelRecurring('${o.id}')" style="color:#ff5f7e;background:none;border:none;cursor:pointer;">Cancel</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="history-empty">Failed to load recurring payments.</div>';
  }
}

async function cancelRecurring(id) {
  if (!confirm('Cancel this recurring payment?')) return;
  try {
    await fetch('/api/recurring-cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, walletAddress }),
    });
    loadRecurringOrders();
  } catch (e) {
    showStatus('Failed to cancel.', 'err');
  }
}


// ============================================
// SECTION 15: Tabs
// ============================================
function switchTab(tab) {
  document.getElementById('historyPanel').classList.toggle('active', tab === 'history');
  document.getElementById('recurringPanel').classList.toggle('active', tab === 'recurring');
  document.getElementById('lookupPanel').classList.toggle('active', tab === 'lookup');
  document.getElementById('tabHistoryBtn').classList.toggle('active', tab === 'history');
  document.getElementById('tabRecurringBtn').classList.toggle('active', tab === 'recurring');
  document.getElementById('tabLookupBtn').classList.toggle('active', tab === 'lookup');
}


// ============================================
// SECTION 16: Look up a payment by invoice ref
// ============================================
async function lookupPayment() {
  const ref = document.getElementById('lookupRef').value.trim();
  const resultBox = document.getElementById('lookupResult');

  if (!ref) {
    showStatus('Enter an invoice reference.', 'err');
    return;
  }

  resultBox.innerHTML = '<div class="history-empty">Searching on-chain…</div>';

  try {
    const memoId = ethers.id(ref);
    const readProvider = new ethers.JsonRpcProvider(ARC_RPC);
    const memoInterface = new ethers.Interface(MEMO_ABI);
    const memoTopic = memoInterface.getEvent('Memo')?.topicHash;

    const logs = await readProvider.getLogs({
      address: MEMO_CONTRACT_ADDRESS,
      topics: [memoTopic, null, null, memoId],
      fromBlock: 0,
      toBlock: 'latest',
    });

    if (!logs.length) {
      resultBox.innerHTML = '<div class="history-empty">No payment found for that reference.</div>';
      return;
    }

    const parsed = memoInterface.parseLog(logs[0]);
    const args = parsed.args;
    let memoText;
    try {
      memoText = ethers.toUtf8String(args.memo);
    } catch {
      memoText = '(binary memo data)';
    }

    resultBox.innerHTML = `
      <div class="tx-item">
        <div class="tx-row">
          <span class="tx-addr">${args.sender.slice(0, 8)}…${args.sender.slice(-6)}</span>
          <span class="tx-amount">Verified ✓</span>
        </div>
        <div class="tx-memo">${memoText.replace(/\n/g, '<br>')}</div>
        <div class="tx-meta">
          <span class="tx-time">Ref: ${ref}</span>
          <a class="tx-hash" href="${ARC_EXPLORER}/tx/${logs[0].transactionHash}" target="_blank">
            ${logs[0].transactionHash.slice(0, 10)}…
          </a>
        </div>
      </div>
    `;
  } catch (e) {
    resultBox.innerHTML = '<div class="history-empty">Search failed: ' + (e.message || e) + '</div>';
  }
}
