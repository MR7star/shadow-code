# Tournament Backend Handoff

This document records backend behavior confirmed by inspecting `server/runner.mjs`,
`server/seasons.mjs`, and the existing tournament tests. It does not propose or
apply backend changes.

## Confirmed findings

- Tournament registration checks tournament existence, `registration` status,
  capacity, and duplicate membership. It does not compare the current time with
  the tournament's scheduled `startTime`.
- The tournament match-start route is shaped as
  `/api/tournaments/:tournamentId/matches/:matchId/start`, but the handler
  resolves the match using only `:matchId`; it does not verify that the match
  belongs to the path's `:tournamentId`.
- The tournament match-submit route has the same path-scope behavior: the
  handler resolves using `:matchId` and does not verify `:tournamentId`.
- `startTournamentMatch` returns an existing `arena_match_id` before running its
  participant/creator authorization check. The route invokes this helper and
  returns that result.
- There is no tournament-specific history endpoint or tournament leaderboard
  endpoint in the current router. The general Arena leaderboard is backed by
  Arena ratings and is not tournament ranking data.
- Tournament detail returns the `bracket` property (grouped rounds),
  `participants`, and `userContext`; there is no `rounds` property at the top
  level and no registration-deadline field.
- `GET /api/tournaments/:id/live` requires authentication and returns active
  matches. Its entries include `arenaMatchId`, participant objects, status, and
  `remainingSeconds`.
- Successful creation returns `{ success, tournamentId }`. Starting a
  tournament returns `{ success, totalRounds, bracketSize, participantsCount }`.
  Withdrawal returns `{ success }`. Reward claiming returns `{ success, rank,
  xpAwarded, titleAwarded }` from the helper; the route adds the sanitized
  progression `profile`.
- Most route-level errors use `{ error }`, with authentication failures as 401,
  creator authorization failures as 403, and many business-rule failures as
  400. Some unexpected exceptions return 500 with a route-specific error
  string.
- Tournament match submission delegates to the Arena submission pipeline. The
  response shape follows the Arena submit result; the route wraps unsuccessful
  outcomes as `{ error }` with HTTP 400.

## Recommendations for a backend phase

- Enforce scheduled registration cutoffs on the server, with a clearly defined
  boundary for `startTime` and consistent client-facing errors.
- Validate that each match belongs to the tournament ID in the route before
  starting or submitting it.
- Perform authorization before returning an existing active Arena match ID.
- If product requirements need these views, add explicit tournament history
  and tournament-specific standings endpoints rather than deriving them from
  the Ranked Arena leaderboard.
- Standardize success/error response shapes and document status codes for all
  tournament endpoints.
- Consider validating creation rewards and date inputs and returning the
  normalized values when clients need to display the effective configuration.
