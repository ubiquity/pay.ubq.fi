# Project Brief: Permit Claiming Application (Rewrite)

## 1. Project Goal

To create a new web application from scratch that allows users to efficiently find, validate, and claim blockchain-based "Permit" rewards posted in GitHub issue comments. This application replaces the previous `pay.ubq.fi` functionality, removing all features related to gift cards and Reloadly.

## 2. Core Requirements

*   **GitHub Integration:** Scan specified GitHub repositories/issues for comments containing Permit data.
*   **Permit Parsing:** Extract relevant Permit details (e.g., contract address, token ID, signature, deadline) from comment text.
*   **Blockchain Validation:** Verify the validity of found Permits on the relevant blockchain network (e.g., check if already claimed, check signature validity, check deadline).
*   **Batch Claiming:** Allow users to connect their Web3 wallet and claim multiple valid Permits in a single, aggregated transaction for efficiency.
*   **User Interface:** Provide a clear and intuitive interface for users to:
    *   Initiate GitHub scans.
    *   View found and validated Permits.
    *   Connect their wallet.
    *   Initiate the batch claim process.
    *   View transaction status and history (optional).

## 3. Scope - Exclusions

*   Gift card purchasing, redemption, or management.
*   Integration with Reloadly or similar services.
*   Any functionality not directly related to finding, validating, and claiming GitHub Permits.

## 4. Success Metrics

*   Users can successfully find Permits posted in GitHub comments.
*   Permit validation accurately reflects on-chain status.
*   Users can successfully claim valid Permits via the batch claim mechanism.
*   The application is reliable, performant, and easy to use.
*   The codebase is clean, well-documented, maintainable, and free of the technical debt present in the previous version.
