# Omitted or partial features

Every catalog item that is not built, or is built in a reduced form, with the reason. Excluded by the owner (section 20): items 100 to 106, 120, 128, 130, all order and paper trading code.

| Item | Status | Reason |
| --- | --- | --- |
| 90 Reddit sentiment | Omitted | Owner could not get a Reddit API app (2026-10-18). Social signals use Bluesky Jetstream and Wikipedia pageviews instead. |
| HDS 13F reverse lookup (who holds a stock) | Partial | Free sources do not offer holder lists by stock; that needs parsing every 13F. HDS shows 13D/13G (5%+ owners) and insider filings about the company instead. |
| IMF DataMapper | Replaced | Returns 403 to automated clients. World Bank and FRED international series used instead. |
| 32 Max pain | Unavailable | Needs open interest. Alpaca's free options feed has none; Cboe's delayed JSON has it but automated-use terms are unconfirmed. |
| 30 IV rank and percentile | Partial | Needs an IV history; will build from daily snapshots stored by a job, starting from the first snapshot (no back history). |
| Unusual options activity (UOA) | Partial | Volume-based and delayed; volume vs open interest is not possible without open interest. |
| 94 FDA decision calendar | Omitted | No free official calendar of PDUFA dates; company press releases only. Clinical trials (TRIAL) cover the pipeline. |
| SOCL Bluesky search | Partial | Bluesky's search API now requires login; a live sample from the public Jetstream firehose is the fallback. |
