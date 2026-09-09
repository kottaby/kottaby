# PAYMOB MIRROR DIGEST — offline docs at `.agents/skills/paymob-payments/references/`

Mirror provenance: generated 2026-06-11 from developers.paymob.com (`SKILL.md:124-127`, `references/MIRROR.md`). All docs carry frontmatter with live `url:` and `breadcrumbs:`.

**⚠️ Caution for the plan author**: `SKILL.md:93-121` ("Lumina-specific wiring") is written for a *different* repo (Next.js + Supabase, `luminaai.company`, Vercel env vars `PAYMOB_SECRET_KEY` etc., messages JSON i18n). It is NOT Kottaby. Use its Paymob API facts, ignore its repo-wiring section.

---

## 0. Integration model & credentials

Sources: `SKILL.md:43-91`, `references/cheatsheet.md:6-91`.

- Region base URLs (endpoint paths are relative to these): Egypt `https://accept.paymob.com/` · KSA `https://ksa.paymob.com/` · UAE `https://uae.paymob.com/` · Oman `https://oman.paymob.com/` (`cheatsheet.md:8-13`).
- Four credentials (`SKILL.md:48-58`, `cheatsheet.md:19-25`):
  | Credential | Shape | Usage | Auth presentation |
  |---|---|---|---|
  | Secret key | `sk_test_…` / `sk_live_…` | Intention API, refund/void/capture, MIT | header `Authorization: Token <sk>` (server-side only) |
  | Public key | `pk_…` / `egy_pk_…` | Unified Checkout URL, Pixel | query param `publicKey` |
  | API key | base64 string | `POST api/auth/tokens` exchange only | body `api_key`; shared test+live (`getting-integration-credentials.md:59-62`) |
  | HMAC secret | hex | verify callbacks | HMAC-SHA512 key (server-side only) |
- Dashboard locations: Settings tab (secret/public/API keys, separate test/live modes); Developers → Payment Integrations (integration IDs + callback URL edit form) (`getting-integration-credentials.md:24-89`).
- Integration IDs: one per payment method/currency; Test/Live status of the ID **must** match the secret key mode (`cheatsheet.md:29`, `SKILL.md:56-58`).
- Amounts are integer cents (EGP piasters); `sum(items[].amount) === amount` (`SKILL.md:59-60`, `create-intention.md:122`).

---

## 1. `POST v1/intention/` — Create Intention

Source: `references/docs/intention-apis/create-intention.md`. Auth: `Authorization: Token sk_…`, `Content-Type: application/json` (`create-intention.md:110-111`).

### Request body (`create-intention.md:113-142`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | number | **required** | integer cents (example `2000`) |
| `currency` | string | **required** | must match currency of the selected Integration ID (example `EGP`) |
| `payment_methods` | array | **required** | Integration IDs as integers (e.g. `158`) **or** names as strings (e.g. `"card"`); Test/Live status must match secret key |
| `items[]` | array | optional | if present: per item `name` (string, **required**, max 50), `amount` (number, **required**, cents), `description` (string, max 255), `quantity` (number); `sum(amount) == amount` |
| `billing_data` | object | optional-ish* | see caveat below |
| `billing_data.first_name` | string | **required** | max 50 chars |
| `billing_data.last_name` | string | **required** | max 50 chars |
| `billing_data.email` | string | **required** | |
| `billing_data.phone_number` | string | required in practice | doc body table marks it optional (`create-intention.md:131`) but the page's own Common Errors show 400 `billing_data.phone_number: ["This field is required."]` (`create-intention.md:84-98`), and `update-intention.md:83` marks it **required** (international or domestic format incl. alpha-2/numeric country codes) |
| `billing_data.apartment / street / building / city / country / floor / state` | string | optional | examples `dumy` |
| `extras` | object | optional | arbitrary custom keys (example `{"ee": 22}`); "returned in callbacks under the payment key claims object" (`create-intention.md:137-138`) |
| `special_reference` | string | optional | unique; returned in transaction callback as `merchant_order_id` (natural idempotency key — `SKILL.md:79-82`) |
| `expiration` | number | optional | seconds (example `3600`) |
| `notification_url` | string | optional | processed-callback override; **"Supported only with card Integration IDs"**; same endpoint also receives the card-token payload (`create-intention.md:141`) |
| `redirection_url` | string | optional | response-callback override; **"Supported for Card and Wallet payment methods only"** (`create-intention.md:142`) |

