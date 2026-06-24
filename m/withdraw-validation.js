/* ============================================
   WITHDRAW PAGE VALIDATION
   Minimum $1,000 withdrawal requirement
   ============================================ */

'use strict';

/**
 * Initialize withdrawal validation on page load
 */
document.addEventListener('DOMContentLoaded', () => {
  const amountInput = document.getElementById('wd-amount');
  const balanceAlert = document.getElementById('wd-balance-alert');
  const validationMsg = document.getElementById('wd-amount-validation');
  const submitBtn = document.getElementById('wd-submit-btn');
  const MIN_WITHDRAWAL = 1000;

  if (!amountInput) return;

  /**
   * Validate withdrawal amount against minimum and balance
   */
  function validateWithdrawal() {
    const amount = parseFloat(amountInput.value) || 0;
    const userEmail = JSON.parse(localStorage.getItem('ocio_user'))?.email;
    
    if (!userEmail) return;

    // Get user balance
    let balance = 0;
    try {
      const users = JSON.parse(localStorage.getItem('ocio_users')) || [];
      const user = users.find(u => u.email === userEmail);
      balance = user?.balance || 0;
    } catch (e) {
      console.warn('Could not fetch balance:', e);
    }

    // Check if balance is below minimum
    if (balance < MIN_WITHDRAWAL) {
      balanceAlert.hidden = false;
      submitBtn.disabled = true;
      amountInput.disabled = true;
      return;
    } else {
      balanceAlert.hidden = true;
      amountInput.disabled = false;
    }

    // Validate amount
    if (amount < MIN_WITHDRAWAL) {
      if (amount > 0) {
        // Show warning if amount entered but too low
        validationMsg.innerHTML = `
          <div class="validation-message warning">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Minimum withdrawal amount is $1,000.</span>
          </div>
        `;
        validationMsg.hidden = false;
      } else {
        validationMsg.hidden = true;
      }
      submitBtn.disabled = true;
    } else {
      // Amount is valid
      validationMsg.innerHTML = `
        <div class="validation-message success">
          <i class="fas fa-check-circle"></i>
          <span>Amount is valid.</span>
        </div>
      `;
      validationMsg.hidden = false;
      submitBtn.disabled = false;
    }
  }

  // Real-time validation as user types
  amountInput.addEventListener('input', validateWithdrawal);
  amountInput.addEventListener('change', validateWithdrawal);

  // Initial validation on page load
  validateWithdrawal();
});
