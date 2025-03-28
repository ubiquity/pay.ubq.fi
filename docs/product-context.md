# Product Context: Permit Claiming Application

## 1. Problem Statement

Contributors to Ubiquity DAO's GitHub repositories are rewarded with blockchain-based "Permits" for their participation (e.g., fixing issues, reviewing PRs). These Permits represent potential cash rewards but are currently posted manually by a bot within GitHub issue comments.

Finding these Permits across numerous repositories and issues is tedious. Furthermore, each Permit needs to be individually checked for validity (Is it still claimable? Has the deadline passed?) and then claimed via a separate blockchain transaction. This process is inefficient, time-consuming, and prone to missing rewards, creating a poor experience for contributors.

## 2. Proposed Solution

This application aims to streamline the entire Permit claiming process for contributors. It will act as a central hub to:

1.  **Discover:** Access permit data associated with the user's connected wallet address. (The backend needs to handle the association between wallets and permits, potentially leveraging existing database links or other mechanisms).
2.  **Validate:** Check the on-chain status of each discovered Permit to ensure it's valid and claimable.
3.  **Aggregate & Claim:** Allow users to use their connected Web3 wallet to claim all their valid Permits in a single, consolidated blockchain transaction (future feature) or individually, saving time and gas fees.

## 3. Target Users

*   Contributors to Ubiquity DAO's GitHub repositories who receive Permit rewards.

## 4. User Goals & Needs

*   **Efficiency:** Quickly find all Permits they are eligible for without manually searching GitHub.
*   **Clarity:** Easily see which Permits are valid and ready to be claimed.
*   **Simplicity:** Claim all valid Permits with minimal effort and fewer transactions.
*   **Confidence:** Trust that the application accurately finds and validates Permits.
*   **Cost Savings:** Reduce gas fees by batching claims into a single transaction.

## 5. Key User Experience Principles

*   **Automated Discovery:** Minimize manual searching.
*   **Clear Status:** Provide unambiguous feedback on Permit validity.
*   **One-Click Claiming:** Simplify the claiming process as much as possible.
*   **Transparency:** Show the source of Permits (link back to GitHub comment) and the validation status details.

## 6. User Flow

1.  **Access Application:** The user navigates to the application URL.
2.  **Wallet Connection Prompt:** The user is presented with options to connect their Web3 wallet (e.g., MetaMask, WalletConnect).
3.  **Wallet Connection:** The user selects their preferred wallet and approves the connection request through their wallet extension/application.
4.  **Permit Discovery & Display:** Upon successful connection, the application uses the user's wallet address to query the backend for associated permits.
5.  **Validation:** Found permits are displayed in the UI, and the validation process begins (checking on-chain status).
