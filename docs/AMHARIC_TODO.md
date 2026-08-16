# Amharic Translation TODO

Every value in `messages/am.json` that still carries the `[AM] ` placeholder prefix, extracted directly
from `messages/am.json` (Amharic) and `messages/en.json` (English source): **97 keys**, verified two
independent ways (a script walking the full JSON tree, and a raw count of `[AM]` occurrences) — both agree
exactly. The regeneration request cited 74; that number does not match the repository as it stands and is
not used below. The previous version of this file recorded 43 as of its own last update.

This file is a work list only — nothing in `messages/am.json` has been changed or translated.

**Student dashboard namespaces are listed first.** They're the keys that matter most right now: a student
who selects Amharic currently sees the `[AM]` prefix throughout their own dashboard, not just in
storefront/marketing text.

---

## studentDashboard (42 keys)

1. `studentDashboard.currentAssignmentHeading`
   EN: This week's assignment
2. `studentDashboard.noAssignment`
   EN: No assignment right now — check back soon.
3. `studentDashboard.goalLabel`
   EN: Goal
4. `studentDashboard.status.notStarted`
   EN: Not started yet
5. `studentDashboard.status.inProgress`
   EN: In progress
6. `studentDashboard.status.submitted`
   EN: Submitted
7. `studentDashboard.status.reviewed`
   EN: Reviewed
8. `studentDashboard.status.completed`
   EN: Completed
9. `studentDashboard.status.missed`
   EN: Missed
10. `studentDashboard.practiceLogHeading`
    EN: Practice log
11. `studentDashboard.practiceLogDateLabel`
    EN: Date
12. `studentDashboard.practiceLogDurationLabel`
    EN: Minutes practiced
13. `studentDashboard.practiceLogFocusLabel`
    EN: What did you practice?
14. `studentDashboard.practiceLogSelfRatingLabel`
    EN: How did it go? (optional)
15. `studentDashboard.practiceLogSubmit`
    EN: Log practice
16. `studentDashboard.practiceLogSubmitting`
    EN: Saving…
17. `studentDashboard.practiceLogGenericError`
    EN: Something went wrong. Please try again.
18. `studentDashboard.noPracticeLogEntries`
    EN: No practice logged yet.
19. `studentDashboard.practiceLogMinutes`
    EN: {minutes} min
20. `studentDashboard.notesHeading`
    EN: Notes from your teacher
21. `studentDashboard.noNotes`
    EN: No notes yet.
22. `studentDashboard.submissionReceived`
    EN: Submitted — your teacher will review it.
23. `studentDashboard.recordingRequiredNotice`
    EN: This assignment requires a recording. Upload one below before you can submit.
24. `studentDashboard.submissionPlaceholder`
    EN: What did you practice, and how did it go?
25. `studentDashboard.submitAssignment`
    EN: Submit assignment
26. `studentDashboard.submitAssignmentSubmitting`
    EN: Submitting…
27. `studentDashboard.submitGenericError`
    EN: Something went wrong. Please try again.
28. `studentDashboard.yourSubmissionLabel`
    EN: What you submitted
29. `studentDashboard.submittedOnLabel`
    EN: Submitted {date}
30. `studentDashboard.feedbackLabel`
    EN: Feedback from your teacher
31. `studentDashboard.feedbackOnLabel`
    EN: Given {date}
32. `studentDashboard.recordingLabel`
    EN: Recording
33. `studentDashboard.noRecordingYet`
    EN: No recording yet.
34. `studentDashboard.recordingUploadLabel`
    EN: Upload a recording
35. `studentDashboard.recordingUploading`
    EN: Uploading…
36. `studentDashboard.recordingGenericError`
    EN: Something went wrong. Please try again.
37. `studentDashboard.progressHeading`
    EN: Your progress
38. `studentDashboard.progressInProgress`
    EN: In progress
39. `studentDashboard.currentMilestoneLabel`
    EN: Current focus
40. `studentDashboard.achievedMilestonesLabel`
    EN: Achieved milestones
41. `studentDashboard.noAchievedMilestones`
    EN: No milestones achieved yet.
42. `studentDashboard.achievedOnLabel`
    EN: Achieved {date}

## validation (10 keys)

