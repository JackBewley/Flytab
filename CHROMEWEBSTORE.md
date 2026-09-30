# Chrome Web Store Listing — Flytab

Last updated: 2026-09-30. Planning draft based on v0.6.5. The user reports creating a publisher account. Exact public publisher name, contact verification and trader status remain unconfirmed. No dashboard item, upload or submission has been performed by this task. Remaining recommendations are not approvals.

## Readiness and release plan

Flytab is a working Manifest V3 extension with no runtime dependencies, external connections, analytics or account. The last focused release passed 111 checks; see TESTING.md. A final submission pass still needs to cover the chosen browser/OS support policy, physical shortcut use, first installation, restart/update behavior, permission wording and an appropriate large-history performance check. The manifest targets Chrome 121, but that version could not be verified on this Mac. Current evidence is primarily macOS Chrome 151/153; Windows/Linux release claims need their own validation.

1. Choose the publishing identity/account, support contact, policy hosting, price, supported platforms and launch visibility.
2. Prepare listing copy, a store icon, promotional tile, screenshots, a public privacy policy and reviewer instructions.
3. Finish the release checks and decide whether to label the public release 1.0.0. That version number is a recommendation, not a store requirement.
4. Store packaging is prepared: run `python3 scripts/package.py --store` to generate `dist/Flytab-0.6.5-store.zip`. It has manifest.json at the root and excludes internal documentation. The existing download bundle remains separate. Archive integrity and byte equality to the source are checked during packaging; final release testing remains outstanding.
5. Publisher account creation is reported complete by the user. Confirm two-step verification, publisher name, verified contact email and any outstanding identity/trader requirements in the dashboard; these details have not been inspected.
6. Upload the store ZIP, complete listing/privacy/distribution/test fields and submit for review. Recommendation: unlisted pilot, then public visibility on the same listing. All visibility modes require review; only Public provides normal store discovery. Deferred publishing can separate approval from launch.

Google says most reviews take a few days, but some take a few weeks. Account verification or a requested correction can add time. Approval and store ranking are not guaranteed.

## Decisions outstanding

| Decision | Recommendation / remaining input |
|---|---|
| Publishing identity and owning Google account | User to choose personal or Creative Method ownership, exact publisher name and account. |
| Name and positioning | Keep Flytab; describe its purpose clearly as returning to the previous tab across windows. Review final listing wording before upload. |
| Price | Recommend free for the initial release. No payment/licensing flow exists. |
| Platform support | Recommend macOS-focused launch with explicit tested support; validate Windows/Linux before making broader claims. Resolve the minimum-Chrome compatibility claim. |
| Visibility | Recommend a short unlisted pilot followed by Public, which is needed for search/discovery. |
| Contact and policy hosting | Support email confirmed: support@creativemethod.com. Policy hosted at https://gitlab.com/-/snippets/6063775; public access and policy text verified without authentication on 2026-09-30. |
| Regions and primary language | English is implemented. Recommend broad distribution after completing applicable account/trader declarations. Region selection remains unconfirmed. |

Open-source licensing is a separate, optional decision; it is not necessary to publish the existing extension.

## Store Listing

Extension name: Flytab (matches current manifest).

Short description: Jump straight back to your previous Chrome tab, across windows.

Single purpose: Switch between recently used open Chrome tabs across browser windows.

Primary language: English.

Category: Choose the closest current productivity/workflow category in the live dashboard; older templates use category names that may differ.

Detailed description — draft, pending support details and final platform scope:

Flytab takes you straight back to the Chrome tab you were just using, even when it is in another window.

On Mac, tap Option+F to switch to your previous tab. Tap it again to return. Clicking the Flytab toolbar icon does the same thing.

For an older tab, hold Option+Shift and press F to open a compact list of recent tabs. Keep both modifiers held and tap F to move through the list, then release both to switch. Tab names and icons make the destination easy to recognize. Escape cancels; clicking an entry or pressing Enter also selects it. The current tab appears first and the previous tab starts selected.

Pin Flytab in Chrome's Extensions menu for convenient access. You can change both shortcuts through Flytab's Options page and Chrome's shortcut settings. If a shortcut is already in use, assign an available one there.

Your recent-tab order stays on your device. Flytab has no analytics, account or server and does not send your tab information elsewhere. It uses information about currently open tabs to show the switcher; it does not access Chrome's saved browsing history or read webpage contents. Chrome may describe its required tabs permission as reading browsing history.

The visual shortcut is designed to be held while choosing. If you release it before Chrome focuses the list, Enter or a click selects the highlighted entry. Use Option+F for an immediate previous-tab tap. Incognito tabs are excluded. The toolbar icon refreshes its light/dark appearance when the list or settings opens.

Support contact: support@creativemethod.com (provided by user).

## Graphics & Assets

| Asset | Dimensions | Status | File / plan |
|---|---|---|---|
| Store icon | 128×128 PNG | Existing PNG; store presentation needs review | icons/icon-128.png; preserve the approved mark, assess store padding and contrast independently of the toolbar sizes. |
| Screenshot 1 | 1280×800 | Prepared; not uploaded | store/assets/01-previous-tab.png — quick-toggle message and real shortcut settings. |
| Screenshot 2 | 1280×800 | Prepared; not uploaded | store/assets/02-recent-tabs.png — actual toolbar switcher with safe demonstration tab titles and cross-window previous selection. |
| Screenshot 3 | 1280×800 | Prepared; not uploaded | store/assets/03-dark-switcher.png — actual dark switcher. |
| Small promotional tile | 440×280 | Prepared; not uploaded | store/assets/promo-440x280.png — approved mark and Flytab name on slate blue. |
| Marquee promotional tile | 1400×560 | Optional; not created | Not required for initial submission. |