**"N/A placeholder convention" — NOT explicitly documented.** The create-intention page does not state a `billing_data` placeholder rule. `"NA"` placeholder values appear empirically throughout examples: `shipping_data` / `payment_key_claims.billing_data` with `street:"NA", building:"NA", floor:"NA", apartment:"NA", city:"NA", state:"NA", postal_code:"NA"` in `split-features-implementation.md:142-150` and `by-order-id-or-reference.md:152-164`. The Pixel full-sample instead uses the literal string `"dumy"` for the optional address fields (`pixel-embedded.md:259-271`). Safe reading: optional `billing_data` address fields should carry a non-empty placeholder string (`"NA"` is the value Paymob itself round-trips).

Other intention-time fields seen elsewhere: `card_tokens: string[]` (CIT, max 3 — `cit.md:39-43`), `subscription_plan_id` + `subscription_start_date` (subscription creation — `create-subscription.md:27-37`), `accept_order_id` (required on Update — `update-intention.md:31-48`; also present in the update Pixel example `pixel-embedded.md:243`).

### Response 201 (`create-intention.md:144-205`)

`payment_keys[]` = `{integration:number, key:string (JWT payment token), gateway_type:string (example "MIGS"), iframe_id:string, order_id:number}`; `intention_order_id:number` (= Paymob order id, ~ callback `order.id`); `id:string` (intention id, e.g. `pi_test_bd49bb7fb4da48cfac4ec71ab4d8c433`); `client_secret:string` (e.g. `egy_csk_test_94042f793419c5a0f14a4cadfda9d626`); `intention_detail:{amount, items[{name,amount,description,quantity,image}], currency, billing_data{apartment,floor,first_name,last_name,street,building,phone_number,shipping_method,city,country,state,email,postal_code}}`; `payment_methods[]:{integration_id, alias, name, method_type (e.g. "online"), currency, live:boolean, use_cvc_with_moto:boolean}`; `special_reference`; `extras:{creation_extras:{…}, confirmation_extras}`; `confirmed:boolean`; `status` (example `"intended"`); `created` (ISO e.g. `2024-11-18T13:42:08.456634`); `card_detail`; `card_tokens[]`; `object:"paymentintention"`.

**Documented common errors** (`create-intention.md:34-98`): 404 `{"detail":"Integration ID/Name does not exist in our system …"}` (ID wrong account / test-live mismatch / not online-type / misconfigured); 400 `items.name`/`items.amount` "This field is required."; 400 `billing_data.phone_number` "This field is required."

### Update Intention (`update-intention.md`)
`PUT v1/intention/{client_secret}/`, same auth. Must include `accept_order_id` (error 400 if missing — JSON snapshot is malformed in the mirror). Mutable: `amount` (**required**), `payment_methods`, `items`, `billing_data` (same shape, now with `phone_number` **required**), `special_reference`, `expiration`, `notification_url`, `redirection_url`. Response mirrors Create's 201 shape.

---

## 2. Checkout (Unified Checkout redirect & Pixel)

Source: `references/docs/checkout-experiences/`.

- Redirect URL: `GET {base}unifiedcheckout/?publicKey=<pk>&clientSecret=<client_secret>` — the doc page's endpoint form is `GET unifiedcheckout/` (`unified-checkout-redirection.md:35`). **Only two documented query params: `publicKey` (**required**), `clientSecret` (**required**). NO `locale` / `theme` / other query params are documented in the mirror — NOT FOUND.** Look-and-feel customization is done in the dashboard (link `https://accept.paymob.com/portal2/en/checkout-customization`, `checkout-experiences/overview.md:25`).
- Cheatsheet additionally lists a payment-status page `{base}unifiedcheckout/payment-status?...` (`cheatsheet.md:49`) — referenced but the mirror has no dedicated page; treat as unverified.
- Pixel (embedded): JS module at `https://cdn.jsdelivr.net/npm/paymob-pixel@latest/main.js` + two stylesheets (`pixel-embedded.md:19-23`). `new Pixel({publicKey, clientSecret, paymentMethods:["card","google-pay","apple-pay"], elementId, disablePay, showSaveCard, forceSaveCard, beforePaymentComplete, afterPaymentComplete, onPaymentCancel, cardValidationChanged, customStyle{…}})` (`pixel-embedded.md:29-73`). Event `payFromOutside` fired via `window.dispatchEvent(new Event("payFromOutside"))` to trigger payment from a custom button; `Pixel.updateIntentionData()` after `PUT v1/intention` (`pixel-embedded.md:164, 128-143, 296`). Google Pay is **not** available in Egypt (`pixel-embedded.md:84-86`).
- Card integration types for checkout: **Normal 3DS**, **Moto** (no customer interaction, backend), **Card On File**, **Auth/Cap**, **Verification** — `cards-all-regions.md:41-79`. Supported actions: Void (all types), Refund full/partial (all), Capture full/partial (Auth/Cap only). Networks: EGY = VISA/Mastercard/Amex (`cards-all-regions.md:25-31`).

