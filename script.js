// ============================================
// momoAI - USDC Payments on Arc Testnet
// ============================================

var STORAGE_KEY = 'momoAI_history';

// These are expected to already exist from your HTML file:
// ARC_CHAIN_ID, ARC_CHAIN_HEX, ARC_RPC, ARC_EXPLORER

// App state - things we need to remember while the page is open
var provider = null;       // talks to the blockchain
var signer = null;         // lets us send transactions
var walletAddress = null;  // the connected wallet address

// Wallet picker state
var foundWallets = [];     // list of wallets installed in the browser
var activeWallet = null;   // the wallet the user picked

// Arc Memo contract info
var MEMO_CONTRACT_ADDRESS = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';
var USDC_TOKEN_ADDRESS = '0x3600000000000000000000000000000000000000';

var MEMO_ABI = [
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

var ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)"
];


// ============================================
// PART 1: Find installed wallets
// ============================================
window.addEventListener('eip6963:announceProvider', function (event) {
  var walletInfo = event.detail.info;
  var walletProvider = event.detail.provider;

  var alreadyFound = false;
  for (var i = 0; i < foundWallets.length; i++) {
    if (foundWallets[i].info.uuid === walletInfo.uuid) {
      alreadyFound = true;
    }
  }

  if (!alreadyFound) {
    foundWallets.push({ info: walletInfo, provider: walletProvider });
  }
});

window.dispatchEvent(new Event('eip6963:requestProvider'));


// ============================================
// PART 2: Ask the user which wallet to use
// ============================================
function pickWallet() {
  return new Promise(function (resolve) {

    setTimeout(function () {

      if (foundWallets.length === 0) {
        if (typeof window.ethereum !== 'undefined') {
          resolve(window.ethereum);
        } else {
          resolve(null);
        }
        return;
      }

      if (foundWallets.length === 1) {
        resolve(foundWallets[0].provider);
        return;
      }

      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';

      var box = document.createElement('div');
      box.style.cssText = 'background:#1a1a1a;border-radius:12px;padding:20px;min-width:240px;';

      var title = document.createElement('div');
      title.textContent = 'Choose a wallet';
      title.style.cssText = 'color:#fff;margin-bottom:12px;font-weight:600;';
      box.appendChild(title);

      for (var i = 0; i < foundWallets.length; i++) {
        var walletInfo = foundWallets[i].info;
        var walletProvider = foundWallets[i].provider;

        var btn = document.createElement('button');
        btn.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:10px;margin-bottom:8px;background:#2a2a2a;border:none;border-radius:8px;color:#fff;cursor:pointer;';

        var icon = document.createElement('img');
        icon.src = walletInfo.icon;
        icon.style.cssText = 'width:24px;height:24px;border-radius:6px;';

        var label = document.createElement('span');
        label.textContent = walletInfo.name;

        btn.appendChild(icon);
        btn.appendChild(label);

        (function (chosenProvider) {
          btn.onclick = function () {
            document.body.removeChild(overlay);
            resolve(chosenProvider);
          };
        })(walletProvider);

        box.appendChild(btn);
      }

      overlay.appendChild(box);
      document.body.appendChild(overlay);

    }, 150);
  });
}


// ============================================
// PART 3: Run this when the page loads
// ============================================
window.addEventListener('load', function () {
  renderHistory();

  setTimeout(function () {
    pickWallet().then(function (chosenWallet) {
      if (!chosenWallet) return;

      chosenWallet.request({ method: 'eth_accounts' }).then(function (accounts) {
        if (accounts && accounts.length > 0) {
          activeWallet = chosenWallet;
          setupWallet(accounts[0]);
        }
      }).catch(function () {
        console.log('Auto-connect skipped');
      });
    });
  }, 500);
});


// ============================================
// PART 4: Save wallet info after connecting
// ============================================
async function setupWallet(account) {
  walletAddress = account;
  provider = new ethers.BrowserProvider(activeWallet);
  signer = await provider.getSigner();

  var btn = document.getElementById('walletBtn');
  btn.textContent = account.slice(0, 6) + '…' + account.slice(-4);
  btn.classList.add('connected');

  loadRecurringOrders();
  listenForWalletChanges();
}


