# Phase 5C Backend Handoff — Guilds

This handoff records source-confirmed behavior and recommended follow-up. Recommendations are not claims of defects; no backend changes were made in Phase 5C.1.

## 1. Guild detail reads run maintenance

- **Confirmed behavior:** `getGuildDetails()` calls `ensureGuildWeeklyReset(guildId)` and `checkGuildAchievements(guildId)` before assembling the response. `GET /api/guilds/:guildId` calls this function.
- **Recommendation:** Keep ordinary detail reads read-only; move maintenance to an explicit or scheduled write/maintenance path.
- **Why it matters:** A GET may update weekly counters or unlock achievement rows, making repeated reads stateful.
- **Suggested tests:** Snapshot relevant guild/member/achievement rows before and after detail GET and assert they are unchanged; test maintenance separately for idempotence.

## 2. Guild profile reads may also run maintenance

- **Confirmed behavior:** `getUserGuildProfile()` calls `getGuildDetails()` for a member, so `GET /api/guilds/me` can trigger the same maintenance.
- **Recommendation:** Return the profile from read-only queries; invoke scheduled maintenance independently.
- **Why it matters:** Profile refreshes are common after navigation and mutations and should not be the implicit maintenance scheduler.
- **Suggested tests:** Assert repeated profile GETs do not mutate guild, member, or achievement data.

## 3. Weekly reset uses a stored week marker

- **Confirmed behavior:** Guild records store `weekly_reset_week`; `ensureGuildWeeklyReset()` compares it with the current UTC week and resets weekly values when different. Activity recording also invokes the reset.
- **Recommendation:** Centralize a safe, transactional, idempotent reset operation independent of GET.
- **Why it matters:** Reads and writes currently serve as lazy maintenance triggers; concurrent boundary requests need deterministic behavior.
- **Suggested tests:** Cover week transition, repeated reset, concurrent reset, and activity arriving at the week boundary.

## 4. Achievement checks can occur during reads

- **Confirmed behavior:** `checkGuildAchievements()` is called by detail retrieval as well as progression/mutation flows and inserts newly satisfied achievement records.
- **Recommendation:** Keep unlock checks on authoritative progression/mutation paths or a dedicated maintenance process. Retain uniqueness/idempotency protections.
- **Why it matters:** A read may create achievement state; write ownership is less clear and can complicate exactly-once behavior.
- **Suggested tests:** Verify read-only endpoints do not create achievements and parallel progression checks unlock each achievement once.

## 5. Quest completion and claimability are not represented by one authoritative field

- **Confirmed behavior:** Guild detail responses include `id`, `questKey`, `questType`, `title`, `description`, `targetValue`, `currentValue`, `progressPercent`, `xpReward`, `status`, optional `userContribution`, and completion/claim timestamps. They do not include `claimable`. Progress updates normally set `status` to `completed` once the target is reached. The claim endpoint rejects `claimed` quests and otherwise accepts either `status === 'completed'` or `current_value >= target_value`; successful claims return `success`, `xpAwarded`, and a quest object with claimed status/timestamp. Thus, an in-progress status at/above target is accepted by the claim endpoint even though the normal progression path should mark it completed.
- **Current frontend handling:** The quest board displays backend status and numeric progress separately. It only presents Claim Reward when the backend status is `completed` and the viewer is a guild member; it does not infer claimability from progress. For `in-progress`, it shows neutral guidance that claim availability is not included in the status. A rejected request displays the backend error. Successful claims display the returned `xpAwarded` and refresh guild details, profile, and progression data. If a claim completes after navigating to a different guild, the old response does not update that guild view or show a stale toast.
- **Limitation:** The response cannot distinguish `completed` but not eligible from `completed` and claimable (nor express claimability for any status). The UI uses `completed` only as the existing action signal, while the endpoint remains authoritative and can reject. Conversely, an inconsistent `in-progress` row at target may be accepted by the backend but is not offered a claim action in the UI.
- **Recommendation:** Keep completion status transitions authoritative and consistent, and expose an explicit claimability field or a distinct claim-ready status if the UI must reliably gate the action. Keep the endpoint authoritative and return a stable structured error for ineligible/already-claimed requests.
- **Suggested tests:** Verify status and claimability below target, exactly at target, completed, claimed, and during concurrent claims; assert a mismatched in-progress-at-target row is either transitioned or explicitly represented.

## 6. Achievement response has no locked-progress data

- **Confirmed behavior:** Guild details return unlocked achievements with identifying text/icon and `unlockedAt`; there are no locked achievements or progress fields.
- **Recommendation:** Add progress/eligibility fields only if a locked-achievement UI is desired.
- **Why it matters:** The frontend cannot accurately render locked progress from current data.
- **Suggested tests:** Contract tests for unlocked and locked achievement progress, if introduced.

## 7. User context is not a fine-grained permission map

- **Confirmed behavior:** `userContext` provides membership, role, leader/officer flags, and pending invite/request booleans. It does not provide per-action capabilities.
- **Recommendation:** Consider explicit action permissions if product UX needs to accurately enable/disable controls before requests.
- **Why it matters:** Role alone does not encode every restriction (for example, officer kick restrictions). Backend authorization must remain authoritative regardless.
- **Suggested tests:** Role/action permission matrix and endpoint authorization tests.

## 8. Invitation path guild scope should be validated

- **Confirmed behavior:** Accept/reject routes include `guildId` and `inviteId`, but the runner calls `respondToInvite(session.id, inviteId, accept)` without passing the route guild ID. The function looks up the invitation by ID and user.
- **Recommendation:** Verify that the invitation belongs to the path guild, or remove the redundant path component in a future versioned contract.
- **Why it matters:** The URL's guild identifier is not currently part of the helper's authorization check. The invite ID and authenticated user are still checked by the helper.
- **Suggested tests:** Attempt to accept/reject an invite through a mismatched guild path and assert rejection; preserve normal accept/reject behavior.

## 9. Error response conventions vary

- **Confirmed behavior:** Business failures generally return HTTP 400 with `{ error }`; unauthenticated protected calls return 401; create/invite/kick/role/transfer catch some exceptions and return endpoint-prefixed 500 errors. Other operations have different local catch behavior.
- **Recommendation:** Standardize validation, authorization, conflict, and server error response shapes/statuses.
- **Why it matters:** Clients can present reliable actionable errors and distinguish user-correctable failures from server failures.
- **Suggested tests:** Endpoint contract tests for malformed JSON, validation, authorization, conflicts, missing records, and unexpected errors.

## Scope note

Phase 5C.1 preserves all existing paths, methods, request payloads, and backend response contracts. These items are deferred to the project owner's backend phase.