---

## 3. Callbacks — payload shapes

Sources: `references/docs/webhook-callbacks-and-hmac/`.

| | Processed callback | Response callback |
|---|---|---|
| Method/content | `POST` JSON, server→server | `GET` query params, customer redirect |
| Set via | Integration ID config (dashboard) or per-intention `notification_url` | dashboard or per-intention `redirection_url` |
| Fired when | transaction **succeeds** or is **declined** (`overview.md:19`); also on Refund/Void/Capture actions on the parent transaction (`webhook-testing-tool.md:15`, `refund.md:25-29`, `void.md:25-29`) | after payment completes |
| HMAC location | **`hmac` query param even on the POST** (`hmac-transaction-callback.md:77`, `SKILL.md:72`) | `hmac` query param |

The mirror's `transaction-callbacks.md:40` says a full POST sample is "on the right side of this page" — **the full POST JSON example did not survive the conversion (NOT FOUND in mirror)**. Documented processed-callback keys to observe (`transaction-callbacks.md:22-38`): `id` (transaction id), `success`, `order.id`, `is_refunded`, `refunded_amount_cents` (sums multiple partial refunds), `is_voided`, `is_captured`, `captured_amount`. The nested transaction-object shape (what sits under the POST body — envelope `{type, obj}` per the card-token sample and the HMAC doc's `obj.id` path) matches the refund/void/capture **Response 200** schema, which the mirror renders fully (`refund.md:64-231`, `void.md:63-231`, `capture.md:70-238`): top-level `id, pending, amount_cents, success, is_auth, is_capture, is_standalone_payment, is_voided, is_refunded, is_3d_secure, integration_id, profile_id, has_parent_transaction, order{id, created_at, delivery_needed, merchant{…}, amount_cents, shipping_data{…}, currency, merchant_order_id, paid_amount_cents, items[{name,description,amount_cents,quantity}], payment_method, api_source, data, …}, created_at, transaction_processed_callback_responses[], currency, source_data{type, pan, sub_type, tenure}, api_source, is_void, is_refund, data{…gateway fields incl. txn_response_code "APPROVED", acq_response_code, message}, is_hidden, payment_key_claims{exp, extra{…your extras}, user_id, currency, order_id, amount_cents, billing_data{…}, integration_id, lock_order_when_paid, next_payment_intention, single_payment_attempt}, error_occured, is_live, refunded_amount_cents, is_captured, captured_amount, updated_at, is_settled, bill_balanced, is_bill, owner, parent_transaction`. Envelope `type` field is evidenced on the card-token callback (`"type": "TOKEN"` — `create-card-token.md:68`); the SKILL/cheatsheet state the transaction processed callback is JSON with nested `obj` (`SKILL.md:64-78`, `cheatsheet.md:108-113`). `payment_key_claims.extra` carries your `extras` (`cheatsheet.md:111`); `order.merchant_order_id` = your `special_reference` (`create-intention.md:139`, `refund.md:122`).

**GET response-callback full flat query-param list, verbatim from the documented sample URL** (`transaction-callbacks.md:54`):
`id, pending, amount_cents, success, is_auth, is_capture, is_standalone_payment, is_voided, is_refunded, is_3d_secure, integration_id, profile_id, has_parent_transaction, order, created_at, currency, merchant_commission, discount_details, is_void, is_refund, error_occured, refunded_amount_cents, captured_amount, updated_at, is_settled, bill_balanced, is_bill, owner, data.message, source_data.type, source_data.pan, source_data.sub_type, acq_response_code, txn_response_code, hmac`
(sample: `…?id=316004&pending=false&amount_cents=50000&success=true&…&order=378804&…&txn_response_code=APPROVED&hmac=8aa3e005…`). Note: this sample has no `merchant_order_id` (no special_reference was sent) — don't assume its presence.

---

## 4. HMAC-SHA512 verification

