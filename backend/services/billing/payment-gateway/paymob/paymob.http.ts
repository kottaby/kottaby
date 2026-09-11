/**
 * Paymob HTTP client — the outbound transport boundary of the gateway
 * adapter. One class over two injected dependencies (the resolved provider
 * configuration and a fetch-like transport) and zero shared state: a fresh
 * client is built per provider call and carries nothing between calls —
 * auth tokens are minted per use and never cached, because the vendor
 * expires them hourly and cross-call retention would be stale shared
 * mutable state.
 *
 * Transport semantics:
 *  - Every attempt runs under a per-attempt timeout (`AbortSignal.timeout`
 *    sized from the configured budget), so a hung upstream can never hold
 *    a request path open past the deployment's budget.
 *  - Retries are BOUNDED and granted only to failures that provably
 *    produced no provider side effect: a transport rejection that arrived
 *    without any response, or a 5xx status. A timed-out attempt is NEVER
 *    retried — the request was delivered and the provider may still be
 *    applying it, so its state is unknown and the safe recovery is the
 *    reconciliation sweep, not a second POST. A 4xx is a deterministic
 *    rejection and is never retried either.
 *  - Failures surface as typed, sanitized errors: the error carries the
 *    upstream HTTP status (or null when no response arrived) and a fixed
 *    generic message — upstream body content never enters an error
 *    message. Each failed attempt logs exactly one sanitized line
 *    (endpoint + status) for operations, never payload or credential
 *    material.
 *  - Responses are minimally validated: every member the integration
 *    consumes is presence- and type-checked before the typed DTO is
 *    built, so a response missing its contract members fails closed as a
 *    provider error instead of flowing `undefined` into money paths.
 *
 * Endpoints (vendor mirror): intention creation `POST v1/intention/`
 * (secret key via `Authorization: Token`), auth-token mint
 * `POST api/auth/tokens` (API key in the request body), transaction
 * inquiry `POST api/ecommerce/orders/transaction_inquiry` (minted token in
 * the request BODY — the Bearer-header form belongs to the
 * by-transaction-id endpoint this integration does not use).
 */

