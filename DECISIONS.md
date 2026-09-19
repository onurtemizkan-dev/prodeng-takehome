# Decisions

The app shows `N sources cited` under each answer. Turns out that number comes from `count_sources_cited` in `services/llm.py`, which is a regex over the model's own reply counting things like `section 3`. Nothing checks if those sections exist. Asking "What does Section 14 say about dilapidations?" on the sample lease gets "there is no Section 14" with `12 sources cited` (it listed Sections 1 to 10, plus Section 14 twice). And even when the answer is right, the lawyer still needs to open the PDF and find the clause anyway.

So I went with making the citations real and clickable, which is what the app already claims to do.

Summary:

- The document is sent to the API as a `document` block with citations enabled, so the passages an answer is based on come back as ranges into the text we sent, not as section numbers typed by the model.
- I first sent it as plain text, but the API's sentence chunking splits on things like "(Registration No. OC412987)", and one citation came back 1,800 characters long, starting mid-definition. Then I tried clause-sized blocks from a set of regexes, which worked on the three sample documents and not much else. The PDF already knows its paragraphs, so the blocks now come from PyMuPDF's layout blocks and the splitter is just a line split. Headers and footers are left in. PDFs don't mark them, any way of detecting them is a guess, and the model never cited one in testing anyway.
- Each citation is resolved to character offsets and a page (from the `--- Page N ---` markers we already store) and saved with the message. `sources_cited` is now just the number of them.
- Chips under the answer, one per citation. Hover shows the passage, click jumps the viewer to the page and highlights it (react-pdf's text renderer, matching letters and digits only). The clicked chip stays pressed.
- A clause that runs over a page break comes back as two citations. The second half starts with a lowercase letter on the next page, so it's joined onto the first.
- The chat call now uses the Anthropic SDK directly. PydanticAI doesn't expose citations yet (pydantic-ai#3126 is still open), and prompting the model to quote instead is the same problem again. Titles still use PydanticAI.
- `cache_control` on the document block. On the lease every turn after the first reads ~6.5k tokens from cache. Haiku 4.5 doesn't cache anything under 4,096 tokens, so the title report never gets cached, and nothing tells you that.

I skipped RAG, multiple documents, OCR and auth. The documents are 3 to 9 pages and fit in the context as they are, chunking would only lose information.

A few baseline things I fixed on the way:

- `fileConfig()` in `alembic/env.py` disables uvicorn's loggers on startup, so no traceback or access log ever showed. I only noticed because a crash in my own code was invisible. (`d263c1b`)
- Timestamps are stored in UTC and returned without an offset, so the browser read them as local and new chats showed "1h ago". (`83e0699`)
- Empty message bodies were accepted. (`efe2588`)

Tested:

- `just test`, 9 tests: page resolution, block splitting, and layout extraction on a PDF built in memory.
- Three conversations, one per sample document, 6 to 8 questions each, then the same 20 questions again in fresh conversations. It cited in 18 of 20 both times; the two it didn't are the two whose answer is not in the document. 58 citations, every one found on the page it points to. Reading each answer against its passages, every cited passage supports what the answer says. One answer (the dispute resolution steps) states two clauses without citing them. Checked by hand.

Known issues / not done:

- Tables and multi-column pages come out as one block per cell.
- A continuation starting with a capital or a digit isn't joined, so it shows as two chips.
- If a passage appears twice on a page, the highlight marks the first one.
- No size guard. A document over the context window gets the generic error message.
- Scanned pages with no text layer extract nothing, and the app then says no document was uploaded while the file is right there (baseline).
- Citations depend on the model seeing its earlier answers with their citations. History is replayed as plain text, which Haiku tolerates and Sonnet 5 does not: on the same 20 questions Sonnet cited in 5, all in the first two turns of a conversation. Replaying the assistant turns as content blocks with their citations fixes it (5 of 5 turns, twice, against the API directly). That needs the citations stored with their block indices, and a title on the document block.
- Still there from the baseline: a reply is lost if the client disconnects mid-stream, the sidebar only reorders on a title change, switching conversation mid-stream bleeds the reply into the other one, uploaded PDFs are never deleted, no auth.

Note: a real quote can still be attached to a claim it doesn't support. This only makes sure the quote exists and is one click away. Whether it actually supports the claim is the next thing to measure.

Next:

1. Replay assistant turns with their citation blocks, so the model is a setting and not a trap.
2. An eval script over the three documents: did it cite, was the page right, does the passage support the claim. Sonnet 5 cites more per answer and includes the surrounding clauses, at 3x the latency. Once 1 is done it is probably the better default.
3. Render all pages in the viewer instead of one at a time, so a highlight that runs over a page break is visible in one go.
4. Re-extract existing documents instead of asking for a re-upload.
5. Multiple documents per conversation.

I used Claude Code throughout, including for the research on the API and PydanticAI. Every line was read and most of it rewritten to fit the codebase.