### Transaction callbacks — exact ordered key list (`hmac/hmac-transaction-callback.md:27-48`)

Concatenate the **values** of these keys in exactly this order (algorithm: lexicographic sort; POST = values from nested JSON body `obj`, GET = flat query params):

```
amount_cents
created_at
currency
error_occured
has_parent_transaction
obj.id        // POST (Processed)  |  id        // GET (Response)
integration_id
is_3d_secure
is_auth
is_capture
is_refunded
is_standalone_payment
is_voided
order.id      // POST (Processed)  |  order_id  // GET (Response)   ← see discrepancy note
owner
pending
source_data.pan
source_data.sub_type
source_data.type
success
```

Then: concatenate into one string (worked example `…2024-06-13T11:33:44.592345EGPfalsefalse19203…true` at `hmac-transaction-callback.md:55-58`) → `HMAC-SHA512(concatenated, HMAC_SECRET)` → hex digest (`hmac-transaction-callback.md:62`) → compare with the `hmac` received in **query parameters** (`hmac-transaction-callback.md:75-77`).

Handling rules (cheatsheet `cheatsheet.md:130-161`, states they are sourced from the HMAC doc page): booleans serialize as lowercase `true`/`false`; missing/null values concatenate as empty string; compare with `timingSafeEqual`.

**⚠️ Documented discrepancy to resolve in the plan**: the HMAC doc says the GET-key is `order_id`, but the documented sample GET callback URL carries **`order=378804`** (`transaction-callbacks.md:54`). The cheatsheet maps `order.id` → `params.order` for GET (`cheatsheet.md:158-160`). Real GET callbacks use `order`; the plan should read the `order` param (with a defensive fallback) and note the docs' internal conflict.

### Card-token callback (`hmac/hmac-for-card-tokens.md:23-32`)
POST JSON, `{}` of keys in order: `card_subtype, created_at, email, id, masked_pan, merchant_id, order_id, token`. Same SHA-512 + HMAC secret; `hmac` compared from query params (`hmac-for-card-tokens.md:58-60`). Payload sample `{"type":"TOKEN","obj":{"id":8555026,"token":"e98aceb9…","masked_pan":"xxxx-xxxx-xxxx-2346","merchant_id":246628,"card_subtype":"MasterCard","created_at":…,"email":…,"order_id":"264064419","user_added":false,"next_payment_intention":"pi_test_…"}}` (`create-card-token.md:65-83`). Token arrives at the same `notification_url` endpoint as transaction callbacks (`create-card-token.md:61-63`, `create-intention.md:141`).

### Subscription callback variant
Different scheme: HMAC = SHA-512 over the string `"{trigger_type}for{subscription_data.id}"`, and the `hmac` arrives **in the request body**, not query (`subscription/hmac-calculation-for-subscription-callback.md:87-115`).

---

## 5. Refund / Void / Capture

All three: header `Authorization: Token sk_…`, `Content-Type: application/json`, JSON body, `POST`. Response 200 = full transaction object (schema in §3). Callbacks fire for the parent transaction on each action; the action-transaction's `parent_transaction` holds the original transaction id (`refund.md:25-29`, `void.md:25-29`; fields at `refund.md:230` etc.).

| API | Endpoint | Body | Notes |
|---|---|---|---|
| Refund | `POST api/acceptance/void_refund/refund` | `transaction_id` (string, required, example `"574588"`); `amount_cents` (string, required, integer value — partial allowed) | 400 `{"message":"Requested Refund Amount is greater than the maximum refund amount permissible. Maximum Refund Amount is EGP 100.0"}` (`refund.md:33-45`); refund may fail on insufficient account balance (`common-issues-and-inquires.md:59-87`) |
| Void | `POST api/acceptance/void_refund/void` | `transaction_id` (string, required) | full-amount reversal of unsettled txn; same 400 shape (`void.md:35-45`) |
| Capture | `POST api/acceptance/capture` | `transaction_id` (string, required); `amount_cents` (string, required; may be partial) | only for Auth/Cap integrations: 400 `{"detail":"Capture amount cannot exceed auth amount"}`, 404 `{"detail":"Invalid transaction id"}` if the txn isn't a successful Auth (`capture.md:27-51`) |

Related: MIT charge on a saved card — `POST api/acceptance/payments/pay` with secret key; body `{source:{identifier:<card_token>, subtype:"TOKEN"}, payment_token:<payment_keys[0].key JWT from the intention>}` using a **Moto** integration (`mit.md:31-67`).

