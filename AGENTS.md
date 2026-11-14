# E-Read design requirements

These are the user's agreed defaults for future E-Read work. Apply them without asking the user to repeat settled preferences. A newer explicit user instruction takes precedence. Keep this file aligned when the user changes a design decision.

## Direction and scope

- Retain the Netflix-inspired dark bookstore, neutral surfaces, yellow branding, and existing browsing/purchase flow.
- The Hazel Wood and Furthermore are the approved card design references. Their custom compositions currently apply only to their exact local cover paths; other books retain the standard card until their own treatment is prepared.
- For future custom cards, genre sets the mood, while the individual cover determines colours, motif, placement, and typography. Do not clone one composition across a genre or copy fantasy foliage onto unrelated books.
- Fill the top Featured books row first as the user supplies real titles. Use the persisted catalog order when adding real titles. The original eight synthetic entries are archived and must not be restored to browsing or reseeded. Preserve other ordering; the current row contains the first seven books. Those slots are now filled by the seven supplied titles; preserve this selection unless the user requests a change.
- Archived books remain in MongoDB for existing purchases, history, reader access, and pending-order reconciliation; exclude them from catalog listings, carts, and new checkout. Below Featured, use a static Explore the collection grid with a Find your next read heading and genre filter chips derived only from that collection. Do not repeat the seven Featured titles; hide the collection when empty.
- Visual work must preserve account isolation, cart, ownership, reader access, admin controls, and verified payment/recovery behavior.

## Explore the collection cards

- Use five equal, fluid-width collection columns at 1280px and wider, three from 768px, two from 360px, and one below 360px. Fill the available catalog width rather than capping these cards at the Featured shelf's 224px.
- Collection cards are the complete, uncropped cover in an equal 2:3 portrait frame with subtle rounded corners. No extended text panel, sculpted lettering, or catchphrases in this section. Small cover-derived motifs and translucent rear/front edge arcs are allowed for the requested collection depth treatment. Featured and global search keep their existing card treatment.
- Overlay title, author, and price on a soft transparent-to-near-black bottom vignette; extend it upward as needed on narrow screens. No separate text panel. Use bold Bricolage titles (up to three lines), small authors, and restrained yellow prices; Fable uses a pale mint title.
- Keep information visible at rest on touch screens. Hover and keyboard focus noticeably but briefly lift the collection card 6px, scale it 1.015, and tilt it about 4 degrees horizontally/2 degrees vertically. Front motifs move forward and up 5px, with an additional small 3px motif glide; rear arcs counter-move 2px. Use 300ms transitions, a stronger soft shadow, and no bounce, pulsing, or perpetual movement. Deepen the vignette while keeping text legible. Preserve native button activation, complete accessible labels, local covers, and the shared cover fallback.
- Collection depth stays distinct from Featured: one small artwork motif, thin translucent arcs, flat overlay typography, no wrapping title or hook trail. Keep motifs clear of faces and information, with at most 10px protrusion and pointer-events:none/aria-hidden decoration. Failed or replaced cover/motif artwork uses the clean cover-only card. Use exact local cover paths and no external runtime assets or animation dependencies.
- The decorated-card requirements below apply to Featured/search, not the cover-only collection.

## Card structure and artwork

- Keep equal responsive card widths, 2:3 cover frames, and reserved title/hook/author slots. Authors and prices must line up across a shelf, including cards without hooks or with different cover proportions.
- Display complete cover artwork without stretching or destructive cropping. Store covers and prepared decorative assets locally; do not introduce remote image dependencies.
- Blend the lower cover into the card rather than leaving a hard horizontal cutoff: keep the upper 80% opaque, fade through approximately 87% and 95%, and reach transparency at the bottom. Fade the cover layer only; titles and foreground decoration stay crisp. No blur.
- Let the underlying card colour show through the fade, including during hover tint changes.

## Titles: large sculpted lettering, no ribbon

