# Amharic Translation TODO

Every value in `messages/am.json` that still carries the `[AM] ` placeholder prefix, extracted directly
from `messages/am.json` (Amharic) and `messages/en.json` (English source): **43 keys** — 41 as of the
initial extraction, plus `orderConfirmation.imageAttachFailed` (Custom Made reference-photo upload) and
`product.viewPhoto` (product photo gallery), both added later — see `docs/DECISIONS.md`. Older entries in
`docs/DECISIONS.md` that say "41" or "42" are historical and describe the count at the time they were
written, not a discrepancy.

This file is a work list only — nothing in `messages/am.json` has been changed or translated.

---

## product (1 key)

1. `product.viewPhoto`
   EN: View photo {index} of {count}

## customOrderNotice (20 keys)

2. `customOrderNotice.toggleLabel`
   EN: Custom Order Available
3. `customOrderNotice.pricingNotice`
   EN: This is a quote request, not a purchase. We'll review your custom order and confirm the final price within 1–2 business days. The final price may be higher than this instrument's listed base price. You will not be charged anything until you receive and accept your quote.
4. `customOrderNotice.descriptionLabel`
   EN: Describe your custom order
5. `customOrderNotice.descriptionPlaceholder`
   EN: Describe the design, color, size, decoration, tuning, or other details you want.
6. `customOrderNotice.imageLabel`
   EN: Upload a custom order image
7. `customOrderNotice.chooseImage`
   EN: Choose image
8. `customOrderNotice.replaceImage`
   EN: Replace image
9. `customOrderNotice.removeImageAriaLabel`
   EN: Remove selected image
10. `customOrderNotice.imageTypeError`
    EN: Please upload a JPG, PNG, or WebP image.
11. `customOrderNotice.imageSizeError`
    EN: Image must be smaller than 8MB.
12. `customOrderNotice.contactDetails`
    EN: Contact details
13. `customOrderNotice.fullName`
    EN: Full name
14. `customOrderNotice.emailAddress`
    EN: Email address
15. `customOrderNotice.phoneNumber`
    EN: Phone number
16. `customOrderNotice.paymentRegion`
    EN: Payment region
17. `customOrderNotice.usRegion`
    EN: United States — USD
18. `customOrderNotice.eurozoneRegion`
    EN: Eurozone — EUR
19. `customOrderNotice.submit`
    EN: Submit request
20. `customOrderNotice.submitting`
    EN: Submitting…
21. `customOrderNotice.genericError`
    EN: Something went wrong. Please try again.

## cart (4 keys)

22. `cart.selectAll`
    EN: Select all
23. `cart.selectItem`
    EN: Select {name}
24. `cart.itemsSelected`
    EN: {count} of {total} items selected
25. `cart.noItemsSelected`
    EN: Select at least one item to place your order.

## orderConfirmation (3 keys)

26. `orderConfirmation.quotePendingHeading`
    EN: Custom order request received
27. `orderConfirmation.quotePendingNotice`
    EN: We're reviewing the details you submitted. You'll receive an email with your final price and payment instructions within 1–2 business days. Please note the final price may be higher than the instrument's listed base price, depending on the customization you've requested.
28. `orderConfirmation.imageAttachFailed`
    EN: We received your request, but your reference photo didn't attach. You can send it by replying to your confirmation email.

## paymentLabels (1 key)

29. `paymentLabels.pendingQuote`
    EN: Awaiting quote

## validation (2 keys)

30. `validation.enterCustomOrderDescription`
    EN: Describe your custom order (at least 10 characters)
31. `validation.customOrderDescriptionTooLong`
    EN: Description must be 4000 characters or fewer

## emails (12 keys)

32. `emails.customOrderPending.subject`
    EN: Custom order request {orderNumber} received
33. `emails.customOrderPending.pricingNotice`
    EN: Your custom order request has been received. Our team will review your description and confirm your final price within 1–2 business days. The final price may be higher than the instrument's listed base price. No payment is due yet — we'll email you again with your total and payment instructions once your quote is ready.
34. `emails.customOrderPending.greeting`
    EN: Thank you for your custom order request, {customerName}.
35. `emails.customOrderPending.orderNumberLabel`
    EN: Order number
36. `emails.customOrderPending.productLabel`
    EN: Instrument
37. `emails.customOrderPending.descriptionLabel`
    EN: Your request
38. `emails.quoteReady.subject`
    EN: Your quote for order {orderNumber} is ready
39. `emails.quoteReady.greeting`
    EN: Hi {customerName},
40. `emails.quoteReady.quoteBody`
    EN: Thank you for your patience. We've reviewed your custom order request (order {orderNumber}) and your final price is {total}.
41. `emails.quoteReady.totalLabel`
    EN: Total
42. `emails.quoteReady.paymentMethodLabel`
    EN: Payment method
43. `emails.quoteReady.submitConfirmationNotice`
    EN: Once you've sent payment, please submit your payment confirmation details (sender name, amount, date/time, and optionally a screenshot) on your order confirmation page so we can verify it faster.

---

## Keys containing {placeholders} — keep the placeholder exactly as written

8 of the 43 keys have one or more `{placeholder}` tokens. The Amharic translation must reproduce the
token(s) verbatim.

- `product.viewPhoto` — `{index}`, `{count}`
- `cart.selectItem` — `{name}`
- `cart.itemsSelected` — `{count}`, `{total}`
- `emails.customOrderPending.subject` — `{orderNumber}`
- `emails.customOrderPending.greeting` — `{customerName}`
- `emails.quoteReady.subject` — `{orderNumber}`
- `emails.quoteReady.greeting` — `{customerName}`
- `emails.quoteReady.quoteBody` — `{orderNumber}`, `{total}`

## Keys with a brand name that should stay in Latin script

None. Checked all 43 English source strings above for "Zelle", "Cash App", or any other brand name — none
of the currently-untranslated keys mention one. (For reference, elsewhere in `messages/am.json` — already
translated, not part of this list — `cart.zelle`, `cart.cashApp`, `paymentLabels.zelle`, and
`paymentLabels.cashApp` correctly keep "Zelle" and "Cash App" in Latin script rather than transliterating
them.)
