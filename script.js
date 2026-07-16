const STORAGE_KEY = 'momoAI_history';

let provider, signer, walletAddress;
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
// ── Init on load ──
window.addEventListener('load', function () {
  renderHistory();

  // If wallet already connected, restore session
  setTimeout(async function () {
    if (typeof window.ethereum === 'undefined') return;
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        await setupWallet(accounts[0]);
      }
    } catch (e) {
      console.log('Auto-connect skipped');
    }
  }, 500);
});

// ── Setup wallet after getting account ──
async function setupWallet(account) {
  walletAddress = account;
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();

  const btn = document.getElementById('walletBtn');
  btn.textContent = account.slice(0, 6) + '…' + account.slice(-4);
  btn.classList.add('connected');
}

// ── Connect Wallet ──
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    showStatus('No wallet detected. Open inside Rabby or MetaMask browser.', 'err');
    return;
  }

  try {
    showStatus('Connecting…', 'info');

    // Request accounts
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    if (!accounts || accounts.length === 0) {
      showStatus('No accounts found. Unlock your wallet.', 'err');
      return;
    }

    // Setup provider + signer
    await setupWallet(accounts[0]);

    // Check chain
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const chainIdNum = parseInt(chainIdHex, 16);

    if (chainIdNum !== ARC_CHAIN_ID) {
      showStatus('Switching to Arc Testnet…', 'info');
      await switchToArc();
      // Re-init after switch
      provider = new ethers.BrowserProvider(window.ethereum);
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

// ── Switch to Arc Testnet ──
async function switchToArc() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_CHAIN_HEX,
          chainName: 'Arc Testnet',
          rpcUrls: [ARC_RPC],
          nativeCurrency: {
            name: 'USDC',
            symbol: 'USDC',
            decimals: 18,
          },
          blockExplorerUrls: [ARC_EXPLORER],
        }],
      });
    } else {
      throw e;
    }
  }
}

// ── Generate AI Memo ──
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
      // Build structured memo using REAL wallet data + AI-polished reason
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

// ── Estimate safe gas limit based on memo size ──
function estimateGasForMemo(memoHex) {
  // Remove '0x' prefix, get byte length
  const byteLength = (memoHex.length - 2) / 2;

  // Base transfer cost + buffer per byte of calldata + safety margin
  const base = 100000n;
  const perByte = 40n; // generous buffer per byte
  const extra = BigInt(byteLength) * perByte;

  return base + extra;
}

// ── Send Payment (via Arc Memo contract) ──
async function sendPayment() {
  if (!signer) {
    showStatus('Connect your wallet first.', 'err');
    return;
  }

  const to = document.getElementById('toAddr').value.trim();
  const amountStr = document.getElementById('amount').value.trim();
  const memo = document.getElementById('memo').value.trim();

  // Validate
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

    // Unique memoId for this payment (based on time + random)
    const uniqueRef = `momoai-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
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
const memoTopic = memoInterface.getEvent('Memo')?.topicHash;
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

// ── History ──
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

// ── Status Toast ──
function showStatus(msg, type = 'info') {
  const el = document.getElementById('status');
  if (!el) return;
  el.innerHTML = msg;
  el.className = `show ${type}`;
  if (type === 'ok') {
    setTimeout(() => el.classList.remove('show'), 8000);
  }
}

// ── Wallet event listeners ──
if (typeof window.ethereum !== 'undefined') {
  window.ethereum.on('accountsChanged', function (accounts) {
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

  window.ethereum.on('chainChanged', function () {
    location.reload();
  });
    }
