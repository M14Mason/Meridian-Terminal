# Update the portfolio (fallback, BUILD_PROMPT 17.4)

Use this when PORT shows the red "PORTFOLIO STALE" or "DISCONNECTED" banner and reconnecting Robinhood in PORT does not work.

## What the owner does

Open Claude Code in this repo (with the Robinhood connector enabled, read only) and say: **update the portfolio**.

## What Claude does (exact steps)

1. Use ONLY these read tools from the owner's Robinhood connector: `get_accounts`, then `get_equity_positions` (and `get_option_positions` and `get_crypto_positions` if the owner holds them). Never call any tool that places, cancels, exercises, creates, updates or removes anything.
2. Build one JSON object (do not print it in full in chat):
   `{"at": <unix ms>, "source": "fallback", "accounts": [{"id": "••••1234", "type": "...", "value": 0, "cash": 0}], "positions": [{"symbol": "AAPL", "type": "equity", "qty": 1, "avgCost": 0, "price": 0, "value": 0}], "notes": []}`
   * Account ids MUST be masked to the last 4 characters (the proxy rejects 5+ digit ids).
   * No names, addresses, emails or full account numbers.
3. Write it to a temporary file outside the repo, then post it with the admin token from the untracked `~/Meridian-Terminal/.env` (outside the repo) (never echo the token, never commit the file):

   ```bash
   set -a; . ~/Meridian-Terminal/.env; set +a
   curl -s -X POST "$PROXY_URL/api/portfolio/snapshot" -H "authorization: Bearer $MERIDIAN_ADMIN_TOKEN" -H "content-type: application/json" --data @"$TMPDIR/portfolio.json"
   rm -f "$TMPDIR/portfolio.json"
   ```

4. Expect `{"ok":true}`. PORT shows "Source: owner snapshot (fallback)" with the new time on every paired device.

## Privacy

The snapshot is stored encrypted in the proxy and served only to paired devices. It is never committed, logged or sent anywhere else.
