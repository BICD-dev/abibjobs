---
name: Withdrawal email-code verification
description: Design constraints for the new-bank withdrawal verification-code flow (admin-mediated approval).
---

# Withdrawal email-code verification

The `/api/wallet/withdrawal-requests` endpoint is the "new bank account" path (admin-mediated); `/api/wallet/withdraw` is the saved-bank direct path. Every new-bank request gets a 6-digit code emailed to the user's registered email; an admin must enter the user-relayed code on the process route before `approved` succeeds.

## Rule: never null `verificationCode` to invalidate a code
A null `verificationCode` means "legacy request created before this feature → no code required, passthrough allowed." So nulling a code to "expire/lock" it would silently RE-ENABLE the passthrough and let an admin approve with no code at all — defeating the control.

**Why:** the legacy-passthrough check is `if (existing.verificationCode) { ...require match... }`. Anything falsy bypasses verification entirely.

**How to apply:** enforce lockout with the separate `codeAttempts` counter (5 mismatches → refuse and force a Resend), not by clearing the code. Resend (`setWithdrawalRequestCode`) overwrites with a fresh code AND resets `codeAttempts` to 0. Keep the stored code non-null for the request's whole life.

## Other constraints
- The code must NEVER be returned by any API. All routes returning withdrawal rows pass them through `stripWithdrawalCode()`. If you add a new route that returns withdrawal rows, strip it too.
- Generate codes with `crypto.randomInt(100000, 1000000)` (not `Math.random`).
- Resend route must verify the user has an email BEFORE overwriting the stored code, or a no-email user's request becomes permanently unapprovable.