Mixed namespace: 8 of these 10 gate student-dashboard forms (practice log, assignment submission, recording
upload); 2 (#43, #44) are storefront custom-order validation, listed here rather than in the store section
below only because `validation` is one JSON namespace and this file groups by namespace, per the format.

43. `validation.enterCustomOrderDescription` — store, not student dashboard
    EN: Describe your custom order (at least 10 characters)
44. `validation.customOrderDescriptionTooLong` — store, not student dashboard
    EN: Description must be 4000 characters or fewer
45. `validation.enterValidPracticeDate`
    EN: Enter a valid practice date
46. `validation.enterValidDuration`
    EN: Enter a duration between 1 and 600 minutes
47. `validation.enterFocus`
    EN: Describe what you practiced
48. `validation.enterSubmission`
    EN: Describe what you practiced before submitting
49. `validation.selectAssignment`
    EN: Select an assignment to attach this recording to
50. `validation.invalidRecordingType`
    EN: Unsupported recording type
51. `validation.invalidRecordingSize`
    EN: Invalid recording size
52. `validation.invalidRecordingPath`
    EN: This recording could not be confirmed

## store (4 keys)

53. `store.searchPlaceholder`
    EN: Search instruments…
54. `store.searchLabel`
    EN: Search
55. `store.clearSearch`
    EN: Clear search
56. `store.noResults`
    EN: No instruments found for “{query}”.

## product (1 key)

57. `product.viewPhoto`
    EN: View photo {index} of {count}

## customOrderNotice (20 keys)

58. `customOrderNotice.toggleLabel`
    EN: Custom Order Available
59. `customOrderNotice.pricingNotice`
    EN: This is a quote request, not a purchase. We'll review your custom order and confirm the final price within 1–2 business days. The final price may be higher than this instrument's listed base price. You will not be charged anything until you receive and accept your quote.
60. `customOrderNotice.descriptionLabel`
    EN: Describe your custom order
61. `customOrderNotice.descriptionPlaceholder`
    EN: Describe the design, color, size, decoration, tuning, or other details you want.
62. `customOrderNotice.imageLabel`
    EN: Upload a custom order image
63. `customOrderNotice.chooseImage`
    EN: Choose image
64. `customOrderNotice.replaceImage`
    EN: Replace image
65. `customOrderNotice.removeImageAriaLabel`
    EN: Remove selected image
66. `customOrderNotice.imageTypeError`
    EN: Please upload a JPG, PNG, or WebP image.
67. `customOrderNotice.imageSizeError`
    EN: Image must be smaller than 8MB.
68. `customOrderNotice.contactDetails`
    EN: Contact details
69. `customOrderNotice.fullName`
    EN: Full name
70. `customOrderNotice.emailAddress`
    EN: Email address
71. `customOrderNotice.phoneNumber`
    EN: Phone number
72. `customOrderNotice.paymentRegion`
    EN: Payment region
73. `customOrderNotice.usRegion`
    EN: United States — USD
74. `customOrderNotice.eurozoneRegion`
    EN: Eurozone — EUR
75. `customOrderNotice.submit`
    EN: Submit request
76. `customOrderNotice.submitting`
    EN: Submitting…
77. `customOrderNotice.genericError`
    EN: Something went wrong. Please try again.

## cart (4 keys)

78. `cart.selectAll`
    EN: Select all
79. `cart.selectItem`
    EN: Select {name}
80. `cart.itemsSelected`
    EN: {count} of {total} items selected
81. `cart.noItemsSelected`
    EN: Select at least one item to place your order.

## orderConfirmation (3 keys)

82. `orderConfirmation.quotePendingHeading`
    EN: Custom order request received
83. `orderConfirmation.quotePendingNotice`
    EN: We're reviewing the details you submitted. You'll receive an email with your final price and payment instructions within 1–2 business days. Please note the final price may be higher than the instrument's listed base price, depending on the customization you've requested.
84. `orderConfirmation.imageAttachFailed`
    EN: We received your request, but your reference photo didn't attach. You can send it by replying to your confirmation email.

## paymentLabels (1 key)

85. `paymentLabels.pendingQuote`
    EN: Awaiting quote

## emails (12 keys)

86. `emails.customOrderPending.subject`
    EN: Custom order request {orderNumber} received
87. `emails.customOrderPending.pricingNotice`
    EN: Your custom order request has been received. Our team will review your description and confirm your final price within 1–2 business days. The final price may be higher than the instrument's listed base price. No payment is due yet — we'll email you again with your total and payment instructions once your quote is ready.
88. `emails.customOrderPending.greeting`
    EN: Thank you for your custom order request, {customerName}.
89. `emails.customOrderPending.orderNumberLabel`
    EN: Order number
90. `emails.customOrderPending.productLabel`
    EN: Instrument
91. `emails.customOrderPending.descriptionLabel`
    EN: Your request
92. `emails.quoteReady.subject`
    EN: Your quote for order {orderNumber} is ready
93. `emails.quoteReady.greeting`
    EN: Hi {customerName},
94. `emails.quoteReady.quoteBody`
    EN: Thank you for your patience. We've reviewed your custom order request (order {orderNumber}) and your final price is {total}.
95. `emails.quoteReady.totalLabel`
    EN: Total
96. `emails.quoteReady.paymentMethodLabel`
    EN: Payment method
97. `emails.quoteReady.submitConfirmationNotice`
    EN: Once you've sent payment, please submit your payment confirmation details (sender name, amount, date/time, and optionally a screenshot) on your order confirmation page so we can verify it faster.

---

## Keys containing {placeholders} — keep the placeholder exactly as written

13 of the 97 keys have one or more `{placeholder}` tokens. The Amharic translation must reproduce the
token(s) verbatim.

- `studentDashboard.practiceLogMinutes` — `{minutes}`
- `studentDashboard.submittedOnLabel` — `{date}`
- `studentDashboard.feedbackOnLabel` — `{date}`
- `studentDashboard.achievedOnLabel` — `{date}`
- `store.noResults` — `{query}`
- `product.viewPhoto` — `{index}`, `{count}`
- `cart.selectItem` — `{name}`
- `cart.itemsSelected` — `{count}`, `{total}`
- `emails.customOrderPending.subject` — `{orderNumber}`
- `emails.customOrderPending.greeting` — `{customerName}`
- `emails.quoteReady.subject` — `{orderNumber}`
- `emails.quoteReady.greeting` — `{customerName}`
- `emails.quoteReady.quoteBody` — `{orderNumber}`, `{total}`

## Keys with a brand name that should stay in Latin script

None. Checked all 97 English source strings above for "Zelle", "Cash App", "Kirar", "Begena", "Masenqo",
"Qignit", and other product/brand names — none of the currently-untranslated keys mention one. (For
reference, elsewhere in `messages/am.json` — already translated, not part of this list — `cart.zelle`,
`cart.cashApp`, `paymentLabels.zelle`, and `paymentLabels.cashApp` correctly keep "Zelle" and "Cash App" in
Latin script rather than transliterating them.) "JPG", "PNG", and "WebP" in
`customOrderNotice.imageTypeError` are file-format names, not brand names, and are not flagged here.
