from takehome.services.citations import page_boundaries, page_for_offset, split_blocks


def _doc(*pages: tuple[int, str]) -> str:
    # Same shape upload_document() produces: a marker plus text per non-empty page, joined by blank lines.
    return "\n\n".join(f"--- Page {n} ---\n{body}" for n, body in pages)


def test_offset_zero_is_first_page() -> None:
    text = _doc((1, "alpha"), (2, "beta"))
    assert page_for_offset(page_boundaries(text), 0) == 1


def test_offset_inside_later_page() -> None:
    text = _doc((1, "alpha"), (2, "beta"), (3, "gamma"))
    assert page_for_offset(page_boundaries(text), text.index("gamma")) == 3


def test_offset_on_marker_line_belongs_to_that_page() -> None:
    text = _doc((1, "alpha"), (2, "beta"))
    assert page_for_offset(page_boundaries(text), text.index("--- Page 2")) == 2


def test_last_character_is_last_page() -> None:
    text = _doc((1, "alpha"), (2, "beta"))
    assert page_for_offset(page_boundaries(text), len(text) - 1) == 2


def test_skipped_blank_pages_keep_real_numbers() -> None:
    # upload_document() drops pages with no text, so marker numbers can jump.
    text = _doc((1, "alpha"), (3, "gamma"))
    assert page_for_offset(page_boundaries(text), text.index("gamma")) == 3


def test_no_markers_resolves_to_none() -> None:
    assert page_for_offset(page_boundaries("just text"), 4) is None


def test_split_blocks_gives_one_block_per_line_without_markers() -> None:
    text = _doc((1, "1.1 The Tenant shall keep the Premises in repair.\n1.2 Next clause."), (2, "1.3 Last clause."))
    assert [t for _, t in split_blocks(text)] == [
        "1.1 The Tenant shall keep the Premises in repair.\n",
        "1.2 Next clause.\n",
        "1.3 Last clause.",
    ]


def test_split_blocks_offsets_index_into_the_text() -> None:
    text = _doc((1, 'Section 1 — Definitions\n"the Term" means fifteen years;\n(a) a sub-clause'), (2, "2.1 Demise"))
    assert all(text[o : o + len(t)] == t for o, t in split_blocks(text))