Current Google guidance requires an icon, at least one screenshot and the small promotional tile. The skill's older template labels the small tile optional; use the current official requirement. Store assets are now prepared from real extension captures; see store/README.md and store/captures/provenance.json. Image dimensions and PNG validity were checked, and full-size and half-size previews were visually reviewed. Store assets must show the shipped UI and contain no private browsing data. Avoid unsupported superlatives and claims of Google affiliation.

## Permissions Justification

| Permission | Type | Justification |
|---|---|---|
| tabs | permissions | Show the names of currently open tabs in the recent-tab switcher, identify destinations across windows, and keep recent-tab order in step with tab activation/closure. Flytab does not use Chrome's History API or access webpage contents. |
| storage | permissions | Keep recent-tab IDs, their order and the current switcher's selection in temporary session storage so switching survives background-worker suspension. Also retain temporary session identity and a recoverable toolbar-error flag. |
| favicon | permissions | Display each tab's recognizable icon from Chrome's local favicon cache, without downloading icons from websites. |

No host permissions or content scripts. No offscreen permission. No remote code: every executable file is bundled. Commands, action and windows APIs add no separate permission entries.

## Privacy & Data Use

Technical facts verified from the current source; final dashboard classifications must be matched to the live form's definitions before submission.

| Information | Local handling | Off-device transmission / sharing |
|---|---|---|
| Open-tab titles, URLs and associated icon information | Read live to label/filter tabs and request local cached favicons; not persisted by Flytab. | None by the extension. |
| Tab activation and last-access timing | Used to maintain/reconstruct recent-tab order. | None. |
| Tab/window IDs, recent order, active picker/session identity and toolbar-error flag | Temporary chrome.storage.session state; includes frozen picker IDs/selection and source/window information. | None; no storage.sync. |
| Webpage contents, cookies, passwords and saved Chrome browsing history | Not read. Open-tab metadata can itself contain sensitive text; explain the actual metadata access without claiming no data is used. | None. |
| Analytics, advertising identifiers, remote crash reports and account details | Not collected by the extension. | None. |

Session state is cleared on browser exit or extension reload/disable/removal; worker suspension alone does not clear it. Local processing is still user-data handling for the privacy policy. Do not copy a generic policy saying no browsing information is ever accessed or stored.

Data-use certifications supported by the current code: no sale to third parties; no use beyond tab switching; no use for creditworthiness/lending. Complete the dashboard's actual attestations only during the authorized submission process.

## Privacy Policy

Public URL: https://gitlab.com/-/snippets/6063775

Verified on 2026-09-30: the snippet page and public raw endpoint are accessible without authentication. Published text matches PRIVACY.md (ignoring surrounding whitespace).

Policy text prepared in PRIVACY.md from current source, with the confirmed support contact. It covers on-device metadata access and temporary recent order, retention/deletion, no extension transmission/sale/analytics, support emails, hosting and policy changes. Published by the user to the public GitLab snippet above; recheck access before submission. Keep the policy and dashboard disclosures consistent.

## Distribution

Visibility: undecided; recommended Unlisted pilot → Public.
Regions: undecided; recommended broad distribution subject to accurate required account declarations.
Pricing: undecided; recommended Free initially.
Store ID and listing URL: not created/known.

## Developer Info

Publisher name: pending.
Owning developer Google account: pending.
Verified public contact email: pending.
Support URL/email: support@creativemethod.com (confirmed by user).
Privacy policy hosting: https://gitlab.com/-/snippets/6063775 (public access verified). Homepage: not specified.
Developer registration: complete per user report on 2026-09-30. Two-step verification and remaining account setup: not checked.
Required identity/trader declarations: not checked; answer according to the publisher's actual circumstances.

## Version History

| Version | Date | Changes | Store status |
|---|---|---|---|
| 0.6.5 | 2026-09-29 | Refresh icon when visible UI opens; remove continuous appearance watcher. | Local development release; not submitted by this task. |

## Review Notes

Testing instructions to include: open at least three ordinary tabs across two Chrome windows and visit each; pin Flytab; confirm/assign shortcuts; use Option+F twice to toggle; hold Option+Shift+F, repeat F, release both to commit across windows; test Escape and a row click. Settings opens from the toolbar context menu. No credentials, account or helper app is required. Review the unpinned fallback as well.

Known limitations: macOS-first evidence; Chrome 121 compatibility unverified; extremely fast full release before focus cannot be recovered; unpinned/unsupported action popups use a separate window; toolbar appearance may be stale between openings; custom browser themes can differ from system light/dark preference; incognito excluded. Switching support is within Chrome, not a system-wide hotkey.

Rejection history: none known; no submission performed.

## Official references checked

- [Register](https://developer.chrome.com/docs/webstore/register)
- [Account setup](https://developer.chrome.com/docs/webstore/set-up-account)
- [Two-step verification](https://developer.chrome.com/blog/policy-update-2sv)
- [Prepare the ZIP](https://developer.chrome.com/docs/webstore/prepare)
- [Images](https://developer.chrome.com/docs/webstore/images)
- [Privacy policy requirement](https://developer.chrome.com/docs/webstore/program-policies/privacy)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Submission and deferred publishing](https://developer.chrome.com/docs/webstore/publish)
- [Review timing](https://developer.chrome.com/docs/webstore/review-process)
