# twitter-monitor pinned snapshot

Upstream: https://github.com/BANKA2017/twitter-monitor
Branch: node
Pinned commit: dd8de94e3e2853beb7b5e5b785f1908c2cafea4b (2026-07-20)

upstream/libs and upstream/packages are copied with the original root package.json, README.MD and LICENSE. source-manifest.json records the original SHA-256 checksum of every copied file. Core.fetch.d.mts is our local type declaration.

Required compatibility patch: upstream Core.fetch.mjs imports _CommunityQuery and _CommunitiesSearchQuery, but its generated graphqlQueryIdList.js no longer exports them. Two undefined exports are appended to that generated file to permit module loading; no query ID is invented. Those non-home operations remain unavailable and are never called by our adapter. The original file prefix is byte-identical; local-patches.json records prefix length and resulting checksum. All original HTTP, TLS and For You configuration files remain unchanged.

The adapter calls the original postHomeTimeLine({cookie,count,cursor,isForYou:true}). Original coreFetch, axios-helper, TLS cipher reordering, User-Agent, default timeout and proxy environment handling are retained. No extra fingerprint, transaction-ID or anti-bot changes were added by this project. The authenticated home call does not enable guest/account pool flows.

The project's original no-fingerprint rule has an explicit user-approved exception for preserving upstream behavior during this evaluation. It is not a general authorization for new evasion code.

Only runtime dependencies needed by the imported core are installed; the upstream backend, crawler services and database are not started. Vendor helpers are file dependencies inside the existing x package, not new project workspace packages. Our DTO parser remains a separate adapter.

Version upgrades require a pinned revision, checksum review, offline fixtures and live authorized-account validation. Current queryId/features have not yet been proven against a live account.

Login integration: Core.function.d.mts is another local type declaration. Our dispatcher uses the original Login/getToken/getJsInstData/postFlowTask/Viewer functions. It calls getToken once rather than GuestToken retry loops, checks instrumentation errors before submission, and submits 2FA choice with correct cookies via postFlowTask instead of the upstream faulty att._twitter_sess access. Original source bytes and HTTP/TLS remain unchanged.