- Make the title the strongest typographic layer. Use large lettering flowing side to side across its own card, shallow letter arcs/perspective, and muted cover-coloured extrusion shadows.
- The wrapping effect comes from the letters themselves. **No background band, ribbon, label plate, folded ends, or rectangular backdrop behind the title.**
- Keep letters upright enough to scan, in original reading order, with natural word wrapping. Never stretch text to fit or use aggressive full-S curves.
- Current references: Hazel Wood uses bold upright Cormorant Garamond 700 with teal depth and a slight leftward tilt; Furthermore uses Cal Sans with muted green depth and the opposite tilt.
- Preserve the current enlarged title allocation: responsive 22–30px type, 72px slot, 21px upward overlap, and width extending through the copy padding. Keep movement contained to the card's own visual space.
- Align sculpted title content to the bottom of its slot. Keep the title and hook visually connected, not separated by a large blank area.

## Catchphrases and supporting text

- Keep Cormorant Garamond Medium Italic for hooks, approximately 19px, with a muted cover-derived tint. Keep authors around 15px with a smaller, quieter “by”; prices remain steady and readable.
- Hooks are optional original promotional phrases, not invented book quotations. Preserve the existing 100-character limit and metadata order: title, hook, author, price.
- For custom compositions, gently stagger whole hook words by about 2–3px with normal spaces and natural wrapping. Keep letter orientation readable. No continuous wave animation.
- Preserve the approved tight spacing: flowing hooks have 3px top padding and 1.35 line height. Do not restore the previous 12–15px top padding or vertically centre the title in its oversized slot.
- Keep author/price alignment when adjusting title-to-hook spacing. Avoid compensating with a large empty gap elsewhere.

## Cover-specific depth and placement

- Use actual prepared cover cutouts with lightweight SVG stems where appropriate. Export raster cutouts at least twice their maximum rendered width.
- Show distinct rear, foreground, and curling-tip sections so elements visibly weave around the cover and toward the hook, rather than sitting like a corner sticker.
- Hazel Wood: soft teal branch climbing the left edge. Furthermore: angular green lower-right diagonal sweep.
- Wicked Like a Wildfire: local `/covers/wicked.webp`, coral flower cutouts in an upper-edge floral sweep with a descending right-side stem, upright bold Cormorant title and plum depth. Keep its longer title within two lines and the existing slot.
- With the Fire on High: Fiction, local `/covers/fireonhigh.jpg`, citrus-and-herb cutouts along the lower-left edge with a restrained steam-like curve, bold Bricolage title and warm coral depth. Keep the portrait and cover lettering unobstructed.
- The Color Project: Romance, local `/covers/colorproject.jpg`, a fine gold upper-left loop with coral flower cutouts and a smaller lower-right flourish. Use a warm gold bold Cormorant title, keeping its composition distinct from the other books.
- Magic Bitter, Magic Sweet: Fantasy, local `/covers/bittersweet.jpg`, pale-blue thorn loops wrapping the mid-right edge, with mint Cormorant lettering and blue depth. Preserve its two-line title and the shared metadata alignment.
- Weyward: Historical, local `/covers/weyward.jpg`, cover-derived butterfly cutouts on a low botanical sweep with a smaller upper-right perch. Use cream uppercase Cormorant lettering with moss-green depth; do not obscure the raven.
- Use two differently cropped/scaled/rotated foliage groups per reference card. Do not repeat the same cutout three times or give both cards the same route.
- Keep title, hook letters, author, and price unobstructed. Limit protrusion to 10px; prevent clipping in shelves and overlap with adjacent cards.
- Match prepared treatments by exact cover path. Failed/replaced artwork must return to the clean standard card, including ordinary title/hook rendering and no custom fade or foliage.