// ============================================
// PART 5: Connect Wallet button
// ============================================
async function connectWallet() {
  var chosenWallet = await pickWallet();

  if (!chosenWallet) {
    showStatus('No wallet detected. Open inside Rabby or MetaMask browser.', 'err');
    return;
  }

  activeWallet = chosenWallet;

  try {
    showStatus('Connecting…', 'info');

    var accounts = await activeWallet.request({ method: 'eth_requestAccounts' });

    if (!accounts || accounts.length === 0) {
      showStatus('No accounts found. Unlock your wallet.', 'err');
      return;
    }

    await setupWallet(accounts[0]);

    var chainIdHex = await activeWallet.request({ method: 'eth_chainId' });
    var chainIdNum = parseInt(chainIdHex, 16);

    if (chainIdNum !== ARC_CHAIN_ID) {
      showStatus('Switching to Arc Testnet…', 'info');
      await switchToArc();
      provider = new ethers.BrowserProvider(activeWallet);
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
// PART 6: Switch to (or add) Arc Testnet
// ============================================
async function switchToArc() {
  try {
    await activeWallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  } catch (e) {
    if (e.code === 4902) {
      await activeWallet.request({
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


// ============================================
// PART 7: Generate AI memo
// ============================================
async function generateMemo() {
  var address = document.getElementById('toAddr').value.trim();
  var amount = document.getElementById('amount').value.trim();
  var description = document.getElementById('description').value.trim();

  if (!description) {
    showStatus('Enter a description first.', 'err');
    return;
  }
  if (!walletAddress) {
    showStatus('Connect your wallet first.', 'err');
    return;
  }

  var btn = document.getElementById('generateBtn');
  var thinking = document.getElementById('aiThinking');
  btn.disabled = true;
  thinking.classList.add('visible');

  try {
    var res = await fetch('/api/generate-memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address, amount: amount, description: description }),
    });

    if (!res.ok) {
      var errText = await res.text();
      throw new Error('Server error: ' + errText);
    }

    var data = await res.json();

    if (data.memo) {
      var now = new Date();

      var dateStr = String(now.getDate()).padStart(2, '0') + '-' +
                    String(now.getMonth() + 1).padStart(2, '0') + '-' +
                    now.getFullYear();

      var hours = now.getHours();
      var ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      if (hours === 0) hours = 12;
      var minutes = String(now.getMinutes()).padStart(2, '0');
      var timeStr = hours + ':' + minutes + ampm;

      var structuredMemo =
        'From: ' + walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4) + '\n' +
        'To: ' + address.slice(0, 6) + '...' + address.slice(-4) + '\n' +
        'Amount: ' + amount + '\n' +
        'Payment for: ' + data.memo + '\n' +
        'Date: ' + dateStr + '\n' +
        'Time: ' + timeStr;

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
// PART 8: Gas estimate helper
// ============================================
function estimateGasForMemo(memoHex) {
  var byteLength = (memoHex.length - 2) / 2;
  var base = 100000n;
  var perByte = 40n;
  var extra = BigInt(byteLength) * perByte;
  return base + extra;
}


// ============================================
// PART 9: Invoice reference number
// ============================================
function getNextInvoiceRef() {
  var year = new Date().getFullYear();
  var key = 'momoai_invoice_counter_' + year;
  var count = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(count));
  var padded = String(count).padStart(4, '0');
  return 'momoai-' + year + '-' + padded;
}


// ============================================
// PART 10: Send Payment
// ============================================
async function sendPayment() {
  if (!signer) {
    showStatus('Connect your wallet first.', 'err');
    return;
  }

  var to = document.getElementById('toAddr').value.trim();
  var amountStr = document.getElementById('amount').value.trim();
  var memo = document.getElementById('memo').value.trim();

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
    setTimeout(function () {
      document.getElementById('generateBtn').style.boxShadow = '';
    }, 2000);
    return;
  }

  var sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  showStatus('Confirm in your wallet…', 'info');

  try {
    var amountUnits = ethers.parseUnits(amountStr, 6); // USDC has 6 decimals

    var erc20Interface = new ethers.Interface(ERC20_ABI);
    var memoInterface = new ethers.Interface(MEMO_ABI);

    var transferData = erc20Interface.encodeFunctionData('transfer', [to, amountUnits]);

    var uniqueRef = getNextInvoiceRef();
    var memoId = ethers.id(uniqueRef);
    var memoBytes = ethers.toUtf8Bytes(memo);

    var memoCallData = memoInterface.encodeFunctionData('memo', [
      USDC_TOKEN_ADDRESS,
      transferData,
      memoId,
      memoBytes,
    ]);

    var tx = await signer.sendTransaction({
      to: MEMO_CONTRACT_ADDRESS,
      data: memoCallData,
    });

    showStatus('Submitted. Waiting for confirmation…', 'info');
    var receipt = await tx.wait();

    if (receipt.status !== 1) {
      throw new Error('Transaction reverted on-chain.');
    }

    var memoEvents = [];
    for (var i = 0; i < receipt.logs.length; i++) {
      var log = receipt.logs[i];
      if (log.address.toLowerCase() !== MEMO_CONTRACT_ADDRESS.toLowerCase()) continue;
      var parsed = memoInterface.parseLog(log);
      if (parsed && parsed.name === 'Memo') memoEvents.push(parsed);
    }

    if (memoEvents.length !== 1) {
      throw new Error('Memo event missing or duplicated — payment not verified.');
    }

    var memoArgs = memoEvents[0].args;
    if (
      memoArgs.sender.toLowerCase() !== walletAddress.toLowerCase() ||
      memoArgs.target.toLowerCase() !== USDC_TOKEN_ADDRESS.toLowerCase() ||
      memoArgs.memoId !== memoId
    ) {
      throw new Error('Memo event data does not match the submitted transaction.');
    }

    showStatus(
      'Confirmed! <a class="tx-link" href="' + ARC_EXPLORER + '/tx/' + tx.hash + '" target="_blank">' + tx.hash.slice(0, 16) + '…</a>',
      'ok'
    );

    saveHistory({
      to: to,
      amount: amountStr,
      memo: memo,
      hash: tx.hash,
      ref: uniqueRef,
      time: Date.now(),
    });

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
// PART 11: Payment History
// ============================================
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveHistory(entry) {
  var history = loadHistory();
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
  var list = document.getElementById('historyList');
  if (!list) return;
  var history = loadHistory();

  if (history.length === 0) {
    list.innerHTML = '<div class="history-empty">No payments yet. Send your first one above.</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < history.length; i++) {
    var tx = history[i];
    html += '<div class="tx-item">' +
      '<div class="tx-row">' +
        '<span class="tx-addr">' + tx.to.slice(0, 8) + '…' + tx.to.slice(-6) + '</span>' +
        '<span class="tx-amount">' + parseFloat(tx.amount).toLocaleString() + ' USDC</span>' +
      '</div>' +
      (tx.memo ? '<div class="tx-memo">' + tx.memo + '</div>' : '') +
      (tx.ref ? '<div class="tx-ref">Invoice: ' + tx.ref + '</div>' : '') +
      '<div class="tx-meta">' +
        '<span class="tx-time">' + new Date(tx.time).toLocaleString() + '</span>' +
        '<a class="tx-hash" href="' + ARC_EXPLORER + '/tx/' + tx.hash + '" target="_blank">' + tx.hash.slice(0, 10) + '…</a>' +
      '</div>' +
    '</div>';
  }
  list.innerHTML = html;
}


// ============================================
// PART 12: Status message popup
// ============================================
function showStatus(msg, type) {
  if (!type) type = 'info';
  var el = document.getElementById('status');
  if (!el) return;
  el.innerHTML = msg;
  el.className = 'show ' + type;
  if (type === 'ok') {
    setTimeout(function () { el.classList.remove('show'); }, 8000);
  }
}


// ============================================
// PART 13: Listen for wallet changes
// ============================================
function listenForWalletChanges() {
  if (!activeWallet || typeof activeWallet.on !== 'function') return;

  activeWallet.on('accountsChanged', function (accounts) {
    if (accounts.length === 0) {
      walletAddress = null;
      signer = null;
      provider = null;
      var btn = document.getElementById('walletBtn');
      btn.textContent = 'Connect Wallet';
      btn.classList.remove('connected');
      showStatus('Wallet disconnected.', 'info');
    } else {
      location.reload();
    }
  });

  activeWallet.on('chainChanged', function () {
    location.reload();
  });
}


// ============================================
// PART 14: Recurring Payments
// ============================================
async function createRecurring() {
  var to = document.getElementById('recurTo').value.trim();
  var amount = document.getElementById('recurAmount').value.trim();
  var description = document.getElementById('recurDescription').value.trim();
  var intervalDays = document.getElementById('recurInterval').value.trim();

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
    var res = await fetch('/api/recurring-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to, amount: amount, description: description, intervalDays: intervalDays, walletAddress: walletAddress }),
    });
    var data = await res.json();

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
  var list = document.getElementById('recurringList');
  if (!list) return;

  try {
    if (!walletAddress) return;
    var res = await fetch('/api/recurring-create?address=' + walletAddress);
    var data = await res.json();
    var orders = data.orders || [];

    if (orders.length === 0) {
      list.innerHTML = '<div class="history-empty">No recurring payments set up.</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      html += '<div class="tx-item">' +
        '<div class="tx-row">' +
          '<span class="tx-addr">' + o.to.slice(0, 8) + '…' + o.to.slice(-6) + '</span>' +
          '<span class="tx-amount">' + o.amount + ' USDC / ' + o.intervalDays + 'd</span>' +
        '</div>' +
        '<div class="tx-memo">' + o.description + '</div>' +
        '<div class="tx-meta">' +
          '<span class="tx-time">Next: ' + new Date(o.nextRunAt).toLocaleString() + '</span>' +
          '<button onclick="cancelRecurring(\'' + o.id + '\')" style="color:#ff5f7e;background:none;border:none;cursor:pointer;">Cancel</button>' +
        '</div>' +
      '</div>';
    }
    list.innerHTML = html;
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
      body: JSON.stringify({ id: id, walletAddress: walletAddress }),
    });
    loadRecurringOrders();
  } catch (e) {
    showStatus('Failed to cancel.', 'err');
  }
}


// ============================================
// PART 15: Tabs
// ============================================
function switchTab(tab) {
  document.getElementById('historyPanel').classList.toggle('active', tab === 'history');
  document.getElementById('recurringPanel').classList.toggle('active', tab === 'recurring');
  document.getElementById('lookupPanel').classList.toggle('active', tab === 'lookup');
  document.getElementById('contactsPanel').classList.toggle('active', tab === 'contacts');
  document.getElementById('tabHistoryBtn').classList.toggle('active', tab === 'history');
  document.getElementById('tabRecurringBtn').classList.toggle('active', tab === 'recurring');
  document.getElementById('tabLookupBtn').classList.toggle('active', tab === 'lookup');
  document.getElementById('tabContactsBtn').classList.toggle('active', tab === 'contacts');
  if (tab === 'contacts') renderContacts();
}


// ============================================
// PART 16: Look up a payment by invoice ref
// ============================================
async function lookupPayment() {
  var ref = document.getElementById('lookupRef').value.trim();
  var resultBox = document.getElementById('lookupResult');

  if (!ref) {
    showStatus('Enter an invoice reference.', 'err');
    return;
  }

  resultBox.innerHTML = '<div class="history-empty">Searching on-chain…</div>';

  try {
    var memoId = ethers.id(ref);
    var readProvider = new ethers.JsonRpcProvider(ARC_RPC);
    var memoInterface = new ethers.Interface(MEMO_ABI);
    var memoTopic = memoInterface.getEvent('Memo').topicHash;

    var logs = await readProvider.getLogs({
      address: MEMO_CONTRACT_ADDRESS,
      topics: [memoTopic, null, null, memoId],
      fromBlock: 0,
      toBlock: 'latest',
    });

    if (logs.length === 0) {
      resultBox.innerHTML = '<div class="history-empty">No payment found for that reference.</div>';
      return;
    }

    var parsed = memoInterface.parseLog(logs[0]);
    var args = parsed.args;
    var memoText;
    try {
      memoText = ethers.toUtf8String(args.memo);
    } catch (e) {
      memoText = '(binary memo data)';
    }

    resultBox.innerHTML =
      '<div class="tx-item">' +
        '<div class="tx-row">' +
          '<span class="tx-addr">' + args.sender.slice(0, 8) + '…' + args.sender.slice(-6) + '</span>' +
          '<span class="tx-amount">Verified ✓</span>' +
        '</div>' +
        '<div class="tx-memo">' + memoText.replace(/\n/g, '<br>') + '</div>' +
        '<div class="tx-meta">' +
          '<span class="tx-time">Ref: ' + ref + '</span>' +
          '<a class="tx-hash" href="' + ARC_EXPLORER + '/tx/' + logs[0].transactionHash + '" target="_blank">' + logs[0].transactionHash.slice(0, 10) + '…</a>' +
        '</div>' +
      '</div>';
  } catch (e) {
    resultBox.innerHTML = '<div class="history-empty">Search failed: ' + (e.message || e) + '</div>';
  }
}
const CONTACTS_KEY = 'momoAI_contacts';

function loadContacts() {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveContact() {
  const address = document.getElementById('toAddr').value.trim();
  const name = document.getElementById('saveContactName').value.trim();

  if (!ethers.isAddress(address)) {
    showStatus('Enter a valid address before saving.', 'err');
    return;
  }
  if (!name) {
    showStatus('Enter a name to save this contact.', 'err');
    return;
  }

  const contacts = loadContacts();
  const existing = contacts.findIndex(c => c.address.toLowerCase() === address.toLowerCase());
  if (existing >= 0) {
    contacts[existing].name = name;
  } else {
    contacts.push({ name, address });
  }
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  document.getElementById('saveContactName').value = '';
  showStatus('Contact saved ✓', 'ok');
}

function deleteContact(address) {
  if (!confirm('Remove this saved contact?')) return;
  const contacts = loadContacts().filter(c => c.address.toLowerCase() !== address.toLowerCase());
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  renderContacts();
}

function renderContacts() {
  const list = document.getElementById('contactsList');
  if (!list) return;
  const contacts = loadContacts();

  if (!contacts.length) {
    list.innerHTML = '<div class="history-empty">No saved contacts yet.</div>';
    return;
  }

  list.innerHTML = contacts.map(c => `
    <div class="contact-item">
      <div class="c-info">
        <span class="c-name">${c.name}</span>
        <span class="c-addr">${c.address.slice(0, 8)}…${c.address.slice(-6)}</span>
      </div>
      <button onclick="deleteContact('${c.address}')" style="color:#ff5f7e;background:none;border:none;cursor:pointer;">Remove</button>
    </div>
  `).join('');
}

function showContactSuggestions() {
  const input = document.getElementById('toAddr');
  const dropdown = document.getElementById('contactDropdown');
  const query = input.value.trim().toLowerCase();

  if (!query || query.startsWith('0x')) {
    dropdown.classList.remove('show');
    return;
  }

  const contacts = loadContacts().filter(c => c.name.toLowerCase().includes(query));

  if (!contacts.length) {
    dropdown.classList.remove('show');
    return;
  }

  dropdown.innerHTML = contacts.map(c => `
    <div class="contact-option" onclick="pickContact('${c.address}', '${c.name.replace(/'/g, "\\'")}')">
      <div class="c-name">${c.name}</div>
      <div class="c-addr">${c.address}</div>
    </div>
  `).join('');
  dropdown.classList.add('show');
}

function pickContact(address, name) {
  document.getElementById('toAddr').value = address;
  document.getElementById('contactDropdown').classList.remove('show');
}
