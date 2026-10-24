import json

from frametrail import custody


def chain(n: int = 5) -> list[dict]:
    log = custody.Log()
    for k in range(n):
        log.add(f"2026-09-30T02:0{k}:00", "Examiner 1", "step", f"EV-{k}", "ab" * 32)
    return json.loads(json.dumps(log.events))


def test_events_link_to_the_hash_before_them():
    events = chain()
    assert events[0]["prev"] == custody.GENESIS
    assert [e["prev"] for e in events[1:]] == [e["hash"] for e in events[:-1]]
    assert [e["seq"] for e in events] == [1, 2, 3, 4, 5]


def test_an_untouched_chain_verifies():
    assert custody.verify(chain()) is None
    assert custody.verify([]) is None


def test_an_edited_event_is_caught_at_its_own_seq():
    events = chain()
    events[2]["actor"] = "Someone else"
    assert custody.verify(events) == 3


def test_an_edit_with_a_recomputed_hash_breaks_the_next_link():
    events = chain()
    events[1]["action"] = "rewritten"
    events[1]["hash"] = custody._hash(events[1]["prev"], events[1])
    assert custody.verify(events) == 3


def test_a_deleted_event_is_caught():
    events = chain()
    del events[2]
    assert custody.verify(events) == 4


def test_swapped_events_are_caught():
    events = chain()
    events[1], events[2] = events[2], events[1]
    assert custody.verify(events) == 3


def test_the_hash_covers_every_field_but_hash_and_prev():
    e = chain(1)[0]
    base = custody._hash(custody.GENESIS, e)
    assert custody._hash(custody.GENESIS, {**e, "hash": "x", "prev": "y"}) == base
    assert custody._hash(custody.GENESIS, {**e, "sha256": "cd" * 32}) != base
    assert custody._hash("1" * 64, e) != base


def test_non_ascii_text_hashes_as_utf8():
    log = custody.Log()
    log.add("2026-09-30T02:00:00", "Examiner é", "Sealed", "EV-001", "ab" * 32)
    assert custody.verify(log.events) is None