Fable for the End of the World (Ava Reid, Sci-Fi, 2025) starts Explore the collection at catalog position eight. Use supplied local `/covers/fableworld.jpg`, cover-extracted `/covers/decorations/fable-vine.png`, asymmetric cyan vines with magenta rear depth, and pale mint Bricolage titles. Its long title may use three compact lines within the unchanged 72px slot. Keep both portraits unobstructed. The original hook is "Hunted by the world. Drawn to each other." Keep the Rp25,000 sandbox price and shared sample reader.

What Feeds Below (Tatiana Schlote-Bonne, 2026) follows Fable at catalog position nine, using supplied local `/covers/feedsbelow.jpg`. This horror-fantasy title uses the existing Fantasy category. Keep the cover-only collection treatment, Rp25,000 sandbox price, and shared sample reader; its collection mushroom-cap cutout and warm amber edge arcs. Its optional original hook is "Some depths should stay unexplored."

Nous deviendrons l'ouragan (Margot Dessenne, Sci-Fi, 2026) follows at position ten, using supplied `/covers/Nous.jpg`. Extracted `/covers/decorations/collection-nous-butterfly.png` and violet/magenta arcs frame the upper-right edge. What Feeds Below uses `/covers/decorations/collection-feeds-mushroom.png` at the upper-left edge; Fable reuses its cyan leaf at the mid-right edge. Preserve five-column desktop sizing, the static overlay text, Rp25,000 sandbox prices, and the shared sample reader.

The Dancer and the Dream Thief (Rowenna Miller, Fantasy, 2026) is fourth in the collection at catalog position eleven. Use supplied `/covers/dreamthief.jpg`, extracted `/covers/decorations/collection-dream-lilac.png` near the upper-left edge, and gold/lilac Art Deco angular wrapping paths. Keep the original optional hook "Every dream has its price.", Rp25,000 sandbox price, and shared sample reader.

A World Apart (Meghan Nesmith, Fantasy, 2026) is fifth in the collection at catalog position twelve. Use supplied `/covers/worldapart.jpg`, extracted `/covers/decorations/collection-world-gold.png` at the mid-left edge, and orange-gold/blue portal-like arcs. Keep its distinct paths, existing stronger hover treatment, optional original hook "A love between worlds. A spell that could break them.", Rp25,000 sandbox price, and shared sample reader.

## Featured shelf carousel

- All Featured cards use the same stronger 300ms hover/focus language as the collection: 6px lift, 1.015 scale, 4-degree horizontal/2-degree vertical tilt, stronger soft shadow, 5px front-layer lift, 2px opposing rear movement, and 3px/1.04 motif glide. Alternate tilt direction across cards. Keep the original compositions, sculpted title/hook rendering, touch resting layers, and continuous carousel; do not apply this shelf-specific change to global search. Reserve rail padding for the larger motion. No bounce or perpetual card motion.
- Featured books loops left continuously at 30px/second when its seven-book set overflows. Search results and Explore the collection stay static; preserve the selected books and their order.
- Keep autoplay moving during hover, keyboard focus, touch, wheel scrolling, clicks, and open book/login dialogs. No interaction pause or idle restart delay.
- Do not show a Play/Pause button or pause for interaction. Suspend offscreen and in hidden tabs without a catch-up jump.
- Keep native swipe/scroll. Replace navigation arrows with a small muted "Scroll to explore ↔" hint aligned right of the Featured heading, shown only on desktop when the shelf overflows. Mouse-wheel and trackpad input over the shelf scroll it horizontally, looping in either direction even while a card has keyboard focus; retain Ctrl+wheel browser zoom. Ease wheel/trackpad movement into a gentle glide (about 300ms to travel 95% of each gesture) using the existing animation loop, while keeping 30px/second autoplay active. Reverse promptly on opposite input; discard pending wheel momentum when touch takes over or the shelf is hidden. Do not add GSAP or another animation dependency. Looping copies must be clickable but excluded from tab order and screen readers; restore detail-dialog focus to the corresponding original card.
- Use native browser APIs and existing dependencies; leave card artwork, typography, sizes, and purchase behavior intact. This continuous shelf movement is an explicit exception to the brief-motion default below.

