import fitz

from takehome.services.document import page_lines


def test_page_lines_gives_one_line_per_block_with_wrapped_lines_joined() -> None:
    page = fitz.open().new_page()
    page.insert_text((72, 300), "(a) there is no material breach;")  # written out of order on purpose
    page.insert_text((72, 200), "8.3.1 The Tenant may determine this Lease\non the Break Date.")
    assert page_lines(page) == [
        "8.3.1 The Tenant may determine this Lease on the Break Date.",
        "(a) there is no material breach;",
    ]
