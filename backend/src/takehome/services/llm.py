from __future__ import annotations

from collections.abc import AsyncIterator

import structlog
from anthropic import AsyncAnthropic
from anthropic.types import DocumentBlockParam, MessageParam
from pydantic_ai import Agent

from takehome.config import settings
from takehome.db.models import Citation
from takehome.services.citations import page_boundaries, page_for_offset, split_blocks

logger = structlog.get_logger()

system_prompt = (
    "You are a helpful legal document assistant for commercial real estate lawyers. "
    "You help lawyers review and understand documents during due diligence.\n\n"
    "IMPORTANT INSTRUCTIONS:\n"
    "- Answer questions based on the document content provided.\n"
    "- Cite the passages of the document you rely on, so the reader can check them.\n"
    "- When referencing specific parts of the document, cite the relevant section or clause.\n"
    "- If the answer is not in the document, say so clearly. Do not fabricate information.\n"
    "- Be concise and precise. Lawyers value accuracy over verbosity.\n"
    "- When you reference specific content, mention the section, clause, or page."
)

agent = Agent(f"anthropic:{settings.llm_model}", system_prompt=system_prompt)

client = AsyncAnthropic()


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await agent.run(
        f"Generate a concise 3-5 word title for a conversation that starts with: '{user_message}'. "
        "Return only the title, nothing else."
    )
    title = str(result.output).strip().strip('"').strip("'")
    # Truncate if too long
    if len(title) > 100:
        title = title[:97] + "..."
    return title


async def chat_with_document(
    user_message: str,
    document_text: str | None,
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[str | list[Citation]]:
    """Stream a response to the user's message, yielding text chunks and then its citations.

    The document is sent as a document block with citations enabled, so the passages the
    answer is based on come back as ranges of its blocks, resolved to offsets and pages here.
    """
    # Add document context if available
    system = system_prompt
    blocks = split_blocks(document_text or "")
    document: DocumentBlockParam | None = None
    if document_text:
        document = {
            "type": "document",
            "source": {
                "type": "content",
                "content": [{"type": "text", "text": text} for _, text in blocks],
            },
            "citations": {"enabled": True},
            "cache_control": {"type": "ephemeral"},
        }
    else:
        system += (
            "\n\nNo document has been uploaded yet. If the user asks about a document, "
            "let them know they need to upload one first."
        )

    # Add conversation history
    messages: list[MessageParam] = []
    for msg in conversation_history:
        role = msg["role"]
        content = msg["content"]
        if role == "user":
            messages.append({"role": "user", "content": content})
        elif role == "assistant":
            messages.append({"role": "assistant", "content": content})

    # Add the current user message
    messages.append({"role": "user", "content": user_message})

    # Put the document on the first user turn, so the cached prefix is the same on every turn
    if document is not None:
        first = conversation_history[0]["content"] if conversation_history else user_message
        messages[0] = {"role": "user", "content": [document, {"type": "text", "text": first}]}

    async with client.messages.stream(
        model=settings.llm_model, max_tokens=4096, system=system, messages=messages
    ) as result:
        async for text in result.text_stream:
            yield text
        final = await result.get_final_message()

    # Resolve the cited blocks to character ranges and pages, skipping repeats
    boundaries = page_boundaries(document_text or "")
    citations: list[Citation] = []
    seen: set[tuple[int, int]] = set()
    for part in final.content:
        if part.type != "text":
            continue
        for c in part.citations or []:
            if c.type != "content_block_location":
                continue
            span = (c.start_block_index, c.end_block_index)
            if span in seen:
                continue
            seen.add(span)
            start = blocks[c.start_block_index][0]
            last_offset, last_text = blocks[c.end_block_index - 1]
            citations.append(
                Citation(
                    ordinal=len(citations) + 1,
                    page_number=page_for_offset(boundaries, start),
                    start_char=start,
                    end_char=last_offset + len(last_text),
                    cited_text=c.cited_text,
                )
            )

    logger.info(
        "Grounded answer",
        citations=len(citations),
        cache_creation_input_tokens=final.usage.cache_creation_input_tokens,
        cache_read_input_tokens=final.usage.cache_read_input_tokens,
    )
    yield citations