## Motion, accessibility, and checks

- Keep brief native CSS/WAAPI motion active independently of Windows reduced-motion settings, as the user requested. Prefer restrained 250–350ms hover/focus transitions; no perpetual waving or flashing.
- Keep the layered composition visible at rest on touch devices. Preserve one-tap opening and equivalent keyboard focus effects; decorative layers never intercept input.
- Hide decorative foliage and split letter/word rendering from assistive technology. Preserve the complete original title and hook once in the accessible card label. Keep the card a real keyboard-operable button.
- Reuse installed fonts, CSS, and dependencies. Do not add a font family, animation library, schema field, or backend endpoint for a presentation-only adjustment.
- For presentation changes, run lint and the relevant existing checks; run the full suite for behavior changes. Verify build when appropriate and safe. Never rebuild into the active production preview directory while its server is running; stop only E-Read's frontend first, preserving backend/ngrok.
- Check desktop, narrow mobile, keyboard focus, and 200% zoom for readable text, intact artwork, tight title/hook spacing, aligned metadata, and unclipped decorations. Report browser checks as unverified when they were unavailable; a passing build is not visual acceptance.

## Opened book dialogs

- Retain the shared editorial layout, specs and features, with restored individual cover-coloured backgrounds and local decorations for the supplied twelve books. Exact-cover artwork lives in book-detail-art.js; unknown/replaced/failed artwork retains the adaptive neutral baseline. Featured and collection artwork remain separate.
- BookDetailModal accepts optional themeColor as a 3/6-digit hex colour. Otherwise reuse local cover hue extraction; missing, failed, grayscale or inaccessible artwork uses neutral styling. Expose --book-theme-color and derive a 12%-opacity bottom-right radial glow and readable pale accents.
- Use bold Cormorant titles and large serif closing hooks, maintaining the gentle final-word wrap and a single accessible original hook. Use the individual cover SVG and small local cutout when available, otherwise a generic currentColor constellation. Keep five subtle 12-18-second floating/fading particles. Raster motifs render no larger than half source width. Decorations are aria-hidden and pointer-events:none. The ambient particles are an explicit exception to the brief-motion default.
- Directly beneath the author, show a two-column Edition details definition grid (Format, Pages, Publisher): 10px uppercase labels, 12px values, and a faint divider. Missing values say Not specified. These describe the referenced published edition, not the shared demo text.
- Store optional format (100 chars), publisher (200 chars), and pages (integer 1-100000 or null) through admin forms, save recovery, API validation and catalog parsing. Research the supplied edition when adding books; retain source evidence, never guess or mix editions, and leave unresolved fields unspecified. No automatic metadata service.
- Desktop purchase signature remains below the cover; mobile order is cover, details, purchase. No enclosing box or filled action backgrounds. Keep the large price, raised Rp, Make it yours underline/arrow animation, quiet cart action, Sandbox checkout and shared sample notice. Add Multi-device and Offline reading ? planned pills above the purchase action. Offline is not implemented; multi-device means browser access, not offline synchronization.
- Preserve full descriptions, negative space, native dialog focus/Escape, account isolation, cart, ownership, checkout and recovery behavior. Allow scrolling for long content, small screens and zoom. Verify desktop/mobile/200% zoom when available; report unverified browser checks honestly.

## Main navigation

- Use a near-black sticky cinema-style header with an ivory E-Read wordmark/yellow accent, central rounded search, quiet Genres dropdown, bag/count control and initials profile avatar. Apply subtle translucency/blur after scrolling.
- Mobile keeps logo, search toggle, cart and account on one row; expanded search sits below, with a compact Genres control beneath. Preserve live search and selected filters.
- Profile links target the existing Profile, Library, Orders and Settings sections; do not add empty destination pages. Native dropdowns dismiss outside/on Escape, preserve keyboard focus and have 44px primary targets. Keep existing account-scoped cart/session behavior.
