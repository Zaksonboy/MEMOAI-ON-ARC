// ── Config ──
const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_HEX = '0x4CF4B2';
const ARC_RPC = 'https://rpc.testnet.arc.network';
const ARC_EXPLORER = 'https://testnet.arcscan.app';
const STORAGE_KEY = 'momoAI_history';

let provider, signer, walletAddress;

// ── Wait for page to fully load ──
window.addEventListener('load', function () {
  renderHistory();
  checkIfAlreadyConnected();

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accounts) {
      if (accounts.length === 0) {
        resetWallet();
      } else {
        location.reload();
      }
    });
    window.ethereum.on('chainChanged', function () {
      location.reload();
    });
  }
});

// ── Check if wallet already connected ──
async function checkIfAlreadyConnected() {
  if (!window.ethereum) return;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts && accounts.length > 0) {
      walletAddress = accounts[0];
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      updateWalletButton(walletAddress);
    }
  } catch (e) {
    console.log('Not connected yet');
  }
}

// ── Connect Wallet ──
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    showStatus('No wallet found. Open this site inside MetaMask or Rabby browser.', 'err');
    return;
  }

  try {
    showStatus('Connecting…', 'info');

    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });

    if (!accounts || accounts.length === 0) {
      showStatus('No accounts found. Unlock your wallet and try again.', 'err');
      return;
    }

    walletAddress = accounts[0];
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });

    if (chainId !== ARC_CHAIN_HEX) {
      showStatus('Switching to Arc Testnet…', 'info');
      await switchToArc();
    }

    updateWalletButton(walletAddress);
    showStatus('Wallet connected ✓', 'ok');

  } catch (e) {
    if (e.code === 4001) {
      showStatus('Connection rejected. Please approve in your wallet.', 'err');
    } else {
      showStatus('Error: ' + (e.message || 'Unknown error'), 'err');
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
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_CHAIN_HEX,
          chainName: 'Arc Testnet',
          rpcUrls: [ARC_RPC],
          nativeCurrency: {
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 18,
          },
          blockExplorerUrls: [ARC_EXPLORER],
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

// ── Update wallet button ──
function updateWalletButton(address) {
  const btn = document.getElementById('walletBtn');
  btn.textContent = address.slice(0, 6) + '…' + address.slice(-4);
  btn.classList.add('connected');
}

// ── Reset wallet state ──
function resetWallet() {
  walletAddress = null;
  signer = null;
  provider = null;
  const btn = document.getElementById('walletBtn');
  btn.textContent = 'Connect Wallet';
  btn.classList.remove('connected');
  showStatus('Wallet disconnected.', 'info');
}

// ── Generate AI Memo ──
async function generateMemo() {
  const address = document.getElementById('toAddr').value.trim();
  const amount = document.getElementById('amount').value.trim();
  const description = document.getElementById('description').value.trim();

  if (!description) {
    showStatus('Please enter a description first.', 'err');
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

    const data = await res.json();

    if (data.memo) {
      document.getElementById('memo').value = data.memo;
    } else {
      showStatus(data.error || 'Could not generate memo. Write one manually.', 'err');
    }
  } catch (e) {
    showStatus('AI error: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false;
    thinking.classList.remove('visible');
  }
}

// ── Send Payment ──
async function sendPayment() {
  if (!signer) {
    showStatus('Connect your wallet first.', 'err');
    return;
  }

  const to = document.getElementById('toAddr').value.trim();
  const amountStr = document.getElementById('amount').value.trim();
  const memo = document.getElementById('memo').value.trim();

  if (!ethers.isAddress(to)) {
    showStatus('Invalid recipient address.', 'err');
    return;
  }
  if (!amountStr || isNaN(amountStr) || parseFloat(amountStr) <= 0) {
    showStatus('Enter a valid amount.', 'err');
    return;
  }
  if (!memo) {
    showStatus('Please generate or write a memo first.', 'err');
    return;
  }

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  showStatus('Confirm in your wallet…', 'info');

  try {
    const value = ethers.parseEther(amountStr);
    const memoHex = ethers.hexlify(ethers.toUtf8Bytes(memo));

    const tx = await signer.sendTransaction({
      to,
      value,
      data: memoHex,
    });

    showStatus('Submitted. Waiting for confirmation…', 'info');
    await tx.wait();

    showStatus(
      `Confirmed! <a class="tx-link" href="${ARC_EXPLORER}/tx/${tx.hash}" target="_blank">${tx.hash.slice(0, 16)}…</a>`,
      'ok'
    );

    saveHistory({ to, amount: amountStr, memo, hash: tx.hash, time: Date.now() });
    clearForm();

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

// ── Clear form ──
function clearForm() {
  document.getElementById('toAddr').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('description').value = '';
  document.getElementById('memo').value = '';
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
  if (!el) return;
  el.innerHTML = msg;
  el.className = `show ${type}`;
  if (type === 'ok') {
    setTimeout(() => el.classList.remove('show'), 8000);
  }
}
