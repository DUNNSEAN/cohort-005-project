# Cadence

Cadence sells video courses to learners and lets them get their money back within limits.

## Language

### Buying and refunding

**Purchase**:
A learner's payment for one course, which grants them access to it.
_Avoid_: Order, transaction

**Refund Request**:
A learner's ask, with their reason, to get the money back for a Purchase. It is Requested, then Approved or Declined. A Purchase has at most one Refund Request, so a Decline is final.
_Avoid_: Cancellation, Reversal, Chargeback

**Refund Window**:
The 14 calendar days after the day of a Purchase, including the whole fourteenth day. A Refund Request can only be raised inside it.
_Avoid_: Cancel window, cancellation period

**Refund**:
The money returned to a learner, always the amount paid on the Purchase. A Refund exists only once a Refund Request is Approved.
_Avoid_: Reversal, Chargeback

**Cancelled Purchase**:
A Purchase whose Refund Request was Approved; the learner no longer has access to the course. A learner never cancels a Purchase directly.
_Avoid_: Reversed purchase, refunded purchase

**Chargeback**:
Reserved for a dispute a learner raises with their bank against a Purchase. Cadence does not start Chargebacks, so never use the word for a Refund Request or a Refund.
