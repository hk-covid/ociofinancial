/**
 * ===================================
 * WITHDRAW VALIDATION MODULE
 * ===================================
 * 
 * Handles dynamic minimum withdrawal validation
 * - Reads admin-configured minimum from localStorage
 * - Displays red error message when user enters amount below minimum
 * - Message appears/disappears as user modifies input
 * - Validation message references the current admin-set threshold
 */

'use strict';

// ===== CONFIG =====
// Default minimum if admin hasn't set one yet
const DEFAULT_MIN_WITHDRAWAL = 1000;

// Storage key for admin-configured minimum withdrawal amount
const ADMIN_MIN_WITHDRAWAL_KEY = 'admin_min_withdrawal_amount';

// ===== STATE =====
let currentMinWithdrawal = DEFAULT_MIN_WITHDRAWAL;

/**
 * Get the current minimum withdrawal amount from admin settings
 * Falls back to DEFAULT_MIN_WITHDRAWAL if not configured
 * 
 * @returns {number} The minimum withdrawal amount in USD
 */
function getMinimumWithdrawal() {
  try {
    const stored = localStorage.getItem(ADMIN_MIN_WITHDRAWAL_KEY);
    if (stored) {
      const value = parseFloat(stored);
      if (!isNaN(value) && value > 0) {
        return value;
      }
    }
  } catch (e) {
    console.warn('[WithdrawValidation] Error reading minimum withdrawal:', e);
  }
  return DEFAULT_MIN_WITHDRAWAL;
}

/**
 * Update the minimum withdrawal amount from admin panel
 * This is called by the admin dashboard when settings are saved
 * 
 * @param {number} newMinimum - The new minimum withdrawal amount
 */
function setMinimumWithdrawal(newMinimum) {
  if (typeof newMinimum !== 'number' || newMinimum <= 0) {
    console.error('[WithdrawValidation] Invalid minimum withdrawal value:', newMinimum);
    return false;
  }
  try {
    localStorage.setItem(ADMIN_MIN_WITHDRAWAL_KEY, newMinimum.toString());
    currentMinWithdrawal = newMinimum;
    console.log('[WithdrawValidation] Minimum withdrawal updated to:', newMinimum);
    // Trigger validation update if amount field exists
    validateWithdrawalAmount();
    return true;
  } catch (e) {
    console.error('[WithdrawValidation] Error setting minimum withdrawal:', e);
    return false;
  }
}

/**
 * Format a number as USD currency
 * 
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "$1,000.00")
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Validate the withdrawal amount input
 * - Shows error message if amount is below minimum
 * - Hides message if amount meets or exceeds minimum
 * - Message dynamically shows the current admin-set threshold
 */
function validateWithdrawalAmount() {
  const amountInput = document.getElementById('wd-amount');
  const validationContainer = document.getElementById('wd-amount-validation');
  const validationText = document.getElementById('wd-validation-text');
  const submitBtn = document.getElementById('wd-submit-btn');

  if (!amountInput || !validationContainer) {
    console.warn('[WithdrawValidation] Required elements not found');
    return;
  }

  // Refresh the minimum from admin settings each time (in case it changed)
  currentMinWithdrawal = getMinimumWithdrawal();

  const amount = parseFloat(amountInput.value);

  // Check if amount is valid and below minimum
  if (isNaN(amount) || amount === '' || amount === 0) {
    // Empty or invalid input - hide validation message
    validationContainer.hidden = true;
    validationContainer.classList.remove('error');
    if (submitBtn) submitBtn.disabled = false;
  } else if (amount < currentMinWithdrawal) {
    // Amount is below minimum - show red error message
    validationContainer.hidden = false;
    validationContainer.classList.add('error');
    validationText.textContent = `Minimum withdrawal: ${formatCurrency(currentMinWithdrawal)}`;
    if (submitBtn) submitBtn.disabled = true; // Prevent submission
  } else {
    // Amount meets or exceeds minimum - hide message and enable submit
    validationContainer.hidden = true;
    validationContainer.classList.remove('error');
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Initialize withdrawal validation on page load
 */
function initWithdrawValidation() {
  const amountInput = document.getElementById('wd-amount');
  const bankForm = document.getElementById('wd-bank-form');

  if (!amountInput) {
    console.warn('[WithdrawValidation] Amount input not found');
    return;
  }

  // Load current minimum from admin settings
  currentMinWithdrawal = getMinimumWithdrawal();
  console.log('[WithdrawValidation] Initialized with minimum withdrawal:', formatCurrency(currentMinWithdrawal));

  // Listen for changes to the amount input
  amountInput.addEventListener('input', validateWithdrawalAmount);
  amountInput.addEventListener('change', validateWithdrawalAmount);

  // Validate on form submission to ensure compliance
  if (bankForm) {
    bankForm.addEventListener('submit', function(e) {
      validateWithdrawalAmount();
      const amountInputValue = parseFloat(amountInput.value);
      if (!isNaN(amountInputValue) && amountInputValue < currentMinWithdrawal) {
        e.preventDefault();
        console.warn('[WithdrawValidation] Form submission blocked: amount below minimum');
      }
    });
  }

  // Initial validation in case form is pre-filled
  validateWithdrawalAmount();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWithdrawValidation);
} else {
  initWithdrawValidation();
}

// Export for use in admin panel
window.WithdrawValidation = {
  getMinimumWithdrawal,
  setMinimumWithdrawal,
  formatCurrency,
  validateWithdrawalAmount
};
