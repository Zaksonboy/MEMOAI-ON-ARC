const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_HEX = '0x4CF4B2';
const ARC_RPC = 'https://rpc.testnet.arc.network';
const ARC_EXPLORER = 'https://testnet.arcscan.app';
const STORAGE_KEY = 'momoAI_history';

let provider, signer, walletAddress;

async function connectWallet() {
  if (!window.ethereum) {
    return showStatus('MetaMask not detected. Please install it.', 'err');
  }

  try {
    showStatus('Connecting wallet…', 'info');

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    walletAddress = accounts[0];
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_HEX }],
      });
    } catch (switchErr) {
      // Chain not added yet — add it
      if (switchErr.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: 5042002,
            chainName: 'Arc Testnet',
            rpcUrls: [https://rpc.testnet.arc.network],
            nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
            blockExplorerUrls: [testnet.arcscan.app],
          }],
        });
      } else {
        throw switchErr;
      }
    }

    // Update wallet button
    const btn = document.getElementById('walletBtn');
    btn.textContent = walletAddress.slice(0, 6) + '…' + walletAddress.slice(-4);
    btn.classList.add('connected');

    showStatus('Wallet connected to Arc Testnet ✓', 'ok');
  } catch (e) {
    showStatus('Connection failed: ' + (e.message || e), 'err');
  }
}

// ── AI Memo Generation ──
async function generateMemo() {
  const address = document.getElementById('toAddr').value.trim();
  const amount = document.getElementById('amount').value.trim();
  const description = document.getElementById('description').value.trim();

  if (!description) {
    return showStatus('Please enter a description first.', 'err');
  }

  const btn = document.getElementById('generateBtn');
  const thinking = document.getElementById('aiThinking');
  btn.disabled = true;
  thinking.classList.add('visible');

  try {
    // Calls secure serverless function — API key never exposed in frontend
    const res = await fetch('/api/generate-memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, amount, description }),
    });

    const data = await res.json();

    if (data.memo) {
      document.getElementById('memo').value = data.memo;
    } else {
      showStatus(data.error || 'Could not generate memo. Write one manually.', 'err');
    }
  } catch (e) {
    showStatus('AI unavailable: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false;
    thinking.classList.remove('visible');
  }
}

// ── Send Payment ──
async function sendPayment() {
  if (!signer) {
    return showStatus('Connect your wallet first.', 'err');
  }

  const to = document.getElementById('toAddr').value.trim();
  const amountStr = document.getElementById('amount').value.trim();
  const memo = document.getElementById('memo').value.trim();

  // Validate
  if (!ethers.isAddress(to)) {
    return showStatus('Invalid recipient address.', 'err');
  }
  if (!amountStr || isNaN(amountStr) || parseFloat(amountStr) <= 0) {
    return showStatus('Enter a valid amount.', 'err');
  }
  if (!memo) {
    return showStatus('Please generate or write a memo before sending.', 'err');
  }

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  showStatus('Confirm the transaction in MetaMask…', 'info');

  try {
    const value = ethers.parseEther(amountStr);

    // Encode memo as hex — stored in transaction data field on-chain
    const memoHex = ethers.hexlify(ethers.toUtf8Bytes(memo));

    const tx = await signer.sendTransaction({
      to,
      value,
      data: memoHex,
    });

    showStatus('Transaction submitted. Waiting for confirmation…', 'info');
    await tx.wait();

    showStatus(
      `Payment confirmed! <a class="tx-link" href="${ARC_EXPLORER}/tx/${tx.hash}" target="_blank">${tx.hash.slice(0, 16)}…</a>`,
      'ok'
    );

    // Save to local history
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
    showStatus('Transaction failed: ' + (e.reason || e.message || e), 'err');
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
  history.unshift(entry); // newest first
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
      ${tx.memo ? `<div class="tx-memo">"${tx.memo}"</div>` : ''}
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
  el.innerHTML = msg;
  el.className = `show ${type}`;
  if (type === 'ok') {
    setTimeout(() => el.classList.remove('show'), 8000);
  }
}

// ── Init ──
renderHistory();

// Listen for account/chain changes
if (window.ethereum) {
  window.ethereum.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) {
      walletAddress = null;
      signer = null;
      const btn = document.getElementById('walletBtn');
      btn.textContent = 'Connect Wallet';
      btn.classList.remove('connected');
      showStatus('Wallet disconnected.', 'info');
    } else {
      location.reload();
    }
  });

  window.ethereum.on('chainChanged', () => location.reload());
}