---

## 6. Transaction inquiry + auth token

Source: `references/docs/authentication-request-generate-auth-token-1.md`, `transaction-inquiry-apis/*.md`.

1. `POST api/auth/tokens`, body `{"api_key": "ZXlKaGJHY2l…"}` (`authentication-request-generate-auth-token-1.md:21-29`) → 200 `{profile:{id, user{…}, company_name, country, … enqueue noise …}, token:"ZXlKaGJHY2lPaUpJ…"}` (`:31-193`). **Token validity: 1 hour** ("Each auth token is valid for an hour" — `create-subscription-plan.md:62`).
2. **By transaction ID**: `GET api/acceptance/transactions/{transaction_id}` with `Authorization: Bearer <token>` (`by-transaction-id.md:29-39`). Response = full transaction object + extras (`id, pending, amount_cents, success, …, order{…, payment_status:"PAID"|"UNPAID", …}, paid_at, billing_data{…}, api_source, data{…}, is_live, owner, parent_transaction` — `by-transaction-id.md:41-242`).
3. **By order / merchant reference**: `POST api/ecommerce/orders/transaction_inquiry` — note the token goes **in the body**, not a header: body `{"auth_token": "…", "order_id": "212245716"}` and/or `{"merchant_order_id": "…"}` (optional pair; `merchant_order_id` = your `special_reference`) (`by-order-id-or-reference.md:25-35`). Returns the last transaction. If you skip `auth/tokens` (no API key), there is **no** intention-status inquiry in the mirror — NOT FOUND.

---

## 7. Test-mode specifics

Source: `need-help/faq/test-credentials.md` (page confirms "use test credentials … while using test integration IDs").

| Method | Values |
|---|---|
| Mastercard (2 cards) | `[CARD_REDACTED]`, `[CARD_REDACTED]` — Cardholder `Test Account`, expiry `01/39`, CVV `123` |
| Visa (1 card) | `[CARD_REDACTED]` — same holder/expiry/CVV |
| Mobile wallet | wallet number `[PHONE_REDACTED]`, MPin `123456`, OTP `123456` |

Classic error — 404 `Integration ID/Name does not exist in our system … Developers → Payment Integrations Tab`; four criteria (`create-intention.md:34-56`, hardened to 4 in `common-issues-and-inquires.md:39-57`): (1) ID belongs to your account, (2) ID's Test/Live status matches the secret key, (3) **pass the ID as integer, not string** (pitfall only in common-issues doc), (4) ID is well-configured (contact `[EMAIL_REDACTED]`). Currency rule: intention `currency` must equal the integration ID's currency (`create-intention.md:116`, `SKILL.md:86`); regions have fixed currency contexts (EGY=EGP etc.). 3DS: card types are configured per integration ID (Normal 3DS does bank-OTP during checkout — `cards-all-regions.md:43-57`); wallet test creds exist separately from cards. Dashboard "Enable or disable payment retries" is a **customer-facing** payment retry toggle, NOT a webhook retry setting (`getting-started/dashboard.md:91`, `new-dashboard.md:239`).

---

## 8. Webhook operational facts

- Delivery triggers: only when the transaction **succeeds or is declined** (`webhook-callbacks-and-hmac/overview.md:19`); additionally on Refund/Void/Capture actions (`webhook-testing-tool.md:15`).
- Signature location: `hmac` is a **query parameter** on every callback — including POST bodies and the GET redirect (`hmac-transaction-callback.md:75-77`, `hmac.md:17`). **Exception**: subscription callbacks carry `hmac` in the JSON **body** (`hmac-calculation-for-subscription-callback.md:15`).
- Callback URL configuration: per Integration ID in Dashboard → Developers → Payment Integrations → Edit → callback URLs (`getting-integration-credentials.md:77-89`). Per-intention overrides: `notification_url` (processed callback; **card integration IDs only**) and `redirection_url` (response callback; card + wallet only) (`create-intention.md:141-142`, `common-issues-and-inquires.md:167-179`). The `notification_url` endpoint receives BOTH transaction details and card-token objects for saved-card flows (`create-intention.md:141`, `create-card-token.md:61-63`).
- **Retry behavior on your endpoint failing: NOT DOCUMENTED in the mirror.** The only mentions are the glossary's integration-best-practice bullet "Must verify HMAC, support retries, and ensure idempotency" (`need-help/glossary.md:47,325`) — i.e., the mirror recommends your receiver be idempotent but defines no Paymob retry schedule/cadence. Treat documented-retry-policy as absent.
- **IP allowlist: NOT FOUND** anywhere in the mirror (no merchant-side IP allowlist doc; the only `IP` occurrence is the `profile.server_IP` response field, `authentication-request-generate-auth-token-1.md:118`).
- Testing tools: official webhook inspector `https://hooks.paymob.com/` (`webhook-testing-tool.md:19`); docs also recommend ngrok / Webhook.site / RequestBin / RequestWatch for local dev (`transaction-callbacks.md:75-79`).
- Fulfillment rule: process/fulfill ONLY on the processed callback after HMAC validates and `success == true` plus stored `amount_cents`/`currency` match; the GET redirect is display-only (`SKILL.md:70-74`).