import { DomainError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type {
  PaymobAuthTokenResponse,
  PaymobIntentionRequest,
  PaymobIntentionResponse,
  PaymobResolvedConfig,
  PaymobTransactionInquiryResult,
} from "@/backend/types";

/** Vendor endpoint paths, relative to the configured API base host. */
const INTENTION_PATH = "/v1/intention/";
const AUTH_TOKEN_PATH = "/api/auth/tokens";
const TRANSACTION_INQUIRY_PATH = "/api/ecommerce/orders/transaction_inquiry";

/** Total send attempts per call: the initial attempt plus bounded retries. */
const MAX_HTTP_ATTEMPTS = 3;

/** Pause between retryable attempts — upstream outages recover in seconds, not milliseconds. */
const RETRY_DELAY_MS = 100;

/** Fixed, generic failure messages — upstream body material never enters an error message. */
const TRANSPORT_FAILURE_MESSAGE = "Payment provider could not be reached.";
const UPSTREAM_REJECTION_MESSAGE = "Payment provider rejected the request.";
const UNUSABLE_RESPONSE_MESSAGE = "Payment provider returned an unusable response.";
const RESPONSE_TIMEOUT_MESSAGE = "Payment provider did not respond in time.";

/**
 * The minimal transport contract the client consumes: a fetch-like
 * function over an explicit URL plus the request pieces the client
 * controls. The global fetch satisfies this structurally; tests inject a
 * recording stand-in instead.
 */
export type PaymobFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<Response>;

/** Narrows a parsed value to a plain object (arrays are not response objects). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Typed upstream failure. `status` is the sanitized upstream HTTP status,
 * or null when no response arrived (transport failure or timeout). The
 * message is a fixed generic sentence — no upstream body ever reaches it.
 */
export class PaymobUpstreamError extends DomainError {
  /** Upstream HTTP status when a response arrived; null for transport-level failures. */
  public readonly status: number | null;

  constructor(message: string, status: number | null) {
    super("SERVICE_UNAVAILABLE", message);
    this.status = status;
  }
}

/** One send attempt's verdict: a validated payload, a no-retry failure, or a retryable failure. */
type AttemptOutcome =
  | { kind: "success"; payload: Record<string, unknown>; httpStatus: number }
  | { kind: "terminal"; error: PaymobUpstreamError }
  | { kind: "retryable"; error: PaymobUpstreamError };

/** The transport the client uses when none is injected: the platform fetch. */
const defaultFetch: PaymobFetch = (url, init) => globalThis.fetch(url, init);

/** Resolves after the given delay — the bounded pause between retryable attempts. */
function pause(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/** One sanitized upstream-failure log line — endpoint + status only, never payload or credential material. */
function logUpstreamFailure(path: string, status: number | null, retrying: boolean): void {
  logger.logDomainError(retrying ? "Paymob upstream call failed; retrying" : "Paymob upstream call failed", {
    code: "SERVICE_UNAVAILABLE",
    entity: "paymob_http",
    endpoint: path,
    status,
  });
}

/** Reads one required string member off a validated response object. */
function readString(source: Record<string, unknown>, key: string, status: number): string {
  const value = source[key];
  if (typeof value !== "string") {
    throw new PaymobUpstreamError(UNUSABLE_RESPONSE_MESSAGE, status);
  }
  return value;
}

/** Reads one required number member off a validated response object. */
function readNumber(source: Record<string, unknown>, key: string, status: number): number {
  const value = source[key];
  if (typeof value !== "number") {
    throw new PaymobUpstreamError(UNUSABLE_RESPONSE_MESSAGE, status);
  }
  return value;
}

/** Reads one required boolean member off a validated response object. */
function readBoolean(source: Record<string, unknown>, key: string, status: number): boolean {
  const value = source[key];
  if (typeof value !== "boolean") {
    throw new PaymobUpstreamError(UNUSABLE_RESPONSE_MESSAGE, status);
  }
  return value;
}

/** Reads one required object member off a validated response object. */
function readRecord(source: Record<string, unknown>, key: string, status: number): Record<string, unknown> {
  const value = source[key];
  if (!isRecord(value)) {
    throw new PaymobUpstreamError(UNUSABLE_RESPONSE_MESSAGE, status);
  }
  return value;
}

/** Reads one string-or-null member off a validated response object. */
function readNullableString(source: Record<string, unknown>, key: string, status: number): string | null {
  const value = source[key];
  if (value !== null && typeof value !== "string") {
    throw new PaymobUpstreamError(UNUSABLE_RESPONSE_MESSAGE, status);
  }
  return value;
}

/**
 * Narrows the intention response into its typed DTO: the checkout-redirect
 * members (`id`, `client_secret`) plus the echo members the descriptor and
 * sanity checks read. Every member is presence-checked — a response
 * missing any of them is an upstream failure, not a half-filled DTO.
 */
function validateIntentionResponse(payload: Record<string, unknown>, status: number): PaymobIntentionResponse {
  const intentionDetail = readRecord(payload, "intention_detail", status);
  return {
    id: readString(payload, "id", status),
    intention_order_id: readNumber(payload, "intention_order_id", status),
    client_secret: readString(payload, "client_secret", status),
    special_reference: readString(payload, "special_reference", status),
    status: readString(payload, "status", status),
    confirmed: readBoolean(payload, "confirmed", status),
    intention_detail: {
      amount: readNumber(intentionDetail, "amount", status),
      currency: readString(intentionDetail, "currency", status),
    },
    created: readString(payload, "created", status),
    object: readString(payload, "object", status),
  };
}

/** Narrows the auth-token response to its one consumed member. */
function validateAuthTokenResponse(payload: Record<string, unknown>, status: number): PaymobAuthTokenResponse {
  return { token: readString(payload, "token", status) };
}

/**
 * Narrows the transaction-inquiry result into its typed DTO: the routing
 * members the reconciliation sweep needs (success/pending flags, cents
 * amount, correlation reference, action flags). Every member is
 * presence-checked; deep vendor objects the integration never reads are
 * deliberately not traversed.
 */
function validateInquiryResult(payload: Record<string, unknown>, status: number): PaymobTransactionInquiryResult {
  const order = readRecord(payload, "order", status);
  const sourceData = readRecord(payload, "source_data", status);
  return {
    id: readNumber(payload, "id", status),
    pending: readBoolean(payload, "pending", status),
    success: readBoolean(payload, "success", status),
    amount_cents: readNumber(payload, "amount_cents", status),
    created_at: readString(payload, "created_at", status),
    updated_at: readString(payload, "updated_at", status),
    currency: readString(payload, "currency", status),
    error_occured: readBoolean(payload, "error_occured", status),
    has_parent_transaction: readBoolean(payload, "has_parent_transaction", status),
    integration_id: readNumber(payload, "integration_id", status),
    profile_id: readNumber(payload, "profile_id", status),
    is_3d_secure: readBoolean(payload, "is_3d_secure", status),
    is_auth: readBoolean(payload, "is_auth", status),
    is_capture: readBoolean(payload, "is_capture", status),
    is_captured: readBoolean(payload, "is_captured", status),
    captured_amount: readNumber(payload, "captured_amount", status),
    is_refund: readBoolean(payload, "is_refund", status),
    is_refunded: readBoolean(payload, "is_refunded", status),
    refunded_amount_cents: readNumber(payload, "refunded_amount_cents", status),
    is_standalone_payment: readBoolean(payload, "is_standalone_payment", status),
    is_void: readBoolean(payload, "is_void", status),
    is_voided: readBoolean(payload, "is_voided", status),
    owner: readNumber(payload, "owner", status),
    order: {
      id: readNumber(order, "id", status),
      merchant_order_id: readNullableString(order, "merchant_order_id", status),
      amount_cents: readNumber(order, "amount_cents", status),
      currency: readString(order, "currency", status),
    },
    source_data: {
      pan: readString(sourceData, "pan", status),
      sub_type: readString(sourceData, "sub_type", status),
      type: readString(sourceData, "type", status),
    },
  };
}

/**
 * The stateless outbound transport for the Paymob gateway: intention
 * creation, auth-token minting, and the merchant-reference transaction
 * inquiry, each over the injected fetch boundary with bounded retry
 * semantics and sanitized typed failures.
 */
export class PaymobHttpClient {
  private readonly config: PaymobResolvedConfig;
  private readonly doFetch: PaymobFetch;

  constructor(args: { config: PaymobResolvedConfig; fetch?: PaymobFetch }) {
    this.config = args.config;
    this.doFetch = args.fetch ?? defaultFetch;
  }

  /** Creates a payment intention for one checkout; returns the validated vendor response. */
  async createIntention(body: PaymobIntentionRequest): Promise<PaymobIntentionResponse> {
    const { payload, httpStatus } = await this.post(INTENTION_PATH, body, {
      Authorization: `Token ${this.config.secretKey}`,
    });
    return validateIntentionResponse(payload, httpStatus);
  }

  /** Mints a fresh API auth token. Never cached — the vendor expires tokens hourly. */
  async mintAuthToken(): Promise<PaymobAuthTokenResponse> {
    const { payload, httpStatus } = await this.post(AUTH_TOKEN_PATH, { api_key: this.config.apiKey }, {});
    return validateAuthTokenResponse(payload, httpStatus);
  }

  /**
   * Runs the last-transaction inquiry for one merchant order reference. The
   * vendor authenticates this endpoint with the minted token in the request
   * BODY (not a Bearer header), so a fresh token is minted per inquiry —
   * nothing is retained between calls.
   */
  async transactionInquiryByMerchantRef(merchantReference: string): Promise<PaymobTransactionInquiryResult> {
    const { token } = await this.mintAuthToken();
    const { payload, httpStatus } = await this.post(
      TRANSACTION_INQUIRY_PATH,
      { auth_token: token, merchant_order_id: merchantReference },
      {}
    );
    return validateInquiryResult(payload, httpStatus);
  }

  /**
   * Sends one POST and applies the bounded retry policy: retryable
   * failures (no response received, 5xx) are retried up to the attempt
   * budget with a fixed pause; terminal failures (timeout on a delivered
   * request, 4xx, unusable response) throw immediately. Exactly one
   * sanitized log line accompanies each retried failure and the final
   * failure.
   */
  private async post(
    path: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<{ payload: Record<string, unknown>; httpStatus: number }> {
    const outcome = await this.sendWithRetries(path, body, headers, 1);
    if (outcome.kind === "success") {
      return { payload: outcome.payload, httpStatus: outcome.httpStatus };
    }
    logUpstreamFailure(path, outcome.error.status, false);
    throw outcome.error;
  }

  /**
   * Performs one send attempt and, for retryable failures, recurses through
   * the remaining attempt budget with a fixed pause between attempts. The
   * attempts are SEQUENTIAL by design (each retry only makes sense after
   * the previous one settled), hence the recursion instead of a loop.
   */
  private async sendWithRetries(
    path: string,
    body: unknown,
    headers: Record<string, string>,
    attemptNumber: number
  ): Promise<AttemptOutcome> {
    const outcome = await this.attempt(path, body, headers);
    if (outcome.kind !== "retryable" || attemptNumber >= MAX_HTTP_ATTEMPTS) {
      return outcome;
    }
    logUpstreamFailure(path, outcome.error.status, true);
    await pause(RETRY_DELAY_MS);
    return this.sendWithRetries(path, body, headers, attemptNumber + 1);
  }

  /** Performs exactly one send and classifies its outcome (no retry logic here). */
  private async attempt(path: string, body: unknown, headers: Record<string, string>): Promise<AttemptOutcome> {
    const signal = AbortSignal.timeout(this.config.httpTimeoutMs);
    let response: Response;
    try {
      response = await this.doFetch(`${this.config.apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal,
      });
    } catch {
      if (signal.aborted) {
        // The timeout fired with the request in flight: it was SENT and its
        // provider-side state is unknown — never retried, the sweep heals.
        return { kind: "terminal", error: new PaymobUpstreamError(RESPONSE_TIMEOUT_MESSAGE, null) };
      }
      return { kind: "retryable", error: new PaymobUpstreamError(TRANSPORT_FAILURE_MESSAGE, null) };
    }
    if (response.status >= 500) {
      return { kind: "retryable", error: new PaymobUpstreamError(UPSTREAM_REJECTION_MESSAGE, response.status) };
    }
    if (response.status < 200 || response.status >= 300) {
      return { kind: "terminal", error: new PaymobUpstreamError(UPSTREAM_REJECTION_MESSAGE, response.status) };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { kind: "terminal", error: new PaymobUpstreamError(UNUSABLE_RESPONSE_MESSAGE, response.status) };
    }
    if (!isRecord(payload)) {
      return { kind: "terminal", error: new PaymobUpstreamError(UNUSABLE_RESPONSE_MESSAGE, response.status) };
    }
    return { kind: "success", payload, httpStatus: response.status };
  }
}
