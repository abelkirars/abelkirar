# Amharic Translation TODO

Every value in `messages/am.json` that still carries the `[AM] ` placeholder prefix, extracted directly
from `messages/am.json` (Amharic) and `messages/en.json` (English source), verified by count: **41 keys**,
matching the number recorded in `docs/DECISIONS.md`.

This file is a work list only — nothing in `messages/am.json` has been changed or translated.

---

## customOrderNotice (20 keys)

1. `customOrderNotice.toggleLabel`
   EN: Custom Order Available
2. `customOrderNotice.pricingNotice`
   EN: This is a quote request, not a purchase. We'll review your custom order and confirm the final price within 1–2 business days. The final price may be higher than this instrument's listed base price. You will not be charged anything until you receive and accept your quote.
3. `customOrderNotice.descriptionLabel`
   EN: Describe your custom order
4. `customOrderNotice.descriptionPlaceholder`
   EN: Describe the design, color, size, decoration, tuning, or other details you want.
5. `customOrderNotice.imageLabel`
   EN: Upload a custom order image
6. `customOrderNotice.chooseImage`
   EN: Choose image
7. `customOrderNotice.replaceImage`
   EN: Replace image
8. `customOrderNotice.removeImageAriaLabel`
   EN: Remove selected image
9. `customOrderNotice.imageTypeError`
   EN: Please upload a JPG, PNG, or WebP image.
10. `customOrderNotice.imageSizeError`
    EN: Image must be smaller than 8MB.
11. `customOrderNotice.contactDetails`
    EN: Contact details
12. `customOrderNotice.fullName`
    EN: Full name
13. `customOrderNotice.emailAddress`
    EN: Email address
14. `customOrderNotice.phoneNumber`
    EN: Phone number
15. `customOrderNotice.paymentRegion`
    EN: Payment region
16. `customOrderNotice.usRegion`
    EN: United States — USD
17. `customOrderNotice.eurozoneRegion`
    EN: Eurozone — EUR
18. `customOrderNotice.submit`
    EN: Submit request
19. `customOrderNotice.submitting`
    EN: Submitting…
20. `customOrderNotice.genericError`
    EN: Something went wrong. Please try again.

## cart (4 keys)

21. `cart.selectAll`
    EN: Select all
22. `cart.selectItem`
    EN: Select {name}
23. `cart.itemsSelected`
    EN: {count} of {total} items selected
24. `cart.noItemsSelected`
    EN: Select at least one item to place your order.

## orderConfirmation (2 keys)

25. `orderConfirmation.quotePendingHeading`
    EN: Custom order request received
26. `orderConfirmation.quotePendingNotice`
    EN: We're reviewing the details you submitted. You'll receive an email with your final price and payment instructions within 1–2 business days. Please note the final price may be higher than the instrument's listed base price, depending on the customization you've requested.

## paymentLabels (1 key)

27. `paymentLabels.pendingQuote`
    EN: Awaiting quote

## validation (2 keys)

28. `validation.enterCustomOrderDescription`
    EN: Describe your custom order (at least 10 characters)
29. `validation.customOrderDescriptionTooLong`
    EN: Description must be 4000 characters or fewer

## emails (12 keys)

30. `emails.customOrderPending.subject`
    EN: Custom order request {orderNumber} received
31. `emails.customOrderPending.pricingNotice`
    EN: Your custom order request has been received. Our team will review your description and confirm your final price within 1–2 business days. The final price may be higher than the instrument's listed base price. No payment is due yet — we'll email you again with your total and payment instructions once your quote is ready.
32. `emails.customOrderPending.greeting`
    EN: Thank you for your custom order request, {customerName}.
33. `emails.customOrderPending.orderNumberLabel`
    EN: Order number
34. `emails.customOrderPending.productLabel`
    EN: Instrument
35. `emails.customOrderPending.descriptionLabel`
    EN: Your request
36. `emails.quoteReady.subject`
    EN: Your quote for order {orderNumber} is ready
37. `emails.quoteReady.greeting`
    EN: Hi {customerName},
38. `emails.quoteReady.quoteBody`
    EN: Thank you for your patience. We've reviewed your custom order request (order {orderNumber}) and your final price is {total}.
39. `emails.quoteReady.totalLabel`
    EN: Total
40. `emails.quoteReady.paymentMethodLabel`
    EN: Payment method
41. `emails.quoteReady.submitConfirmationNotice`
    EN: Once you've sent payment, please submit your payment confirmation details (sender name, amount, date/time, and optionally a screenshot) on your order confirmation page so we can verify it faster.

---

## Keys containing {placeholders} — keep the placeholder exactly as written

7 of the 41 keys have one or more `{placeholder}` tokens. The Amharic translation must reproduce the
token(s) verbatim (same name, same braces) — do not translate the token name itself.

- `cart.selectItem` — `{name}`
- `cart.itemsSelected` — `{count}`, `{total}`
- `emails.customOrderPending.subject` — `{orderNumber}`
- `emails.customOrderPending.greeting` — `{customerName}`
- `emails.quoteReady.subject` — `{orderNumber}`
- `emails.quoteReady.greeting` — `{customerName}`
- `emails.quoteReady.quoteBody` — `{orderNumber}`, `{total}`

## Keys with a brand name that should stay in Latin script

None. Checked every one of the 41 English source strings above for "Zelle", "Cash App", or any other
brand name — none of the currently-untranslated keys mention one. (For reference, elsewhere in
`messages/am.json` — already translated, not part of this list — `cart.zelle`, `cart.cashApp`,
`paymentLabels.zelle`, and `paymentLabels.cashApp` correctly keep "Zelle" and "Cash App" in Latin script
rather than transliterating them.)
