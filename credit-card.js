document.addEventListener('DOMContentLoaded', () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }

  // Set User Name
  document.getElementById('dash-user-name').innerText = currentUser.fullName || 'User';
  document.getElementById('avatar-initials').innerText = (currentUser.fullName || 'U').charAt(0).toUpperCase();
  document.getElementById('cc-name').innerText = currentUser.fullName || 'User Name';
  
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
});
