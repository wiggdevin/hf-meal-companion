# OpenRouter availability bench

The existing 2.5 Flash production pins return HTTP 404 under the application's unchanged provider flags (`data_collection: deny`, `zdr: true`, `require_parameters: true`). The already-vetted 3 Flash fallback and Plan pin return valid structured replies under those same flags. The candidate uses that available pin for coach, capture, voice fallback and onboarding extraction; credentials, vendors and privacy flags do not change.

Public transport fixture: return exactly `{"ok":true}` through the same strict JSON-schema/provider flags; temperature 0, maximum 512 tokens. Two attempts per model. No user or health context was sent. Only response content, finish reason, usage and timing were retained; credentials and headers were excluded.

| Model | HTTP outcomes | Valid expected replies | Latency ms |
|---|---|---:|---|
| google/gemini-2.5-flash | 404,404 | 0/2 | 284,84 |
| google/gemini-3-flash-preview | 200,200 | 2/2 | 1283,1249 |

This establishes availability and schema compatibility, not food-task accuracy or a privacy certification. Source public endpoint metadata was also retained: the 2.5 model listed AI Studio endpoints, while 3 Flash additionally listed Google endpoints. The request is never weakened to make a route answer.

The previous full R3 benchmark used the same 3 Flash pins as an explicit temporary overlay. The next full food/coach benchmark must use the candidate's actual source pins, without an overlay, and attach its measured accuracy, latency, cost and cleanup evidence before integration. Provider fallback conditions and attestation gates remain enforced.

## Voice fallback transport checks

Two isolated application probes used the real registered OpenRouter voice fallback with the unchanged provider flags. The harness simulated native Google HTTP403 to reach that fallback; it does not establish a real Google outage. WAV returned the expected 100 g cooked chicken breast in 3,557 ms ($0.000497). AAC/M4A returned the same expected amount in 2,514 ms ($0.000507). Both remained unconfirmed with alternatives. Account removal, session revocation and zero remaining uploaded media were verified for each probe. These checks establish the two audio formats on this route, not general food or voice accuracy; their scores stay outside the primary200 capture cohort.