---

## 9. Paymob-native subscriptions — scope note

Paymob **does** ship a native subscriptions module (docs under `references/docs/subscription/`, 15 pages). A **plan** (`POST api/acceptance/subscription-plans`, Bearer auth) defines `frequency` ∈ `{7, 15, 30, 60, 90, 180, 360}` days, `name`, `webhook_url`, `reminder_days`, `retrial_days`, `plan_type` (default `"rent"`), `number_of_deductions`, `amount_cents`, `use_transaction_amount`, `is_active`, `integration` (**required — must be a MIGS Moto integration ID for recurring charges**), `fee` (`create-subscription-plan.md:76-89`). A **subscription** is created implicitly: the customer completes one 3DS transaction via a normal intention carrying `subscription_plan_id` (+ optional `subscription_start_date`), which saves the card and binds it to the plan (`create-subscription.md:17-37`). Thereafter Paymob auto-debits on schedule (Moto/MIT) with retrial logic, and fires subscription callbacks (POST, `hmac` **in body**, HMAC over `"{trigger_type}for{id}"`, trigger catalog incl. `suspended/canceled/resumed/updated/Successful Transaction/Failed Transaction/Failed Overdue Transaction` — `hmac-calculation-for-subscription-callback.md:51-115`). Full REST surface: plan actions `GET/PUT api/acceptance/subscription-plans/{id}`, `POST …/{id}/suspend|resume`; subscription actions `GET/PUT api/acceptance/subscriptions/{id}`, `POST …/{id}/suspend|resume|cancel`, `GET …/{id}/card-tokens`, `POST …/{id}/delete-card`, `POST …/{id}/change-primary-card`, `GET …/{id}/last-transaction`, `GET …/{id}/transactions`, `POST …/{id}/register_webhook`. The subscription's own ID is retrievable from the subscription callback or via subscription inquiry keyed on the first 3DS transaction ID (`common-issues-and-inquires.md:187-195`). For Kottaby's plan this is almost certainly out of scope for a one-time payment, but the subscription callback flow reuses the same HMAC-secret + token machinery.

---

## Saved-cards scope note (for completeness)

`pay-with-saved-cards/`: (1) create token — pay once via Unified Checkout/Pixel with a Verification / Normal 3DS / Auth card integration; token arrives at `notification_url` as the TOKEN callback; (2) CIT — new intention with `card_tokens: string[]` (≤3), integration types Normal 3DS / Auth / Card On File, customer checks out showing saved card; (3) MIT — `POST api/acceptance/payments/pay` with `source.identifier = <token>`, `subtype: "TOKEN"` and `payment_token` from `payment_keys[0].key`, Moto integration (`create-card-token.md`, `cit.md`, `mit.md`).

---

## Known gaps / caveats in the mirror (plan author beware)

1. Full **processed-callback POST JSON example** is missing from the mirror (page said it was "on the right side"); the transaction-object schema must be taken from the refund/void/capture response schemas, which are complete and identical (`refund.md:64-231` et al.), plus the envelope hints (`obj.*`, `type`).
2. GET-callback HMAC key named `order_id` (HMAC doc) vs actual query param `order` (sample URL) — unresolved upstream inconsistency; code for `order`, note the doc.
3. Phone-number requiredness conflicts between `create-intention.md` (optional in table, required in its own error example) — treat as required.
4. `billing_data` "NA" placeholder is shown empirically, never stated as a rule.
5. No documented webhook retry policy and no IP allowlist in the mirror; unified-checkout URL has no documented locale/theme query params (dashboard customization only).
6. Auth-token TTL (1 hour) is stated only on the subscription-plan page.
