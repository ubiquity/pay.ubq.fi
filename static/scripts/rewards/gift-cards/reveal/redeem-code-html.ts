import { ReloadlyTransaction } from "../../../../../shared/types";

const html = String.raw;

export function getRedeemCodeHtml(transaction: ReloadlyTransaction) {
  return html`
    <div class="product redeem-code" data-transactionId="${transaction.transactionId}">
      <h3>Your redeem code</h3>
      <p>xxxxxxxxxxxx</p>
      <p>xxxxxxxxxxxx</p>
      <p>xxxxxxxxxxxx</p>
      <div class="buttons">
        <button id="reveal-btn" data-loading-reveal="false">
          <span class="action">Reveal</span>
          <span class="loading">
            <svg
              version="1.1"
              id="L9"
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              width="13"
              height="13"
              viewBox="0 0 100 100"
              enable-background="new 0 0 0 0"
              xml:space="preserve"
            >
              <path fill="#fff" d="M73,50c0-12.7-10.3-23-23-23S27,37.3,27,50 M30.9,50c0-10.5,8.5-19.1,19.1-19.1S69.1,39.5,69.1,50"></path>
            </svg>
          </span>
        </button>
      </div>
    </div>
  `;
}
